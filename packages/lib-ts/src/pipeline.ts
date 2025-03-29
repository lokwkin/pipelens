import { Step, StepMeta } from './step';
import { v4 as uuidv4 } from 'uuid';
import { StorageAdapter } from './storage/storage-adapter';

export type PipelineMeta = StepMeta & {
  runId: string;
  steps: StepMeta[];
};
export class Pipeline extends Step {
  private runId: string;
  private autoSave: boolean;
  private storageAdapter?: StorageAdapter;

  constructor(
    name: string,
    options?: {
      runId?: string;
      autoSave?: boolean;
      storageAdapter?: StorageAdapter;
    },
  ) {
    super(name);
    this.runId = options?.runId ?? uuidv4();
    this.autoSave = options?.autoSave ?? false;
    this.storageAdapter = options?.storageAdapter;

    if (this.autoSave && !this.storageAdapter) {
      throw new Error('Storage adapter must be provided when autoSave is enabled');
    }

    // Add event listener for completion to save data
    if (this.autoSave) {
      this.on('step-start', async (key: string, stepMeta?: StepMeta) => {
        if (key === this.getKey()) {
          // This step marks the pipeline
          await this.storageAdapter?.initiateRun(this.outputPipelineMeta());
        }
        if (!stepMeta) {
          return;
        }
        await this.storageAdapter?.initiateStep(this.runId, stepMeta);
      });
      this.on('step-complete', async (key: string, stepMeta?: StepMeta) => {
        if (!stepMeta) {
          return;
        }
        await this.storageAdapter?.finishStep(this.runId, stepMeta);
        if (key === this.getKey()) {
          // This step marks the pipeline
          await this.storageAdapter?.finishRun(this.outputPipelineMeta(), stepMeta.error ? 'failed' : 'completed');
        }
      });
    }
  }

  public getRunId(): string {
    return this.runId;
  }

  public outputPipelineMeta(): PipelineMeta {
    return {
      ...this.getStepMeta(),
      runId: this.getRunId(),
      steps: this.outputFlattened(),
    };
  }
}
