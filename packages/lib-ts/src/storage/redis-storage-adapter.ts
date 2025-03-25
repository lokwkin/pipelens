import { StepMeta } from '../step';
import { FilterOptions, RunMeta, StepTimeseriesEntry, StorageAdapter } from './storage-adapter';
import { Pipeline } from '../pipeline';
import { createClient, RedisClientType, TimeSeriesDuplicatePolicies } from 'redis';
import '@redis/json';
import '@redis/time-series';

/**
 * Redis-based implementation of the StorageAdapter interface.
 * Stores pipeline runs and step data in Redis data structures.
 *
 * Redis Key Structure:
 * - pipeline:{pipelineName} - JSON array of RunMeta objects for each pipeline
 * - run:{runId}:meta - JSON object containing RunMeta for the run
 * - run:{runId}:steps - JSON array of StepMeta objects for all steps in the run
 * - run:{runId}:step:{stepKey} - JSON object containing StepMeta for a specific step
 * - ts:{pipelineName}:{stepName} - Time series data for each step across runs
 */
export class RedisStorageAdapter implements StorageAdapter {
  private client: RedisClientType;
  private connected: boolean = false;
  private lockMap: Map<string, Promise<any>> = new Map();

  /**
   * Creates a new RedisStorageAdapter
   * @param options Redis connection options
   */
  constructor(options: {
    url?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    db?: number;
  }) {
    const url =
      options.url ||
      `redis://${options.username ? `${options.username}:${options.password}@` : ''}${options.host || 'localhost'}:${options.port || 6379}/${options.db || 0}`;

    this.client = createClient({
      url,
    });

    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }

  /**
   * Connects to Redis
   */
  public async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  /**
   * Lists all pipelines that exist in storage
   */
  public async listPipelines(): Promise<string[]> {
    const keys = await this.client.keys('pipeline:*');
    return keys.map((key) => key.replace('pipeline:', ''));
  }

  /**
   * Lists all runs for a specific pipeline with optional filtering
   */
  public async listRuns(pipelineName: string, options?: FilterOptions): Promise<RunMeta[]> {
    const pipelineKey = `pipeline:${pipelineName}`;

    try {
      // Check if pipeline exists
      const exists = await this.client.exists(pipelineKey);
      if (!exists) {
        return [];
      }

      // Read pipeline runs index
      const data = (await this.client.json.get(pipelineKey)) as RunMeta[];
      let runs: RunMeta[] = Array.isArray(data) ? data : [];

      // Apply filters
      if (options) {
        if (options.status) {
          runs = runs.filter((run) => run.status === options.status);
        }

        if (options.startDate) {
          const startTime = options.startDate.getTime();
          runs = runs.filter((run) => run.startTime >= startTime);
        }

        if (options.endDate) {
          const endTime = options.endDate.getTime();
          runs = runs.filter((run) => run.startTime <= endTime);
        }

        // Sort by start time (newest first)
        runs.sort((a, b) => b.startTime - a.startTime);

        // Apply pagination - now handled by the API endpoint for more efficient results
        if (options.offset !== undefined && options.limit !== undefined) {
          runs = runs.slice(options.offset, options.offset + options.limit);
        } else if (options.offset !== undefined) {
          runs = runs.slice(options.offset);
        } else if (options.limit !== undefined) {
          runs = runs.slice(0, options.limit);
        }
      } else {
        // Default sorting by start time (newest first)
        runs.sort((a, b) => b.startTime - a.startTime);
      }

      return runs;
    } catch (error) {
      console.error('Error listing runs:', error);
      return [];
    }
  }

  /**
   * Initiates a new run for a pipeline
   */
  public async initiateRun(pipeline: Pipeline): Promise<void> {
    const runId = pipeline.getRunId();
    const pipelineName = pipeline.getName();

    // Create run metadata
    const runMeta: RunMeta = {
      runId,
      pipeline: pipelineName,
      startTime: pipeline.getTimeMeta().startTs,
      endTime: 0,
      duration: 0,
      status: 'running',
    };

    // Write run metadata
    await this.client.json.set(`run:${runId}:meta`, '$', runMeta);

    // Update pipeline runs index
    await this.updatePipelineIndex(pipelineName, runMeta);
  }

