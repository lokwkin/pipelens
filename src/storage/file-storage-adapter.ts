import fs from 'fs/promises';
import path from 'path';
import { StorageAdapter, FilterOptions, RunMeta } from './storage-adapter';
import { StepMeta } from '../step';
import { Pipeline } from '../pipeline';

export class FileStorageAdapter implements StorageAdapter {
  private basePath: string;
  private connected: boolean = false;

  constructor(basePath: string = path.join(process.cwd(), '.steps-track')) {
    this.basePath = basePath;
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      // Ensure the base directory exists
      await fs.mkdir(this.basePath, { recursive: true });

      // Create subdirectories for different data types
      await fs.mkdir(path.join(this.basePath, 'run-data'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'run-meta'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'runs'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'durations'), { recursive: true });

      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    // Nothing to do for file-based storage
    this.connected = false;
  }

  async saveRun(pipeline: Pipeline): Promise<void> {
    await this.connect();

    const runId = pipeline.getRunId();
    const pipelineName = pipeline.getName();
    const steps = pipeline.outputSteps();

    // Store the full run data as JSON
    await fs.writeFile(path.join(this.basePath, 'run-data', `${runId}.json`), JSON.stringify(steps, null, 2));

    // Create a summary for quick listing
    const runMeta: RunMeta = {
      runId: runId,
      pipeline: pipelineName,
      startTime: pipeline.getTimeMeta().startTs,
      endTime: pipeline.getTimeMeta().endTs,
      duration: pipeline.getTimeMeta().endTs - pipeline.getTimeMeta().startTs,
    };

    // Store the runMeta
    await fs.writeFile(path.join(this.basePath, 'run-meta', `${runId}.json`), JSON.stringify(runMeta, null, 2));

    // Add to the pipeline's run list - using JSON Lines to avoid race conditions
    const pipelineRunsPath = path.join(this.basePath, 'runs', `${pipelineName}.jl`);

    // Append the new run as a single line - atomic operation that avoids race conditions
    const runEntry = {
      runId: runId,
      timestamp: pipeline.getTimeMeta().startTs,
    };
    await fs.appendFile(pipelineRunsPath, JSON.stringify(runEntry) + '\n');

    // Store time-series data for each step
    await this.storeTimeSeriesData(pipeline.getRunId(), steps);
  }

  async getRunData(runId: string): Promise<any> {
    await this.connect();

    try {
      const runData = await fs.readFile(path.join(this.basePath, 'run-data', `${runId}.json`), 'utf-8');
      return JSON.parse(runData);
    } catch (error) {
      throw new Error(`Run with ID ${runId} not found`);
    }
  }

  async listPipelines(): Promise<string[]> {
    await this.connect();

    const files = await fs.readdir(path.join(this.basePath, 'runs'));
    return files.filter((file) => file.endsWith('.jl')).map((file) => file.split('.')[0]);
  }

  async listRuns(pipelineId: string, options: FilterOptions = {}): Promise<RunMeta[]> {
    await this.connect();

    const { limit = 100, offset = 0, startDate, endDate } = options;

    try {
      // Get the list of runs for this pipeline from JL file
      const pipelineRunsPath = path.join(this.basePath, 'runs', `${pipelineId}.jl`);
      const pipelineRunsData = await fs.readFile(pipelineRunsPath, 'utf-8');

      // Parse JSON Lines format - each line is a separate JSON object
      const pipelineRuns: Array<{ runId: string; timestamp: number }> = pipelineRunsData
        .split('\n')
        .filter((line) => line.trim() !== '') // Skip empty lines
        .map((line) => JSON.parse(line));

      // Sort by timestamp (newest first) - since we're now appending, we need to sort
      pipelineRuns.sort((a, b) => b.timestamp - a.timestamp);

      console.log('pipelineRuns', pipelineRuns);

      // Filter by date range if specified
      let filteredRuns = pipelineRuns;
      if (startDate || endDate) {
        const minTime = startDate ? new Date(startDate).getTime() : 0;
        const maxTime = endDate ? new Date(endDate).getTime() : Infinity;

        filteredRuns = pipelineRuns.filter((run) => run.timestamp >= minTime && run.timestamp <= maxTime);
      }
      console.log('filteredRuns', pipelineRuns);

      // Apply pagination
      const paginatedRuns = filteredRuns.slice(offset, offset + limit);

      // Get summaries for each run
      const runMetas = await Promise.all(
        paginatedRuns.map(async (run) => {
          const summaryPath = path.join(this.basePath, 'run-meta', `${run.runId}.json`);
          const summaryData = await fs.readFile(summaryPath, 'utf-8');
          return JSON.parse(summaryData) as RunMeta;
        }),
      );

      return runMetas;
    } catch (error) {
      console.error('Error listing runs', error);
      // If the pipeline file doesn't exist, return an empty array
      return [];
    }
  }

  async getStepStats(stepKey: string, timeRange: { start: number; end: number }): Promise<any> {
    await this.connect();

    const timeSeriesPath = path.join(this.basePath, 'durations', `${stepKey}.jl`);

    try {
      const timeSeriesData = await fs.readFile(timeSeriesPath, 'utf-8');

      // Parse JSON Lines format
      const allDataPoints = timeSeriesData
        .split('\n')
        .filter((line) => line.trim() !== '') // Skip empty lines
        .map((line) => JSON.parse(line));

      // Filter data points by time range
      return allDataPoints.filter(
        (point: { timestamp: number; value: number }) =>
          point.timestamp >= timeRange.start && point.timestamp <= timeRange.end,
      );
    } catch (error) {
      // If the file doesn't exist, return an empty array
      return [];
    }
  }

  private async storeTimeSeriesData(runId: string, steps: StepMeta[]): Promise<void> {
    // Track step keys counts to handle duplicates
    const usedStepKeys = new Set<string>();
    const stepKeysCount = new Map<string, number>();
    steps.forEach((step) => {
      stepKeysCount.set(step.key, (stepKeysCount.get(step.key) || 0) + 1);
    });

    for (const step of steps) {
      let uniqStepKey = step.key;

      const count = stepKeysCount.get(step.key);
      if (count && count > 1) {
        let index = 0;
        uniqStepKey = `${uniqStepKey}___${index}`;
        while (usedStepKeys.has(uniqStepKey)) {
          index++;
          uniqStepKey = `${step.key}___${index}`;
        }
      }
      usedStepKeys.add(uniqStepKey);

      // Use JSON Lines format for time series data too
      const timeSeriesPath = path.join(this.basePath, 'durations', `${step.key}.jl`);

      // Create a data point and append it to the file - atomic operation
      const dataPoint: { timestamp: number; value: number; runId: string; stepKey: string; stepName: string } = {
        timestamp: step.time.startTs,
        value: step.time.timeUsageMs,
        stepKey: uniqStepKey,
        stepName: step.name,
        runId: runId,
      };

      await fs.appendFile(timeSeriesPath, JSON.stringify(dataPoint) + '\n');
    }
  }
}
