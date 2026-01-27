import { PipelineMeta, StepMeta } from '../../../../lib-ts/dist';

export type FilterOptions = {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  status?: 'completed' | 'failed' | 'running';
  runId?: string;
};

export type RunMeta = {
  runId: string;
  pipeline: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'completed' | 'failed' | 'running';
};

export type StepTimeseriesEntry = {
  timestamp: number;
  runId: string;
  value: number;
  stepKey: string;
};

// Default data retention period in days
export const DEFAULT_DATA_RETENTION_DAYS = 14;

export interface StorageAdapter {
  // Connect to the storage, this should be called before any other operations.
  connect(): Promise<void>;

  // List pipelines that exists
  listPipelines(): Promise<string[]>;

  // List all the runs history for a pipeline
  listRuns(pipelineName: string, options?: FilterOptions): Promise<RunMeta[]>;

  // Initiate a run, this should mark the run as running.
  initiateRun(pipelineMeta: PipelineMeta): Promise<void>;

  // Finish a run, this should mark the run as either completed or failed, and write run data to storage.
  finishRun(pipelineMeta: PipelineMeta, status: 'completed' | 'failed' | 'running'): Promise<void>;

  // Get the run data, this should read the run's data file.
  getRunData(runId: string): Promise<any>;

  // List all the steps under a run
  listRunSteps(runId: string): Promise<StepMeta[]>;

  // Initiate a step, this should mark the step as running.
  initiateStep(runId: string, step: StepMeta): Promise<void>;

  // Finish a step, this should mark the step as either completed or failed, and write the step meta to storage.
  finishStep(runId: string, step: StepMeta): Promise<void>;

  // Get the step timeseries, this should able to retrieve all StepMeta for a given stepKey and timeRange.
  getPipelineStepTimeseries(
    pipelineName: string,
    stepName: string,
    timeRange: { start: number; end: number },
  ): Promise<Array<StepTimeseriesEntry & { stepMeta?: StepMeta }>>;

  // List all the available timeserieses of steps under a pipeline
  listPipelineSteps(pipelineName: string): Promise<string[]>;

  // Save settings for a pipeline
  saveSettings(pipelineName: string, settings: any): Promise<void>;

  // Get settings for a pipeline
  getSettings(pipelineName: string): Promise<any>;

  // Delete data older than retention period
  purgeOldData(pipelineName: string, retentionDays?: number): Promise<void>;
}
