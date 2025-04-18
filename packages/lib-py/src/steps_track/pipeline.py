from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid


class PipelineMeta(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: Optional[str] = None
    key: Optional[str] = None
    start_ts: Optional[int] = None
    end_ts: Optional[int] = None
    time_usage_ms: Optional[int] = None
    status: Optional[str] = None  # e.g., 'completed', 'failed', 'running'
    records: Dict[str, Any] = {}
