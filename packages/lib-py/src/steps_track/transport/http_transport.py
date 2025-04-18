import asyncio
import aiohttp
import time
import json
from typing import List, Optional, Literal
from pydantic import BaseModel

from ..step import StepMeta
from ..pipeline import PipelineMeta
from .base_transport import Transport


class LogEvent(BaseModel):
    type: Literal['initiate-run', 'finish-run', 'initiate-step', 'finish-step']
    run_id: Optional[str] = None
    pipeline_meta: Optional[PipelineMeta] = None
    step: Optional[StepMeta] = None
    status: Optional[Literal["completed", "failed", "running"]] = None

    model_config = {
        # Use Pydantic's alias generator for camelCase JSON keys if needed
        # For simplicity here, we'll rely on server adapting or customize serialization
        "arbitrary_types_allowed": True
    }


class HttpTransportOptions(BaseModel):
    base_url: str
    batch_logs: bool = False
    flush_interval_seconds: float = 3.0
    max_batch_size: int = 100
    debug: bool = False
    max_retries: int = 3


class HttpTransport(Transport):
    def __init__(self, **kwargs):
        self.options = HttpTransportOptions(**kwargs)
        self.base_url = self.options.base_url if self.options.base_url.endswith('/') else f"{self.options.base_url}/"
        self.headers = {'Content-Type': 'application/json'}
        self._event_cache: List[LogEvent] = []
        self._flush_task: Optional[asyncio.Task] = None
        self._active_flushes = 0
        self._background_tasks: set[asyncio.Task] = set()  # Track all background tasks
        self._lock = asyncio.Lock()  # To protect access to event_cache and flush task creation

        if self.options.batch_logs:
            self._start_flush_timer()

    def _start_flush_timer(self):
        if self._flush_task is None or self._flush_task.done():
            async def periodic_flush():
                while True:
                    await asyncio.sleep(self.options.flush_interval_seconds)
                    await self.flush_events()
            self._flush_task = asyncio.create_task(periodic_flush())
            self._background_tasks.add(self._flush_task)  # Track this task too
            if self.options.debug:
                print(f"[HttpTransport] Flush timer started (interval: {self.options.flush_interval_seconds}s)")

    async def _stop_flush_timer(self):
        if self._flush_task and not self._flush_task.cancelled():
            self._flush_task.cancel()
            try:
                await self._flush_task  # Wait for cancellation to complete
            except asyncio.CancelledError:
                if self.options.debug:
                    print("[HttpTransport] Flush timer stopped.")
            self._flush_task = None

    async def _send_events_with_retry(self, events: List[LogEvent]):
        if not events:
            return

        self._active_flushes += 1
        retry_count = 0
        payload = []

        # Transform events into the server-expected format
        for event in events:
            if event.type == 'initiate-run':
                payload.append({
                    "type": "pipeline",
                    "operation": "start",
                    "meta": event.pipeline_meta.model_dump(by_alias=True) if event.pipeline_meta else None
                })
            elif event.type == 'finish-run':
                payload.append({
                    "type": "pipeline",
                    "operation": "finish",
                    "meta": event.pipeline_meta.model_dump(by_alias=True) if event.pipeline_meta else None,
                    "status": event.status
                })
            elif event.type == 'initiate-step':
                payload.append({
                    "type": "step",
                    "operation": "start",
                    "runId": event.run_id,
                    "step": event.step.model_dump(by_alias=True) if event.step else None
                })
            elif event.type == 'finish-step':
                payload.append({
                    "type": "step",
                    "operation": "finish",
                    "runId": event.run_id,
                    "step": event.step.model_dump(by_alias=True) if event.step else None
                })

        payload_json = json.dumps(payload)  # Serialize once

        try:
            # Create a single session outside the retry loop
            async with aiohttp.ClientSession(headers=self.headers) as session:
                while retry_count <= self.options.max_retries:
                    try:
                        target_url = f"{self.base_url}api/ingestion/batch"
                        async with session.post(target_url, data=payload_json) as response:
                            response.raise_for_status()  # Raise exception for bad status codes (4xx or 5xx)
                            if self.options.debug:
                                print(f"[HttpTransport] Successfully sent {len(events)} events")
                            return  # Success
                    except aiohttp.ClientError as e:
                        print(f"Error sending batched events: {e}")
                        if self.options.debug:
                            print(f"[HttpTransport] Failed to send {len(events)} events: {e}")

                        if retry_count >= self.options.max_retries:
                            if self.options.debug:
                                print(
                                    f"[HttpTransport] Max retries ({self.options.max_retries}) exceeded. Dropping {len(events)} events.")
                            break

                        # Calculate backoff time but check for a testing flag in options
                        backoff_time = 0.001 if getattr(self.options, "_testing", False) else 1 * (2 ** retry_count)
                        if self.options.debug:
                            print(
                                f"[HttpTransport] Scheduling retry in {backoff_time}s (attempt {retry_count + 1}/{self.options.max_retries})")

                        await asyncio.sleep(backoff_time)
                        retry_count += 1
                        if self.options.debug:
                            print(
                                f"[HttpTransport] Retrying batch of {len(events)} events (attempt {retry_count}/{self.options.max_retries})")
        finally:
            self._active_flushes -= 1

    async def flush_events(self):
        async with self._lock:
            if not self._event_cache:
                return

            events_to_send = list(self._event_cache)  # Copy the list
            self._event_cache.clear()  # Clear the cache immediately

        if self.options.debug:
            print(f"[HttpTransport] Flushing {len(events_to_send)} events to {self.base_url}api/ingestion/batch")

        # Create and track the background task
        task = asyncio.create_task(self._send_events_with_retry(events_to_send))
        self._background_tasks.add(task)
        # Remove the task from our set when it's done
        task.add_done_callback(self._background_tasks.discard)

    async def _flush_if_cache_full(self):
        if self.options.batch_logs and len(self._event_cache) >= self.options.max_batch_size:
            await self.flush_events()  # Flush immediately if cache is full

    async def initiate_run(self, pipeline_meta: PipelineMeta):
        if self.options.batch_logs:
            async with self._lock:
                self._event_cache.append(LogEvent(type='initiate-run', pipeline_meta=pipeline_meta))
            await self._flush_if_cache_full()
            return

        # Non-batched mode
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.post(f"{self.base_url}api/ingestion/pipeline/start", json=pipeline_meta.model_dump(by_alias=True)) as response:
                    response.raise_for_status()
        except aiohttp.ClientError as e:
            print(f"Error initiating run: {e}")
            raise ConnectionError(f"Failed to initiate run: {e}")

    async def finish_run(self, pipeline_meta: PipelineMeta, status: Literal["completed", "failed", "running"]):
        if self.options.batch_logs:
            async with self._lock:
                self._event_cache.append(LogEvent(type='finish-run', pipeline_meta=pipeline_meta, status=status))
            await self._flush_if_cache_full()
            return

        # Non-batched mode
        payload = {"pipelineMeta": pipeline_meta.model_dump(by_alias=True), "status": status}
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.post(f"{self.base_url}api/ingestion/pipeline/finish", json=payload) as response:
                    response.raise_for_status()
        except aiohttp.ClientError as e:
            print(f"Error finishing run: {e}")
            raise ConnectionError(f"Failed to finish run: {e}")

    async def initiate_step(self, run_id: str, step: StepMeta):
        if self.options.batch_logs:
            async with self._lock:
                self._event_cache.append(LogEvent(type='initiate-step', run_id=run_id, step=step))
            await self._flush_if_cache_full()
            return

        # Non-batched mode
        payload = {"runId": run_id, "step": step.model_dump(by_alias=True)}
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.post(f"{self.base_url}api/ingestion/step/start", json=payload) as response:
                    response.raise_for_status()
        except aiohttp.ClientError as e:
            print(f"Error initiating step: {e}")
            raise ConnectionError(f"Failed to initiate step: {e}")

    async def finish_step(self, run_id: str, step: StepMeta):
        if self.options.batch_logs:
            async with self._lock:
                self._event_cache.append(LogEvent(type='finish-step', run_id=run_id, step=step))
            await self._flush_if_cache_full()
            return

        # Non-batched mode
        payload = {"runId": run_id, "step": step.model_dump(by_alias=True)}
        try:
            async with aiohttp.ClientSession(headers=self.headers) as session:
                async with session.post(f"{self.base_url}api/ingestion/step/finish", json=payload) as response:
                    response.raise_for_status()
        except aiohttp.ClientError as e:
            print(f"Error finishing step: {e}")
            raise ConnectionError(f"Failed to finish step: {e}")

    async def flush_and_stop(self):
        """Flush any remaining events and stop the background timer."""
        if self.options.debug:
            print("[HttpTransport] flush_and_stop called.")

        # Stop the timer first to prevent new scheduled flushes
        await self._stop_flush_timer()

        # Flush any remaining events
        await self.flush_events()

        # Wait briefly for any active flush tasks initiated by flush_events to potentially complete
        # We check active_flushes count. This is a basic way to wait, might need refinement.
        wait_start = time.time()
        while self._active_flushes > 0 and (time.time() - wait_start) < 5:  # Wait max 5 seconds
            if self.options.debug:
                print(f"[HttpTransport] Waiting for {self._active_flushes} active flushes to complete...")
            await asyncio.sleep(0.1)

        # Wait for all background tasks to complete
        if self._background_tasks:
            if self.options.debug:
                print(f"[HttpTransport] Waiting for {len(self._background_tasks)} background tasks to complete...")
            # Create a list of tasks to wait for
            pending_tasks = list(self._background_tasks)
            if pending_tasks:
                # Wait with a timeout to avoid hanging forever
                done, pending = await asyncio.wait(pending_tasks, timeout=5.0)
                # Cancel any tasks that didn't complete in time
                for task in pending:
                    task.cancel()

        if self._active_flushes > 0 and self.options.debug:
            print(f"[HttpTransport] Warning: {self._active_flushes} flushes might still be in progress after waiting.")
        elif self.options.debug:
            print("[HttpTransport] All flushes completed.")
