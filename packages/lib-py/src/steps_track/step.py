import time
import re
# import asyncio # No longer needed here
from typing import Any, Callable, Dict, List, Optional, Union, Awaitable
from io import BytesIO
from pydantic import BaseModel
from pyee.asyncio import AsyncIOEventEmitter
from .chart import (
    generate_execution_graph_quickchart,
    generate_gantt_chart_quickchart,
    generate_gantt_chart_google,
    TimeSpan,
    GraphItem,
    GanttChartArgs
)


class TimeMeta(BaseModel):
    startTs: int
    endTs: Optional[int] = None
    timeUsageMs: Optional[int] = None


class StepMeta(BaseModel):
    name: str
    key: str
    time: TimeMeta
    records: Dict[str, Any] = {}
    result: Optional[Any] = None
    error: Optional[str] = None


class NestedStepMeta(StepMeta):
    substeps: List['NestedStepMeta'] = []


class StepGanttArg(BaseModel):
    unit: Optional[str] = None
    min_height: Optional[int] = None
    min_width: Optional[int] = None
    filter: Optional[Union[str, List[str]]] = None


# Type aliases for listener function signatures
RecordListener = Callable[[str, Any, Optional[StepMeta]], Optional[Awaitable[None]]]
StepStartListener = Callable[[str, Optional[StepMeta]], Optional[Awaitable[None]]]
StepSuccessListener = Callable[[str, Any, Optional[StepMeta]], Optional[Awaitable[None]]]
StepErrorListener = Callable[[str, Exception, Optional[StepMeta]], Optional[Awaitable[None]]]
StepCompleteListener = Callable[[str, Optional[StepMeta]], Optional[Awaitable[None]]]
StepRecordListener = Callable[[str, str, Any, Optional[StepMeta]], Optional[Awaitable[None]]]


