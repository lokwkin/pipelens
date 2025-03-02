import { Pipeline } from '../pipeline';

export type FilterOptions = {
  limit?: number;
  offset?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  status?: 'completed' | 'failed' | 'running';
};

export type RunMeta = {
  runId: string;
  pipeline: string;
  startTime: number;
  endTime: number;
  duration: number;
};

export interface StorageAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listPipelines(): Promise<string[]>;
  listRuns(pipelineName: string, options?: FilterOptions): Promise<RunMeta[]>;
  saveRun(pipeline: Pipeline): Promise<void>;
  getRunData(runId: string): Promise<any>;
  getStepStats(stepKey: string, timeRange: { start: number; end: number }): Promise<any>;
}
