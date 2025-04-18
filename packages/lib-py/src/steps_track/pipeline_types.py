from typing import List

from .step import StepMeta


class PipelineMeta(StepMeta):
    """
    Metadata for a pipeline run, including all steps.
    Used for serializing pipeline execution data.
    """
    log_version: int = 1  # Version of the log format
    run_id: str
    steps: List[StepMeta] = []
