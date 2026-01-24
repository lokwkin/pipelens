import asyncio
import pytest
from typing import Any, Literal
from unittest.mock import AsyncMock

from pipelens.pipeline import Pipeline
from pipelens.step import StepMeta
from pipelens.transport.base_transport import Transport


# Mock Transport implementation for testing
class MockTransport(Transport):
    def __init__(self):
        self.initiate_run = AsyncMock()
        self.finish_run = AsyncMock()
        self.initiate_step = AsyncMock()
        self.finish_step = AsyncMock()

    async def initiate_run(self, pipeline_meta: Any) -> None:
        pass

    async def finish_run(
        self, pipeline_meta: Any, status: Literal["completed", "failed", "running"]
    ) -> None:
        pass

    async def initiate_step(self, run_id: str, step: StepMeta) -> None:
        pass

    async def finish_step(self, run_id: str, step: StepMeta) -> None:
        pass


@pytest.mark.asyncio
class TestPipeline:
    """Test cases for the Pipeline class"""

    async def test_constructor_basic(self):
        """Test creating a pipeline with just a name"""
        pipeline = Pipeline("test-pipeline")
        assert pipeline.get_name() == "test-pipeline"
        assert pipeline.get_key() == "test-pipeline"

    async def test_run_id_generation(self):
        """Test that a run ID is generated if not provided"""
        pipeline = Pipeline("test-pipeline")
        assert pipeline.get_run_id() is not None
        assert isinstance(pipeline.get_run_id(), str)

    async def test_custom_run_id(self):
        """Test that a provided run ID is used"""
        run_id = "custom-run-id"
        pipeline = Pipeline("test-pipeline", options={"run_id": run_id})
        assert pipeline.get_run_id() == run_id

    async def test_auto_save_without_transport(self):
        """Test that an error is raised when auto_save is enabled but no transport is provided"""
        with pytest.raises(
            ValueError, match="Transport must be provided when auto_save is enabled"
        ):
            Pipeline("test-pipeline", options={"auto_save": "real_time"})

    async def test_auto_save_with_transport(self):
        """Test that no error is raised when auto_save is enabled and transport is provided"""
        transport = MockTransport()
        pipeline = Pipeline(
            "test-pipeline", options={"auto_save": "real_time", "transport": transport}
        )
        assert pipeline.auto_save == "real_time"
        assert pipeline.transport is transport

    async def test_track_steps(self):
        """Test tracking steps and returning results"""
        pipeline = Pipeline("test-pipeline")

        async def test_func(st):
            result1 = await st.step(
                "step1", lambda _: asyncio.sleep(0.001, result="result1")
            )
            assert result1 == "result1"
            return "final-result"

        result = await pipeline.track(test_func)
        assert result == "final-result"

        # Check the nested structure
        hierarchy = pipeline.output_nested()
        assert hierarchy.name == "test-pipeline"
        assert len(hierarchy.substeps) == 1
        assert hierarchy.substeps[0].name == "step1"
        assert hierarchy.substeps[0].result == "result1"

    async def test_handle_errors(self):
        """Test handling errors in tracked steps"""
        pipeline = Pipeline("test-pipeline")
        error_message = "test error"

        async def test_func(st):
            async def raise_error(_):
                await asyncio.sleep(0.001)
                raise ValueError(error_message)

            await st.step("step1", raise_error)
            return "final-result"

        with pytest.raises(ValueError, match=error_message):
            await pipeline.track(test_func)

    async def test_auto_save_real_time(self):
        """Test that transport methods are called when auto_save is 'real_time'"""
        transport = MockTransport()
        transport.initiate_run = AsyncMock()
        transport.finish_run = AsyncMock()
        transport.initiate_step = AsyncMock()
        transport.finish_step = AsyncMock()

        pipeline = Pipeline(
            "test-pipeline", options={"auto_save": "real_time", "transport": transport}
        )

        async def test_func(st):
            await st.step("step1", lambda _: asyncio.sleep(0.001, result="result1"))
            return "final-result"

        await pipeline.track(test_func)

        await asyncio.sleep(0.1)  # Give time for transport to flush

        # Check that transport methods were called
        assert transport.initiate_run.call_count == 1
        pipeline_meta_arg = transport.initiate_run.call_args[0][0]
        assert pipeline_meta_arg.run_id == pipeline.get_run_id()
        assert pipeline_meta_arg.name == "test-pipeline"

        # Check step initiations (should be 2: one for pipeline, one for step1)
        assert transport.initiate_step.call_count == 2

        # Check step completions (should be 2: one for step1, one for pipeline)
        assert transport.finish_step.call_count == 2

        # Check run finish
        assert transport.finish_run.call_count == 1
        finish_run_args = transport.finish_run.call_args[0]
        assert finish_run_args[0].run_id == pipeline.get_run_id()
        assert finish_run_args[1] == "completed"  # Status should be 'completed'

    async def test_auto_save_real_time_with_error(self):
        """Test that run is marked as failed when a step throws an error"""
        transport = MockTransport()
        transport.initiate_run = AsyncMock()
        transport.finish_run = AsyncMock()
        transport.initiate_step = AsyncMock()
        transport.finish_step = AsyncMock()

        pipeline = Pipeline(
            "test-pipeline", options={"auto_save": "real_time", "transport": transport}
        )

        error_message = "test error"

        async def test_func(st):
            async def raise_error(_):
                await asyncio.sleep(0.001)
                raise ValueError(error_message)

            await st.step("step1", raise_error)
            return "final-result"

        with pytest.raises(ValueError, match=error_message):
            await pipeline.track(test_func)

        await asyncio.sleep(0.1)  # Give time for transport to flush

        # Check that finishRun was called with 'failed' status
        assert transport.finish_run.call_count == 1
        finish_run_args = transport.finish_run.call_args[0]
        assert finish_run_args[1] == "failed"  # Status should be 'failed'

    async def test_auto_save_finish(self):
        """Test that only finishRun is called when auto_save is 'finish'"""
        transport = MockTransport()
        transport.initiate_run = AsyncMock()
        transport.finish_run = AsyncMock()
        transport.initiate_step = AsyncMock()
        transport.finish_step = AsyncMock()

        pipeline = Pipeline(
            "test-pipeline", options={"auto_save": "finish", "transport": transport}
        )

        async def test_func(st):
            await st.step("step1", lambda _: asyncio.sleep(0.001, result="result1"))
            await st.step("step2", lambda _: asyncio.sleep(0.001, result="result2"))
            return "final-result"

        await pipeline.track(test_func)

        await asyncio.sleep(0.1)  # Give time for transport to flush

        # Check that only finishRun was called
        assert transport.initiate_run.call_count == 0
        assert transport.initiate_step.call_count == 0
        assert transport.finish_step.call_count == 0
        assert transport.finish_run.call_count == 1

        # Verify all steps are included in the pipeline metadata
        pipeline_meta = transport.finish_run.call_args[0][0]
        assert len(pipeline_meta.steps) == 3  # pipeline + 2 steps
        step_names = [step.name for step in pipeline_meta.steps]
        assert "step1" in step_names
        assert "step2" in step_names

    async def test_inheritance_from_step(self):
        """Test that Pipeline inherits functionality from Step"""
        pipeline = Pipeline("test-pipeline")

        # Test record method from Step
        await pipeline.record("test-key", "test-value")
        records = pipeline.get_records()
        assert records["test-key"] == "test-value"

        # Test event handling from Step
        events = []

        async def record_listener(*args):
            events.append(("step-record", args[0], args[1], args[2]))

        pipeline.on("step-record", record_listener)
        await pipeline.record("another-key", "another-value")
        await asyncio.sleep(0.1)  # Give event time to process

        assert len(events) == 1
        assert events[0][1] == pipeline.get_key()
        assert events[0][2] == "another-key"
        assert events[0][3] == "another-value"

    async def test_output_pipeline_meta(self):
        """Test that outputPipelineMeta returns the correct structure"""
        pipeline = Pipeline("test-pipeline")
        pipeline_meta = pipeline.output_pipeline_meta()

        assert pipeline_meta.run_id == pipeline.get_run_id()
        assert pipeline_meta.name == "test-pipeline"
        assert pipeline_meta.key == "test-pipeline"
        assert pipeline_meta.log_version == 1
        assert isinstance(pipeline_meta.steps, list)

    async def test_output_pipeline_meta_with_steps(self):
        """Test that outputPipelineMeta includes all steps"""
        pipeline = Pipeline("test-pipeline")

        async def test_func(st):
            await st.step("step1", lambda _: asyncio.sleep(0.001, result="result1"))
            await st.step("step2", lambda _: asyncio.sleep(0.001, result="result2"))
            return "final-result"

        await pipeline.track(test_func)

        pipeline_meta = pipeline.output_pipeline_meta()

        # Should contain the pipeline itself and two steps
        assert len(pipeline_meta.steps) == 3
        step_names = [step.name for step in pipeline_meta.steps]
        assert "test-pipeline" in step_names
        assert "step1" in step_names
        assert "step2" in step_names
