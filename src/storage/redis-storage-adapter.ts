import { createClient, RedisClientType, TimeSeriesDuplicatePolicies } from 'redis';
import { StorageAdapter, FilterOptions, RunMeta } from './storage-adapter';
import { StepMeta } from '../step';
import { Pipeline } from '../pipeline';

export class RedisStorageAdapter implements StorageAdapter {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.client = createClient({
      url: redisUrl,
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async saveRun(pipeline: Pipeline): Promise<void> {
    await this.connect();

    // Store the full run data as JSON
    await this.client.json.set(`run:${pipeline.getRunId()}:data`, '$', pipeline.outputSteps());

    // Create a meta for quick listing
    const runMeta: RunMeta = {
      runId: pipeline.getRunId(),
      pipeline: pipeline.getName(),
      startTime: pipeline.getTimeMeta().startTs,
      endTime: pipeline.getTimeMeta().endTs,
      duration: pipeline.getTimeMeta().endTs - pipeline.getTimeMeta().startTs,
    };

    // Store the runMeta
    await this.client.json.set(`run:${pipeline.getRunId()}:meta`, '$', runMeta);

    // Add to the pipeline's run list
    await this.client.zAdd(`pipeline:${pipeline.getName()}:runs`, {
      score: pipeline.getTimeMeta().startTs, // Use current timestamp as score, for sorting runs by time
      value: pipeline.getRunId(),
    });

    // Store time-series data for each step
    await this.storeTimeSeriesData(pipeline.getRunId(), pipeline.outputSteps());
  }

  async getRunData(runId: string): Promise<any> {
    await this.connect();
    return await this.client.json.get(`run:${runId}:data`);
  }

  async listPipelines(): Promise<string[]> {
    await this.connect();
    const keys = await this.client.keys('pipeline:*:runs');
    return keys.map((key) => key.split(':')[1]);
  }

  async listRuns(pipelineName: string, options: FilterOptions = {}): Promise<RunMeta[]> {
    await this.connect();

    const { limit = 100, offset = 0, startDate, endDate } = options;

    // Get run IDs from sorted set with pagination
    const start = offset;
    const end = offset + limit - 1;

    // If date range is specified, convert to scores for ZRANGEBYSCORE
    if (startDate || endDate) {
      const minScore = startDate ? new Date(startDate).getTime() : '-inf';
      const maxScore = endDate ? new Date(endDate).getTime() : '+inf';

      const runIds = await this.client.zRangeByScore(
        `pipeline:${pipelineName}:runs`,
        minScore.toString(),
        maxScore.toString(),
        {
          LIMIT: {
            offset,
            count: limit,
          },
        },
      );

      // Get runMetas for each run ID
      const runMetas = await Promise.all(runIds.map((id) => this.client.json.get(`run:${id}:meta`)));

      return runMetas as unknown as RunMeta[];
    } else {
      // Get the most recent runs
      const runIds = await this.client.zRange(`pipeline:${pipelineName}:runs`, start, end, { REV: true });

      // Get runMetas for each run ID
      const runMetas = await Promise.all(runIds.map((id) => this.client.json.get(`run:${id}:meta`)));

      return runMetas as unknown as RunMeta[];
    }
  }

  async getStepStats(stepKey: string, timeRange: { start: number; end: number }): Promise<any> {
    await this.connect();

    // Query time-series data for the specific step
    const data = await this.client.ts.range(`ts:${stepKey}:duration`, timeRange.start, timeRange.end);

    return data;
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

      try {
        await this.client.ts.create(`ts:${uniqStepKey}:duration`, {
          DUPLICATE_POLICY: TimeSeriesDuplicatePolicies.LAST,
          LABELS: {
            stepKey: step.key,
            stepName: step.name,
            runId: runId,
          },
        });
      } catch (e) {
        console.warn('Error creating time series', e);
        // Key might already exist, which is fine
      }

      // Add the data point
      await this.client.ts.add(`ts:${uniqStepKey}:duration`, step.time.startTs, step.time.timeUsageMs);
    }
  }
}
