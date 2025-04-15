import { SQLStorageAdapter } from '../src/storage/sql-storage-adapter';
import { PipelineMeta, StepMeta } from 'steps-track';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Knex } from 'knex';

describe('SQLStorageAdapter', () => {
  let adapter: SQLStorageAdapter;
  const testDbPath = path.join(__dirname, 'test-steps-track.db');

  // Create SQLite Knex config
  const createSqliteConfig = (dbPath: string): Knex.Config => ({
    client: 'sqlite3',
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn: any, cb: (err: Error | null, connection: any) => void) => {
        // Enable foreign keys for SQLite
        conn.run('PRAGMA foreign_keys = ON;', (err: Error) => {
          cb(err, conn);
        });
      },
    },
  });

  // Sample pipeline and step data for testing
  const pipelineName = 'test-pipeline';
  const baseRunId = 'test-run';
  const stepKey = 'test-step';

  // Function to generate unique runIds for tests using UUID
  const getUniqueRunId = () => `${baseRunId}-${uuidv4()}`;

  // Helper to create pipeline meta with custom timestamp
  const createPipelineMetaWithTimestamp = (runId: string, timestamp: number): PipelineMeta => ({
    name: pipelineName,
    key: pipelineName,
    runId,
    logVersion: 1,
    time: {
      startTs: timestamp,
      endTs: timestamp + 100,
      timeUsageMs: 100,
    },
    records: {},
    steps: [
      {
        name: stepKey,
        key: stepKey,
        time: {
          startTs: timestamp,
          endTs: timestamp + 50,
          timeUsageMs: 50,
        },
        records: { testData: 'test-value' },
        result: { output: 'test-output' },
      },
    ],
  });

  const createPipelineMeta = (runId: string): PipelineMeta => ({
    name: pipelineName,
    key: pipelineName,
    runId,
    logVersion: 1,
    time: {
      startTs: Date.now(),
      endTs: Date.now() + 100,
      timeUsageMs: 100,
    },
    records: {},
    steps: [
      {
        name: stepKey,
        key: stepKey,
        time: {
          startTs: Date.now(),
          endTs: Date.now() + 50,
          timeUsageMs: 50,
        },
        records: { testData: 'test-value' },
        result: { output: 'test-output' },
      },
    ],
  });

  const createStepMeta = (): StepMeta => ({
    name: stepKey,
    key: stepKey,
    time: {
      startTs: Date.now(),
      endTs: Date.now() + 50,
      timeUsageMs: 50,
    },
    records: { testData: 'test-value' },
    result: { output: 'test-output' },
  });

  beforeAll(async () => {
    // Remove test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    adapter = new SQLStorageAdapter(createSqliteConfig(testDbPath));
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.close();
  });

  afterAll(async () => {
    // Clean up the test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('connect', () => {
    it('should connect to the database and create schema', async () => {
      // Create a new adapter instance to test connect
      const newAdapter = new SQLStorageAdapter(createSqliteConfig(testDbPath));
      await newAdapter.connect();

      // Get a list of tables to verify schema was created
      // This would require direct access to the SQLite database
      // which is not exposed in the adapter's public API
      // For simplicity, we'll just check that other operations work

      const pipelines = await newAdapter.listPipelines();
      expect(Array.isArray(pipelines)).toBe(true);

      await newAdapter.close();
    });
  });

  describe('pipeline operations', () => {
    it('should store and retrieve pipeline runs', async () => {
      const runId = getUniqueRunId();
      const pipelineMeta = createPipelineMeta(runId);

      // Initiate a run
      await adapter.initiateRun(pipelineMeta);

      // List pipelines
      const pipelines = await adapter.listPipelines();
      expect(pipelines).toContain(pipelineName);

      // List runs for the pipeline
      const runs = await adapter.listRuns(pipelineName);
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.some((run) => run.runId === runId)).toBe(true);
      const run = runs.find((r) => r.runId === runId);
      expect(run?.status).toBe('running');

      // Finish the run
      await adapter.finishRun(pipelineMeta, 'completed');

      // Verify run status updated
      const updatedRuns = await adapter.listRuns(pipelineName);
      const updatedRun = updatedRuns.find((r) => r.runId === runId);
      expect(updatedRun?.status).toBe('completed');
      expect(updatedRun?.endTime).toBeDefined();
    });
  });

  describe('step operations', () => {
    it('should store and retrieve steps', async () => {
      const runId = getUniqueRunId();
      const pipelineMeta = createPipelineMeta(runId);
      const stepMeta = createStepMeta();

      // Initiate a run first
      await adapter.initiateRun(pipelineMeta);

      // Initiate a step
      await adapter.initiateStep(runId, stepMeta);

      // List steps
      const steps = await adapter.listRunSteps(runId);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].key).toBe(stepKey);

      // Finish the step
      await adapter.finishStep(runId, stepMeta);

      // Get run data
      const runData = await adapter.getRunData(runId);
      expect(runData.steps.length).toBeGreaterThan(0);
      expect(runData.steps[0].key).toBe(stepKey);
      expect(runData.steps[0].time.timeUsageMs).toBeDefined();
    });
  });

  describe('timeseries operations', () => {
    it('should retrieve step execution history from steps table', async () => {
      const runId = getUniqueRunId();
      const pipelineMeta = createPipelineMeta(runId);
      const stepMeta = createStepMeta();

      // Need to set up data first
      await adapter.initiateRun(pipelineMeta);
      await adapter.initiateStep(runId, stepMeta);
      await adapter.finishStep(runId, stepMeta);
      await adapter.finishRun(pipelineMeta, 'completed');

      // List pipeline steps (should find our step in the completed steps)
      const steps = await adapter.listPipelineSteps(pipelineName);
      expect(steps).toContain(stepKey);

      // Get timeseries data (now from steps table)
      const now = Date.now();
      const timeseries = await adapter.getPipelineStepTimeseries(pipelineName, stepKey, {
        start: now - 10000,
        end: now + 10000,
      });

      expect(timeseries.length).toBeGreaterThan(0);
      expect(timeseries.some((t) => t.stepKey === stepKey)).toBe(true);

      // Find our specific entry
      const timeseriesEntry = timeseries.find((t) => t.runId === runId);
      expect(timeseriesEntry).toBeDefined();
      expect(timeseriesEntry?.stepKey).toBe(stepKey);
      expect(timeseriesEntry?.value).toBe(stepMeta.time.timeUsageMs);

      // Verify that full step metadata is accessible from timeseries entries
      expect(timeseriesEntry?.stepMeta).toBeDefined();
      expect(timeseriesEntry?.stepMeta?.name).toBe(stepKey);
      expect(timeseriesEntry?.stepMeta?.time.timeUsageMs).toBe(stepMeta.time.timeUsageMs);
      expect(timeseriesEntry?.stepMeta?.records.testData).toBe('test-value');
      expect(timeseriesEntry?.stepMeta?.result).toEqual({ output: 'test-output' });
    });
  });

  describe('data retention operations', () => {
    it('should purge data older than the retention period', async () => {
      // Set up test data with different timestamps
      const now = Date.now();
      const retentionDays = 7; // Use a shorter retention period for testing
      const dayInMs = 24 * 60 * 60 * 1000;

      // Create pipeline and save settings with custom retention
      const settings = { dataRetentionDays: retentionDays };
      await adapter.saveSettings(pipelineName, settings);

      // Create some runs with different ages
      // Recent run - within retention period (3 days old)
      const recentRunId = getUniqueRunId();
      const recentTimestamp = now - 3 * dayInMs;
      const recentRun = createPipelineMetaWithTimestamp(recentRunId, recentTimestamp);
      await adapter.initiateRun(recentRun);
      await adapter.finishRun(recentRun, 'completed');

      // Old run - outside retention period (10 days old)
      const oldRunId = getUniqueRunId();
      const oldTimestamp = now - 10 * dayInMs;
      const oldRun = createPipelineMetaWithTimestamp(oldRunId, oldTimestamp);
      await adapter.initiateRun(oldRun);
      await adapter.finishRun(oldRun, 'completed');

      // Very old run - outside retention period (14 days old)
      const veryOldRunId = getUniqueRunId();
      const veryOldTimestamp = now - 14 * dayInMs;
      const veryOldRun = createPipelineMetaWithTimestamp(veryOldRunId, veryOldTimestamp);
      await adapter.initiateRun(veryOldRun);
      await adapter.finishRun(veryOldRun, 'completed');

      // Verify all runs are present initially
      const initialRuns = await adapter.listRuns(pipelineName);
      expect(initialRuns.some((run) => run.runId === recentRunId)).toBe(true);
      expect(initialRuns.some((run) => run.runId === oldRunId)).toBe(true);
      expect(initialRuns.some((run) => run.runId === veryOldRunId)).toBe(true);

      // Run the purge operation
      await adapter.purgeOldData(pipelineName);

      // Verify only the recent run remains
      const remainingRuns = await adapter.listRuns(pipelineName);
      expect(remainingRuns.some((run) => run.runId === recentRunId)).toBe(true);
      expect(remainingRuns.some((run) => run.runId === oldRunId)).toBe(false);
      expect(remainingRuns.some((run) => run.runId === veryOldRunId)).toBe(false);
    });

    it('should use default retention period if not specified', async () => {
      // Set up test data with different timestamps
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;

      // Clear any existing settings
      await adapter.saveSettings(pipelineName, {});

      // Create runs with different ages
      // Recent run - within default retention period (5 days old)
      const recentRunId = getUniqueRunId();
      const recentTimestamp = now - 5 * dayInMs;
      const recentRun = createPipelineMetaWithTimestamp(recentRunId, recentTimestamp);
      await adapter.initiateRun(recentRun);
      await adapter.finishRun(recentRun, 'completed');

      // Old run - outside default retention period (20 days old)
      const oldRunId = getUniqueRunId();
      const oldTimestamp = now - 20 * dayInMs;
      const oldRun = createPipelineMetaWithTimestamp(oldRunId, oldTimestamp);
      await adapter.initiateRun(oldRun);
      await adapter.finishRun(oldRun, 'completed');

      // Verify both runs are present initially
      const initialRuns = await adapter.listRuns(pipelineName);
      expect(initialRuns.some((run) => run.runId === recentRunId)).toBe(true);
      expect(initialRuns.some((run) => run.runId === oldRunId)).toBe(true);

      // Run the purge operation with no explicit retention period
      await adapter.purgeOldData(pipelineName);

      // Verify only the recent run remains
      const remainingRuns = await adapter.listRuns(pipelineName);
      expect(remainingRuns.some((run) => run.runId === recentRunId)).toBe(true);
      expect(remainingRuns.some((run) => run.runId === oldRunId)).toBe(false);
    });

    it('should respect the override retention period parameter', async () => {
      // Set up test data with different timestamps
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      const overrideRetentionDays = 3; // Very short retention

      // Set a longer default in settings
      await adapter.saveSettings(pipelineName, { dataRetentionDays: 30 });

      // Create runs with different ages
      // Very recent run (1 day old)
      const veryRecentRunId = getUniqueRunId();
      const veryRecentTimestamp = now - 1 * dayInMs;
      const veryRecentRun = createPipelineMetaWithTimestamp(veryRecentRunId, veryRecentTimestamp);
      await adapter.initiateRun(veryRecentRun);
      await adapter.finishRun(veryRecentRun, 'completed');

      // Somewhat recent run (5 days old) - should be deleted with 3-day override
      const somewhatRecentRunId = getUniqueRunId();
      const somewhatRecentTimestamp = now - 5 * dayInMs;
      const somewhatRecentRun = createPipelineMetaWithTimestamp(somewhatRecentRunId, somewhatRecentTimestamp);
      await adapter.initiateRun(somewhatRecentRun);
      await adapter.finishRun(somewhatRecentRun, 'completed');

      // Verify both runs are present initially
      const initialRuns = await adapter.listRuns(pipelineName);
      expect(initialRuns.some((run) => run.runId === veryRecentRunId)).toBe(true);
      expect(initialRuns.some((run) => run.runId === somewhatRecentRunId)).toBe(true);

      // Run the purge operation with override retention period
      await adapter.purgeOldData(pipelineName, overrideRetentionDays);

      // Verify only the very recent run remains
      const remainingRuns = await adapter.listRuns(pipelineName);
      expect(remainingRuns.some((run) => run.runId === veryRecentRunId)).toBe(true);
      expect(remainingRuns.some((run) => run.runId === somewhatRecentRunId)).toBe(false);
    });
  });
});
