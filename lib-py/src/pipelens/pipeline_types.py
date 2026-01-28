from typing import List

from pydantic import Field, ConfigDict

from .step import StepMeta


class PipelineMeta(StepMeta):
    """
    Metadata for a pipeline run, including all steps.
    Used for serializing pipeline execution data.
    """

    model_config = ConfigDict(populate_by_name=True)

    log_version: int = Field(default=1, alias="logVersion")  # Version of the log format
    run_id: str = Field(alias="runId")
    steps: List[StepMeta] = []
