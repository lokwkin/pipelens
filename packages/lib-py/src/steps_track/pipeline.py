import uuid
from typing import Optional, Dict, Any

from .step import Step, StepMeta
from .pipeline_types import PipelineMeta
from .transport.base_transport import Transport


class Pipeline(Step):
    """
    A Pipeline is a top-level Step that can contain other Steps.
    It provides functionality for tracking execution, saving execution data via a Transport,
    and retrieving metadata about the pipeline and its steps.
    """

    def __init__(
        self,
        name: str,
        options: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize a new Pipeline.

        Args:
            name: The name of the pipeline
            options: Optional configuration:
                - run_id: Optional custom run ID (defaults to a UUID)
                - auto_save: 'real_time', 'finish', or 'off' (default is 'off')
                - transport: Transport implementation for saving data
        """
        super().__init__(name)

        options = options or {}
        self.run_id = options.get('run_id', str(uuid.uuid4()))
        self.auto_save = options.get('auto_save', 'off')
        self.transport: Optional[Transport] = options.get('transport')

        # Validate transport is provided when auto_save is enabled
        if self.auto_save != 'off':
            if not self.transport:
                raise ValueError("Transport must be provided when auto_save is enabled")

        # Set up event handlers based on auto_save configuration
        if self.auto_save == 'real_time':
            # Handle step start events
            self.on('step-start', self._handle_step_start)
            # Handle step complete events
            self.on('step-complete', self._handle_step_complete)
        elif self.auto_save == 'finish':
            # Handle only pipeline completion
            self.on('step-complete', self._handle_pipeline_complete)

    async def _handle_step_start(self, key: str, step_meta: Optional[StepMeta] = None) -> None:
        """Handle step start events for real-time saving."""
        if key == self.get_key():
            # This step marks the pipeline start
            await self.transport.initiate_run(self.output_pipeline_meta())

        if not step_meta:
            return

        await self.transport.initiate_step(self.run_id, step_meta)

    async def _handle_step_complete(self, key: str, step_meta: Optional[StepMeta] = None) -> None:
        """Handle step complete events for real-time saving."""
        if not step_meta:
            return

        await self.transport.finish_step(self.run_id, step_meta)

        if key == self.get_key():
            # This step marks the pipeline completion
            status = "failed" if step_meta.error else "completed"
            await self.transport.finish_run(self.output_pipeline_meta(), status)

    async def _handle_pipeline_complete(self, key: str, step_meta: Optional[StepMeta] = None) -> None:
        """Handle pipeline completion for finish-only saving."""
        if key == self.get_key():
            # This step marks the pipeline completion
            status = "failed" if step_meta and step_meta.error else "completed"
            await self.transport.finish_run(self.output_pipeline_meta(), status)

    def get_run_id(self) -> str:
        """Get the run ID for this pipeline."""
        return self.run_id

    def output_pipeline_meta(self) -> PipelineMeta:
        """
        Output metadata about this pipeline, including all steps.

        Returns:
            A PipelineMeta object containing pipeline metadata and flattened steps
        """
        # Create a PipelineMeta by extending the step meta with pipeline-specific fields
        step_meta = self.get_step_meta()

        return PipelineMeta(
            **step_meta.model_dump(),
            log_version=1,
            run_id=self.get_run_id(),
            steps=self.output_flattened()
        )