  /**
   * Finishes a run and stores all step data
   */
  public async finishRun(pipeline: Pipeline, status: 'completed' | 'failed' | 'running'): Promise<void> {
    const runId = pipeline.getRunId();
    const pipelineName = pipeline.getName();
    const stepsDump = pipeline.outputFlattened();

    // Read current run metadata
    const runMeta = (await this.client.json.get(`run:${runId}:meta`)) as RunMeta;

    // Update run metadata
    const endTime = pipeline.getTimeMeta().endTs;
    const updatedMeta: RunMeta = {
      ...runMeta,
      endTime,
      duration: endTime ? endTime - runMeta.startTime : undefined,
      status,
    };

    // Write updated metadata
    await this.client.json.set(`run:${runId}:meta`, '$', updatedMeta);

    // Write steps data
    await this.client.json.set(`run:${runId}:steps`, '$', stepsDump);

    // Update pipeline runs index
    await this.updatePipelineIndex(pipelineName, updatedMeta);
  }

  /**
   * Gets all data for a specific run
   */
  public async getRunData(runId: string): Promise<any> {
    try {
      // Read run metadata
      const meta = await this.client.json.get(`run:${runId}:meta`);

      // Read steps data
      let steps: StepMeta[] = [];
      try {
        steps = (await this.client.json.get(`run:${runId}:steps`)) as StepMeta[];
      } catch (error) {
        // Steps data might not exist yet if run is still in progress
      }

      return { meta, steps };
    } catch (error) {
      throw new Error(`Run with ID ${runId} not found`);
    }
  }

