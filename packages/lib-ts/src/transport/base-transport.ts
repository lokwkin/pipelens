import { PipelineMeta } from '../pipeline';
import { StepMeta } from '../step';

export interface Transport {
  initiateRun(pipelineMeta: PipelineMeta): Promise<void>;
  finishRun(pipelineMeta: PipelineMeta, status: 'completed' | 'failed' | 'running'): Promise<void>;
  initiateStep(runId: string, step: StepMeta): Promise<void>;
  finishStep(runId: string, step: StepMeta): Promise<void>;
}
