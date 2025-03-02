import { Step } from './step';
import { v4 as uuidv4 } from 'uuid';
import { StorageAdapter } from './storage/storage-adapter';

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
      this.on('step-complete', async (key, _) => {
        if (key === this.getKey()) {
          // Only save when the root pipeline completes
          await this.saveRun();
        }
      });
    }
  }

  public getRunId(): string {
    return this.runId;
  }

  public async track<T = any>(callable: (st: Step) => Promise<T>): Promise<T> {
    return await this.run(callable);
  }

  public async saveRun(): Promise<void> {
    if (this.storageAdapter) {
      await this.storageAdapter.saveRun(this);
    }
  }
}