  /**
   * Lists all steps for a specific run
   */
  public async listRunSteps(runId: string): Promise<StepMeta[]> {
    try {
      return (await this.client.json.get(`run:${runId}:steps`)) as StepMeta[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Initiates a step within a run
   */
  public async initiateStep(runId: string, step: StepMeta): Promise<void> {
    // Write step data to individual key
    await this.client.json.set(`run:${runId}:step:${step.key}`, '$', step);
  }

  /**
   * Finishes a step and updates its metadata
   */
  public async finishStep(runId: string, step: StepMeta): Promise<void> {
    // Write updated step data
    await this.client.json.set(`run:${runId}:step:${step.key}`, '$', step);

    // Update timeseries data for this step
    await this.updateStepTimeseries(step.key.split('.')[0], runId, step);
  }

  /**
   * Gets timeseries data for a specific step within a time range
   */
  public async getPipelineStepTimeseries(
    pipelineName: string,
    stepName: string,
    timeRange: { start: number; end: number },
  ): Promise<Array<StepTimeseriesEntry & { stepMeta?: StepMeta }>> {
    const timeseriesKey = `ts:${pipelineName}.${stepName}`;

    try {
      // Query the time series data
      const result = await this.client.ts.range(timeseriesKey, timeRange.start, timeRange.end);

      // Fetch all metadata in parallel
      const enrichedPoints = await Promise.all(
        result.map(async (point) => {
          const metaKey = `${timeseriesKey}:meta:${point.timestamp}`;
          const [runId, stepKey] = await Promise.all([
            this.client.hGet(metaKey, 'runId'),
            this.client.hGet(metaKey, 'stepKey'),
          ]);

          let stepMeta: StepMeta | undefined;
          // Try to fetch step metadata if available
          if (runId && stepKey) {
            try {
              const steps = await this.listRunSteps(runId);
              stepMeta = steps.find((s) => s.key === stepKey);
            } catch (error) {
              // Ignore errors when fetching step metadata
            }
          }

          return {
            timestamp: point.timestamp,
            value: point.value,
            runId,
            stepKey,
            stepMeta,
          } as StepTimeseriesEntry & { stepMeta?: StepMeta };
        }),
      );

      return enrichedPoints;
    } catch (error) {
      console.error('Error getting timeseries data:', error);
      return [];
    }
  }

  /**
   * Lists all available timeseries steps for a pipeline
   */
  public async listPipelineSteps(pipelineName: string): Promise<string[]> {
    try {
      // Find all timeseries keys for this pipeline
      const keys = await this.client.keys(`ts:${pipelineName}.*`);

      // Extract step names from the keys
      return keys.map((key) => {
        const parts = key.split('.');
        return parts[parts.length - 1];
      });
    } catch (error) {
      console.error('Error listing pipeline timeseries steps:', error);
      return [];
    }
  }

  /**
   * Updates the timeseries data for a step
   */
  private async updateStepTimeseries(pipelineName: string, runId: string, step: StepMeta): Promise<void> {
    // Use pipeline name + step name for the timeseries key
    const timeseriesKey = `ts:${pipelineName}.${step.name}`;
    const timestamp = step.time.startTs;

    // Use Redis transaction to ensure atomicity
    await this.withRedisLock(timeseriesKey, async () => {
      // Create the time series if it doesn't exist
      try {
        await this.client.ts.create(timeseriesKey, {
          RETENTION: 60 * 60 * 24 * 30 * 1000, // 30 days in milliseconds
          DUPLICATE_POLICY: TimeSeriesDuplicatePolicies.LAST, // If duplicate timestamp, use the last value
        });
      } catch (error) {
        // Ignore if time series already exists
      }

      if (!step.time.timeUsageMs) {
        console.warn(`Step ${step.key} has no timeUsageMs, skipping timeseries update`);
        return;
      }

      // Add the data point
      await this.client.ts.add(timeseriesKey, timestamp, step.time.timeUsageMs);

      // Store additional metadata in a hash
      await this.client.hSet(`${timeseriesKey}:meta:${timestamp}`, {
        runId,
        stepKey: step.key,
      });
    });
  }

  /**
   * Updates the pipeline index with a run
   */
  private async updatePipelineIndex(pipelineName: string, runMeta: RunMeta): Promise<void> {
    const pipelineKey = `pipeline:${pipelineName}`;

    // Use Redis lock to prevent race conditions
    await this.withRedisLock(pipelineKey, async () => {
      let pipelineRuns: RunMeta[] = [];

      try {
        pipelineRuns = (await this.client.json.get(pipelineKey)) as RunMeta[];
        if (!Array.isArray(pipelineRuns)) {
          pipelineRuns = [];
        }
      } catch (error) {
        // Key doesn't exist yet, start with empty array
      }

      // Find and update existing run or add new run
      const existingIndex = pipelineRuns.findIndex((run) => run.runId === runMeta.runId);
      if (existingIndex >= 0) {
        pipelineRuns[existingIndex] = runMeta;
      } else {
        pipelineRuns.push(runMeta);
      }

      // Sort by start time (newest first)
      pipelineRuns.sort((a, b) => b.startTime - a.startTime);

      // Write updated data
      await this.client.json.set(pipelineKey, '$', pipelineRuns);
    });
  }

  /**
   * Executes a function with a Redis lock to prevent race conditions
   */
  private async withRedisLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `lock:${key}`;
    const lock = this.lockMap.get(lockKey);

    // Create a new promise chain
    const newLock = (lock || Promise.resolve()).then(async () => {
      try {
        return await fn();
      } finally {
        // If this is the current lock, remove it
        if (this.lockMap.get(lockKey) === newLock) {
          this.lockMap.delete(lockKey);
        }
      }
    });

    // Set the new lock
    this.lockMap.set(lockKey, newLock);

    // Return the result of the function
    return newLock;
  }

  /**
   * Closes the Redis connection
   */
  public async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }
}
