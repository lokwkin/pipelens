import { Pipeline } from '../pipeline';
import { StepMeta } from '../step';

export type FilterOptions = {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  status?: 'completed' | 'failed' | 'running';
};

export type RunMeta = {
  runId: string;
  pipeline: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'completed' | 'failed' | 'running';
};

export interface StorageAdapter {
  // Connect to the storage, this should be called before any other operations.
  connect(): Promise<void>;

  // List pipelines that exists
  listPipelines(): Promise<string[]>;

  // List all the runs history for a pipeline
  listRuns(pipelineName: string, options?: FilterOptions): Promise<RunMeta[]>;

  // Initiate a run, this should mark the run as running.
  initiateRun(pipeline: Pipeline): Promise<void>;

  // Finish a run, this should mark the run as either completed or failed, and write run data to storage.
  finishRun(pipeline: Pipeline, status: 'completed' | 'failed' | 'running'): Promise<void>;

  // Get the run data, this should read the run's data file.
  getRunData(runId: string): Promise<any>;

  // List all the steps under a run
  listSteps(runId: string): Promise<StepMeta[]>;

  // Initiate a step, this should mark the step as running.
  initiateStep(runId: string, step: StepMeta): Promise<void>;

  // Finish a step, this should mark the step as either completed or failed, and write the step meta to storage.
  finishStep(runId: string, step: StepMeta): Promise<void>;

  // Get the step stats, this should able to retrieve all StepMeta for a given stepKey and timeRange.
  getStepTimeseries(pipelineName: string, stepName: string, timeRange: { start: number; end: number }): Promise<any>;
}
