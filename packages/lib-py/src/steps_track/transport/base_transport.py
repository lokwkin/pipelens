from abc import ABC, abstractmethod
from typing import Literal

from ..pipeline_types import PipelineMeta
from ..step import StepMeta


class Transport(ABC):
    @abstractmethod
    async def initiate_run(self, pipeline_meta: PipelineMeta) -> None:
        pass

    @abstractmethod
    async def finish_run(self, pipeline_meta: PipelineMeta, status: Literal["completed", "failed", "running"]) -> None:
        pass

    @abstractmethod
    async def initiate_step(self, run_id: str, step: StepMeta) -> None:
        pass

    @abstractmethod
    async def finish_step(self, run_id: str, step: StepMeta) -> None:
        pass
