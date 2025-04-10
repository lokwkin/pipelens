import { Step, StepMeta } from './step';
import { v4 as uuidv4 } from 'uuid';
import { Transport } from './transport';

export type PipelineMeta = StepMeta & {
  logVersion: number; // version of the log format
  runId: string;
  steps: StepMeta[];
};
export class Pipeline extends Step {
  private runId: string;
  private autoSave: boolean;
  private transport?: Transport;

  constructor(
    name: string,
    options?: {
      runId?: string;
      autoSave?: boolean;
      transport?: Transport;
    },
  ) {
    super(name);
    this.runId = options?.runId ?? uuidv4();
    this.autoSave = options?.autoSave ?? false;

    if (this.autoSave) {
      if (!options?.transport) {
        throw new Error('Transport must be provided when autoSave is enabled');
      }
      this.transport = options.transport;
    }

    // Add event listener for completion to save data
    if (this.autoSave) {
      this.on('step-start', async (key: string, stepMeta?: StepMeta) => {
        if (key === this.getKey()) {
          // This step marks the pipeline
          await this.transport?.initiateRun(this.outputPipelineMeta());
        }
        if (!stepMeta) {
          return;
        }
        await this.transport?.initiateStep(this.runId, stepMeta);
      });
      this.on('step-complete', async (key: string, stepMeta?: StepMeta) => {
        if (!stepMeta) {
          return;
        }
        await this.transport?.finishStep(this.runId, stepMeta);
        if (key === this.getKey()) {
          // This step marks the pipeline
          await this.transport?.finishRun(this.outputPipelineMeta(), stepMeta.error ? 'failed' : 'completed');
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
      logVersion: 1,
      runId: this.getRunId(),
      steps: this.outputFlattened(),
    };
  }
}