class Step:
    """
    A class that represents a step in a pipeline. It is used to track the execution of a function,
    collect metrics, and generate visualizations.
    """

    def __init__(
        self,
        name: str,
        parent: Optional['Step'] = None,
        key: Optional[str] = None,
        event_emitter: Optional[AsyncIOEventEmitter] = None
    ):
        self.name = name
        self.records: Dict[str, Any] = {}
        self.time = TimeMeta(
            startTs=int(time.time() * 1000),
            endTs=None,
            timeUsageMs=None
        )

        # Key handling logic
        if key:
            self.key = key
        elif parent:
            self.key = f"{parent.key}.{self.name.replace('.', '_')}"
        else:
            self.key = self.name.replace('.', '_')

        self.parent = parent
        self.ctx = self
        self.steps: List[Step] = []
        self.result = None
        self.error = None
        self._emitter = event_emitter if event_emitter else AsyncIOEventEmitter()

    async def track(self, callable_fn: Callable[['Step'], Awaitable[Any]]) -> Any:
        """
        Track the execution of a callable function.

        Args:
            callable_fn: An async function that takes a Step instance and returns a value

        Returns:
            The result of the callable function
        """
        return await self.run(callable_fn)

    def get_name(self) -> str:
        """
        Get the name of this step.

        Returns:
            The name of the step
        """
        return self.name

    def get_key(self) -> str:
        """
        Get the unique key of this step.

        Returns:
            The key of the step
        """
        return self.key

    def get_step_meta(self) -> StepMeta:
        """
        Get metadata about this step.

        Returns:
            A StepMeta dictionary with details about this step
        """
        return StepMeta(
            name=self.name,
            key=self.key,
            time=self.time,
            records=self.records,
            result=self.result,
            error=str(self.error) if self.error else None
        )

    async def run(self, callable_fn: Callable[['Step'], Awaitable[Any]]) -> Any:
        """
        Run the provided callable function and track its execution.

        Args:
            callable_fn: An async function that takes a Step instance and returns a value

        Returns:
            The result of the callable function

        Raises:
            Any exception raised by the callable function
        """
        self.time.startTs = int(time.time() * 1000)
        try:
            # Emit start event on THIS step's emitter only
            self._emitter.emit('step-start', self.key, self.get_step_meta())

            # Execute the callable
            self.result = await callable_fn(self.ctx)

            # Emit success event on THIS step's emitter only
            self._emitter.emit('step-success', self.key, self.result, self.get_step_meta())

            return self.result
        except Exception as e:
            self.error = e
            # Emit error event on THIS step's emitter only
            self._emitter.emit('step-error', self.key, e, self.get_step_meta())
            raise e
        finally:
            # Record end time
            self.time.endTs = int(time.time() * 1000)
            self.time.timeUsageMs = self.time.endTs - self.time.startTs

            # Emit complete event on THIS step's emitter only
            self._emitter.emit('step-complete', self.key, self.get_step_meta())

    async def step(self, name: str, callable_fn: Callable[['Step'], Awaitable[Any]]) -> Any:
        """
        Create a new substep and run it.

        Args:
            name: The name of the substep
            callable_fn: An async function to execute within the substep

        Returns:
            The result of the callable function
        """
        # Create child step - it will get its own emitter in its __init__
        child_step = Step(name, parent=self, event_emitter=self._emitter)

        # Check for duplicates and rename if necessary
        duplicates = len([s for s in self.steps if s.key == child_step.key])
        if duplicates > 0:
            new_key = f"{child_step.key}___{duplicates}"
            print(f"Step with key '{child_step.key}' already exists under same parent step. "
                  f"Assigning a new key '{new_key}' to avoid confusion.")
            child_step.key = new_key

        self.steps.append(child_step)
        return await child_step.run(callable_fn)

    def log(self, key: str, data: Any) -> 'Step':
        """
        @deprecated: Use record() instead.
        """
        print("Step.log() is deprecated, use Step.record() instead")
        return self.record(key, data)

    async def record(self, record_key: str, data: Any) -> 'Step':
        """
        Record a key-value pair associated with this step.

        Args:
            record_key: The key to store the data under
            data: The data to store

        Returns:
            Self reference for chaining
        """
        self.records[record_key] = data
        meta = self.get_step_meta()

        # Emit deprecated 'record' event on THIS step's emitter only
        self._emitter.emit('record', record_key, data, meta)

        # Emit 'step-record' event on THIS step's emitter only
        self._emitter.emit('step-record', self.key, record_key, data, meta)

        return self

    def on(self, event_type: str, listener: Callable) -> 'Step':
        """
        Register an event listener for a specified event type.

        Args:
            event_type: The type of event to listen for ('step-start', 'step-success', etc.)
            listener: The callback function (can be sync or async) to execute when the event occurs

        Returns:
            Self reference for chaining
        """
        # Attach listener to THIS step's specific emitter
        self._emitter.on(event_type, listener)
        return self

    def output_hierarchy(self) -> NestedStepMeta:
        """
        @deprecated: Use output_nested() instead.
        """
        return self.output_nested()

    def output_nested(self) -> NestedStepMeta:
        """
        Output a nested hierarchy of step metadata, including substeps.

        Returns:
            A NestedStepMeta dictionary containing this step's metadata and its substeps
        """
        return NestedStepMeta(
            name=self.name,
            key=self.key,
            time=self.time,
            records=self.records,
            result=self.result,
            error=str(self.error) if self.error else None,
            substeps=[step.output_nested() for step in self.steps]
        )

    def output_flattened(self) -> List[StepMeta]:
        """
        Output a flattened list of step metadata, including this step and all substeps.

        Returns:
            A list of StepMeta dictionaries
        """
        substeps = [meta for step in self.steps for meta in step.output_flattened()]
        return [
            StepMeta(
                name=self.name,
                key=self.key,
                time=self.time,
                records=self.records,
                result=self.result,
                error=str(self.error) if self.error else None
            ),
            *substeps
        ]

    def get_records(self) -> Dict[str, Any]:
        """
        Get all records associated with this step.

        Returns:
            A dictionary of all recorded key-value pairs
        """
        return self.records

    def get_time_meta(self) -> TimeMeta:
        """
        Get timing metadata for this step.

        Returns:
            A TimeMeta dictionary with timing information
        """
        return self.time

    def get_time(self) -> TimeMeta:
        """
        @deprecated: Use get_time_meta() instead.
        """
        return self.get_time_meta()

    def _execution_graph_quickchart(self) -> str:
        """
        Generate a URL for visualizing the execution graph via QuickChart.io

        Returns:
            A URL string that can be used to view the execution graph
        """
        def build_graph(step: Step) -> List[GraphItem]:
            item = GraphItem(
                descriptor=f'"{step.key}"',
                label=f"{step.name}{f'\\n{step.time.timeUsageMs}ms' if step.time.timeUsageMs else ''}"
            )

            if step.parent:
                linkage = GraphItem(
                    descriptor=f'"{step.parent.key}" -> "{step.key}"'
                )
                # Combine this item, the linkage, and all items from substeps
                all_items = [item, linkage]
                for s in step.steps:
                    all_items.extend(build_graph(s))
                return all_items
            else:
                return [item] + [item for s in step.steps for item in build_graph(s)]

        graph_items = build_graph(self)
        return generate_execution_graph_quickchart(graph_items)

    @staticmethod
    def _get_gantt_spans(steps: List[StepMeta], filter_pattern=None) -> List[TimeSpan]:
        """
        Convert step metadata into time spans for Gantt chart generation.

        Args:
            steps: List of StepMeta objects to convert
            filter_pattern: Optional filter to apply to step keys

        Returns:
            List of TimeSpan objects suitable for Gantt chart generation
        """
        min_start_ts = min([step.time.startTs for step in steps])
        
        spans: List[TimeSpan] = []

        for step in steps:
            # Apply filtering if specified
            if filter_pattern:
                if isinstance(filter_pattern, list) and step.key not in filter_pattern:
                    continue
                elif isinstance(filter_pattern, str) and not re.match(filter_pattern, step.key):
                    continue

            spans.append(TimeSpan(
                key=step.key,
                startTs=step.time.startTs - min_start_ts,
                endTs=step.time.endTs - min_start_ts if step.time.endTs else None
            ))

        return spans

    async def gantt_quickchart(self, args: Optional[StepGanttArg] = None) -> BytesIO:
        """
        Generate a Gantt chart via QuickChart.io for this step and its substeps.

        Args:
            args: Optional configuration arguments

        Returns:
            BytesIO buffer containing the generated PNG chart
        """
        steps = self.output_flattened()
        return await Step.gantt_quick_chart_static(steps, args)

    @staticmethod
    async def gantt_quick_chart_static(steps: List[StepMeta], args: Optional[StepGanttArg] = None) -> BytesIO:
        """
        Generate a Gantt chart via QuickChart.io from a list of step metadata.

        Args:
            steps: List of StepMeta objects to visualize
            args: Optional configuration arguments

        Returns:
            BytesIO buffer containing the generated PNG chart
        """
        chart_args = GanttChartArgs()
        if args:
            if args.unit:
                chart_args.unit = args.unit
            if args.min_height:
                chart_args.min_height = args.min_height
            if args.min_width:
                chart_args.min_width = args.min_width

        filter_pattern = args.filter if args else None
        return await generate_gantt_chart_quickchart(
            Step._get_gantt_spans(steps, filter_pattern),
            chart_args
        )

    def gantt_google_chart_html(self, args: Optional[StepGanttArg] = None) -> str:
        """
        Generate an HTML page with a Google Gantt Chart for this step and its substeps.

        Args:
            args: Optional configuration arguments

        Returns:
            HTML string containing the Google Gantt Chart
        """
        steps = self.output_flattened()
        return Step.gantt_google_chart_html_static(steps, args)

    @staticmethod
    def gantt_google_chart_html_static(steps: List[StepMeta], args: Optional[StepGanttArg] = None) -> str:
        """
        Generate an HTML page with a Google Gantt Chart from a list of step metadata.

        Args:
            steps: List of StepMeta objects to visualize
            args: Optional configuration arguments

        Returns:
            HTML string containing the Google Gantt Chart
        """
        chart_args = GanttChartArgs()
        if args:
            if args.unit:
                chart_args.unit = args.unit
            if args.min_height:
                chart_args.min_height = args.min_height
            if args.min_width:
                chart_args.min_width = args.min_width

        filter_pattern = args.filter if args else None
        return generate_gantt_chart_google(
            Step._get_gantt_spans(steps, filter_pattern),
            chart_args
        )

    @staticmethod
    def flatten_nested_step_metas(root: NestedStepMeta) -> List[StepMeta]:
        """
        Convert a nested step meta structure to a flat list of step metadata.

        Args:
            root: A NestedStepMeta object to flatten

        Returns:
            A flat list of StepMeta objects
        """
        flattened = []
        queue = [root]

        while queue:
            current = queue.pop(0)
            # Convert NestedStepMeta back to StepMeta for the flat list
            step_meta = StepMeta(
                name=current.name,
                key=current.key,
                time=current.time,
                records=current.records,
                result=current.result,
                error=current.error
            )
            flattened.append(step_meta)

            # Add substeps to the queue for processing
            if current.substeps:
                # Add in reverse to maintain order relative to siblings if using pop(0)
                # Or just extend if order doesn't strictly matter beyond parent-child
                queue.extend(current.substeps)

        return flattened
