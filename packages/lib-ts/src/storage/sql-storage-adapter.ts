import { StepMeta } from '../step';
import { FilterOptions, RunMeta, StepTimeseriesEntry, StorageAdapter } from './storage-adapter';
import { PipelineMeta } from '../pipeline';
import { Knex } from 'knex';

interface ConnectionConfig extends Knex.Config {}

/**
 * SQL-based implementation of the StorageAdapter interface.
 * Supports both SQLite and PostgreSQL databases via Knex.
 * Stores pipeline runs and step data in SQL database tables.
 *
 * Database Schema:
 * - runs: Stores run metadata
 * - steps: Stores step metadata
 */
export class SQLStorageAdapter implements StorageAdapter {
  private config: Knex.Config;
  private db: Knex | null = null;
  private connected: boolean = false;

  /**
   * Creates a new SQLStorageAdapter
   * @param knexConfig Knex configuration object for the database connection
   */
  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  /**
   * Connect to the database and initialize the schema
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Import knex
      const knex = await import('knex');

      // Create the database connection using the config
      this.db = knex.default(this.config);

      // Initialize schema
      await this.initSchema();

      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to database: ${error}`);
    }
  }

  /**
   * Initialize the database schema
   */
  private async initSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Create runs table if it doesn't exist
    const runsTableExists = await this.db.schema.hasTable('runs');
    if (!runsTableExists) {
      await this.db.schema.createTable('runs', (table) => {
        table.string('run_id').primary();
        table.string('pipeline_name').notNullable();
        table.bigInteger('start_time').notNullable();
        table.bigInteger('end_time').nullable();
        table.integer('duration').nullable();
        table.string('status').notNullable().checkIn(['completed', 'failed', 'running']);

        // Create indices for faster queries
        table.index('pipeline_name');
        table.index('start_time');
      });
    }

    // Create steps table if it doesn't exist
    const stepsTableExists = await this.db.schema.hasTable('steps');
    if (!stepsTableExists) {
      await this.db.schema.createTable('steps', (table) => {
        table.string('key').notNullable();
        table.string('run_id').notNullable();
        table.string('name').notNullable();
        table.bigInteger('start_time').notNullable();
        table.bigInteger('end_time').nullable();
        table.integer('time_usage_ms').nullable();
        table.text('result').nullable();
        table.text('error').nullable();
        table.text('records').nullable();

        // Primary key and foreign key
        table.primary(['run_id', 'key']);
        table.foreign('run_id').references('run_id').inTable('runs').onDelete('CASCADE');

        // Create indices for faster queries
        table.index('run_id');
        table.index('name');
        table.index('end_time');
      });
    }
  }

  /**
   * List all pipeline names
   */
  public async listPipelines(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Query distinct pipeline names with latest run first
      const rows = await this.db
        .select('pipeline_name')
        .from(function (this: Knex.QueryBuilder) {
          this.select('pipeline_name')
            .max('start_time as latest_time')
            .from('runs')
            .groupBy('pipeline_name')
            .as('latest_runs');
        })
        .orderBy('latest_time', 'desc');

      return rows.map((row) => row.pipeline_name);
    } catch (error) {
      console.error('Error listing pipelines:', error);
      return [];
    }
  }

  /**
   * List all runs for a pipeline
   */
  public async listRuns(pipelineName: string, options?: FilterOptions): Promise<RunMeta[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Start building the query
      let query = this.db.select('*').from('runs').where('pipeline_name', pipelineName);

      // Apply filters
      if (options?.status) {
        query = query.andWhere('status', options.status);
      }

      if (options?.startDate) {
        query = query.andWhere('start_time', '>=', options.startDate.getTime());
      }

      if (options?.endDate) {
        query = query.andWhere('start_time', '<=', options.endDate.getTime());
      }

      // Apply sorting
      query = query.orderBy('start_time', 'desc');

      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      const rows = await query;

      return rows.map((row) => ({
        runId: row.run_id,
        pipeline: row.pipeline_name,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        status: row.status as 'completed' | 'failed' | 'running',
      }));
    } catch (error) {
      console.error('Error listing runs:', error);
      return [];
    }
  }

  /**
   * Initialize a run
   */
  public async initiateRun(pipelineMeta: PipelineMeta): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const { runId, time, name } = pipelineMeta;

    try {
      // Insert run directly
      await this.db('runs').insert({
        run_id: runId,
        pipeline_name: name,
        start_time: time.startTs,
        status: 'running',
      });
    } catch (error) {
      console.error('Error initiating run:', error);
      throw error;
    }
  }

  /**
   * Finish a run
   */
  public async finishRun(pipelineMeta: PipelineMeta, status: 'completed' | 'failed' | 'running'): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const { runId, time, steps } = pipelineMeta;

    try {
      // Calculate duration if end time exists
      const endTime = time.endTs;
      const duration = endTime ? endTime - time.startTs : undefined;

      // Update run status
      await this.db('runs').where('run_id', runId).update({
        status,
        end_time: endTime,
        duration,
      });

      // Make sure all steps are stored (in case any were missed)
      const promises = steps.map((step) => this.finishStep(runId, step));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error finishing run:', error);
      throw error;
    }
  }

  /**
   * Get run data
   */
  public async getRunData(runId: string): Promise<any> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Get run metadata
      const runMeta = await this.db('runs').where('run_id', runId).first();
      if (!runMeta) {
        throw new Error(`Run with ID ${runId} not found`);
      }

      // Get steps
      const steps = await this.listRunSteps(runId);

      return {
        meta: {
          runId: runMeta.run_id,
          pipeline: runMeta.pipeline_name,
          startTime: runMeta.start_time,
          endTime: runMeta.end_time,
          duration: runMeta.duration,
          status: runMeta.status,
        },
        steps,
      };
    } catch (error) {
      console.error('Error getting run data:', error);
      throw error;
    }
  }

  /**
   * List all steps for a run
   */
  public async listRunSteps(runId: string): Promise<StepMeta[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      const rows = await this.db('steps').where('run_id', runId).orderBy('start_time', 'asc');

      return rows.map((row) => {
        // Parse JSON data
        const records = JSON.parse(row.records || '{}');
        const result = row.result ? JSON.parse(row.result) : undefined;

        return {
          key: row.key,
          name: row.name,
          time: {
            startTs: row.start_time,
            endTs: row.end_time,
            timeUsageMs: row.time_usage_ms,
          },
          records,
          result,
          error: row.error,
        };
      });
    } catch (error) {
      console.error('Error listing run steps:', error);
      return [];
    }
  }

  /**
   * Initialize a step
   */
  public async initiateStep(runId: string, step: StepMeta): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Prepare records as JSON
      const recordsJson = JSON.stringify(step.records || {});

      const data = {
        key: step.key,
        run_id: runId,
        name: step.name,
        start_time: step.time.startTs,
        records: recordsJson,
      };

      // Handle upsert differently for SQLite vs PostgreSQL
      if (this.db.client.config.client === 'sqlite3') {
        // SQLite upsert approach
        await this.db.raw(
          `INSERT INTO steps (key, run_id, name, start_time, records)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(run_id, key) DO UPDATE SET
             start_time = excluded.start_time,
             records = excluded.records`,
          [step.key, runId, step.name, step.time.startTs, recordsJson],
        );
      } else {
        // PostgreSQL upsert approach
        await this.db('steps').insert(data).onConflict(['run_id', 'key']).merge({
          start_time: step.time.startTs,
          records: recordsJson,
        });
      }
    } catch (error) {
      console.error('Error initiating step:', error);
      throw error;
    }
  }

  /**
   * Finish a step
   */
  public async finishStep(runId: string, step: StepMeta): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Prepare JSON data
      const recordsJson = JSON.stringify(step.records || {});
      const resultJson = step.result !== undefined ? JSON.stringify(step.result) : null;

      const data = {
        key: step.key,
        run_id: runId,
        name: step.name,
        start_time: step.time.startTs,
        end_time: step.time.endTs,
        time_usage_ms: step.time.timeUsageMs,
        result: resultJson,
        error: step.error || null,
        records: recordsJson,
      };

      // Handle upsert differently for SQLite vs PostgreSQL
      if (this.db.client.config.client === 'sqlite3') {
        // SQLite upsert approach
        await this.db.raw(
          `INSERT INTO steps (key, run_id, name, start_time, end_time, time_usage_ms, result, error, records)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_id, key) DO UPDATE SET
             name = excluded.name,
             start_time = excluded.start_time,
             end_time = excluded.end_time,
             time_usage_ms = excluded.time_usage_ms,
             result = excluded.result,
             error = excluded.error,
             records = excluded.records`,
          [
            step.key,
            runId,
            step.name,
            step.time.startTs,
            step.time.endTs,
            step.time.timeUsageMs,
            resultJson,
            step.error || null,
            recordsJson,
          ],
        );
      } else {
        // PostgreSQL upsert approach
        await this.db('steps')
          .insert(data)
          .onConflict(['run_id', 'key'])
          .merge({
            name: step.name,
            start_time: step.time.startTs,
            end_time: step.time.endTs,
            time_usage_ms: step.time.timeUsageMs,
            result: resultJson,
            error: step.error || null,
            records: recordsJson,
          });
      }
    } catch (error) {
      console.error('Error finishing step:', error);
      throw error;
    }
  }

  /**
   * Get pipeline step timeseries data
   */
  public async getPipelineStepTimeseries(
    pipelineName: string,
    stepName: string,
    timeRange: { start: number; end: number },
  ): Promise<Array<StepTimeseriesEntry & { stepMeta?: StepMeta }>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Query for completed steps that match the criteria
      const rows = await this.db('steps as s')
        .join('runs as r', 's.run_id', 'r.run_id')
        .select('s.*', 'r.pipeline_name')
        .where('r.pipeline_name', pipelineName)
        .andWhere('s.name', stepName)
        .whereNotNull('s.end_time')
        .whereNotNull('s.time_usage_ms')
        .whereBetween('s.end_time', [timeRange.start, timeRange.end])
        .orderBy('s.end_time', 'asc');

      return rows.map((row) => {
        // Parse records and result from JSON
        const records = JSON.parse(row.records || '{}');
        const result = row.result ? JSON.parse(row.result) : undefined;

        // Create the step metadata
        const stepMeta: StepMeta = {
          key: row.key,
          name: row.name,
          time: {
            startTs: row.start_time,
            endTs: row.end_time,
            timeUsageMs: row.time_usage_ms,
          },
          records,
          result,
          error: row.error,
        };

        // Return as a timeseries entry with attached step metadata
        return {
          timestamp: row.end_time,
          runId: row.run_id,
          value: row.time_usage_ms,
          stepKey: row.key,
          stepMeta,
        };
      });
    } catch (error) {
      console.error('Error getting pipeline step timeseries:', error);
      return [];
    }
  }

  /**
   * List all available steps in a pipeline
   */
  public async listPipelineSteps(pipelineName: string): Promise<string[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Query distinct step names for this pipeline
      const rows = await this.db('steps as s')
        .join('runs as r', 's.run_id', 'r.run_id')
        .distinct('s.name')
        .where('r.pipeline_name', pipelineName)
        .whereNotNull('s.end_time')
        .orderBy('s.name');

      return rows.map((row) => row.name);
    } catch (error) {
      console.error('Error listing pipeline steps:', error);
      return [];
    }
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
      this.connected = false;
    }
  }
}
