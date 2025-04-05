import { StepMeta } from '../step';
import { FilterOptions, RunMeta, StepTimeseriesEntry, StorageAdapter } from './storage-adapter';
import { PipelineMeta } from '../pipeline';

// Define types without direct imports
type Database = any;

/**
 * SQLite-based implementation of the StorageAdapter interface.
 * Stores pipeline runs and step data in SQLite database tables.
 *
 * Database Schema:
 * - runs: Stores run metadata
 * - steps: Stores step metadata
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  private dbPath: string;
  private db: Database | null = null;
  private connected: boolean = false;
  private lockMap: Map<string, Promise<any>> = new Map();
  private sqlite: any;
  private sqlite3: any;

  /**
   * Creates a new SQLiteStorageAdapter
   * @param dbPath Path to the SQLite database file
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Connect to the SQLite database and initialize the schema
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Dynamically import sqlite and sqlite3
      this.sqlite3 = await import('sqlite3');
      const sqliteModule = await import('sqlite');
      this.sqlite = sqliteModule;
    } catch (error) {
      throw new Error('SQLite dependencies are not installed. Please install them with: npm install sqlite sqlite3');
    }

    // Open the database connection
    this.db = await this.sqlite.open({
      filename: this.dbPath,
      driver: this.sqlite3.default.Database,
    });

    // Enable foreign keys
    await this.db.exec('PRAGMA foreign_keys = ON;');

    // Create tables if they don't exist
    await this.initSchema();

    this.connected = true;
  }

  /**
   * Initialize the database schema
   */
  private async initSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Create runs table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        pipeline_name TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        status TEXT NOT NULL CHECK(status IN ('completed', 'failed', 'running'))
      );
    `);

    // Create steps table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS steps (
        key TEXT NOT NULL,
        run_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        time_usage_ms INTEGER,
        result TEXT,
        error TEXT,
        records TEXT,
        PRIMARY KEY (run_id, key),
        FOREIGN KEY (run_id) REFERENCES runs (run_id) ON DELETE CASCADE
      );
    `);

    // Create indices for faster queries
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_pipeline ON runs (pipeline_name);
      CREATE INDEX IF NOT EXISTS idx_runs_start_time ON runs (start_time);
      CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps (run_id);
      CREATE INDEX IF NOT EXISTS idx_steps_name ON steps (name);
      CREATE INDEX IF NOT EXISTS idx_steps_end_time ON steps (end_time);
      CREATE INDEX IF NOT EXISTS idx_steps_completion ON steps (run_id, end_time, time_usage_ms);
    `);
  }

  /**
   * List all pipeline names
   */
  public async listPipelines(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Query distinct pipeline names directly from runs table
      // Use a subquery to get the max start_time for each pipeline for ordering
      const rows = await this.db.all(`
        SELECT pipeline_name 
        FROM (
          SELECT pipeline_name, MAX(start_time) as latest_time 
          FROM runs 
          GROUP BY pipeline_name
        ) 
        ORDER BY latest_time DESC
      `);

      return rows.map((row: any) => row.pipeline_name);
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
      let query = 'SELECT * FROM runs WHERE pipeline_name = ?';
      const params: any[] = [pipelineName];

      // Apply filters
      if (options?.status) {
        query += ' AND status = ?';
        params.push(options.status);
      }

      if (options?.startDate) {
        query += ' AND start_time >= ?';
        params.push(options.startDate.getTime());
      }

      if (options?.endDate) {
        query += ' AND start_time <= ?';
        params.push(options.endDate.getTime());
      }

      // Apply sorting
      query += ' ORDER BY start_time DESC';

      // Apply pagination
      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }

      const rows = await this.db.all(query, ...params);

      return rows.map((row: any) => ({
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
      // Create run metadata - no need to check pipeline existence first
      const runMeta: RunMeta = {
        runId,
        pipeline: name,
        startTime: time.startTs,
        status: 'running',
      };

      // Insert run directly
      await this.db.run(
        'INSERT INTO runs (run_id, pipeline_name, start_time, status) VALUES (?, ?, ?, ?)',
        runMeta.runId,
        runMeta.pipeline,
        runMeta.startTime,
        runMeta.status,
      );
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
      await this.db.run(
        'UPDATE runs SET status = ?, end_time = ?, duration = ? WHERE run_id = ?',
        status,
        endTime,
        duration,
        runId,
      );

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
      const runMeta = await this.db.get('SELECT * FROM runs WHERE run_id = ?', runId);
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
      const rows = await this.db.all('SELECT * FROM steps WHERE run_id = ? ORDER BY start_time ASC', runId);

      return rows.map((row: any) => {
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

      // Insert or update step
      await this.db.run(
        `INSERT INTO steps (
          key, run_id, name, start_time, records
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(run_id, key) DO UPDATE SET
          start_time = excluded.start_time,
          records = excluded.records`,
        step.key,
        runId,
        step.name,
        step.time.startTs,
        recordsJson,
      );
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

      // Insert or update step
      await this.db.run(
        `INSERT INTO steps (
          key, run_id, name, start_time, end_time, time_usage_ms, result, error, records
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, key) DO UPDATE SET
          name = excluded.name,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          time_usage_ms = excluded.time_usage_ms,
          result = excluded.result,
          error = excluded.error,
          records = excluded.records`,
        step.key,
        runId,
        step.name,
        step.time.startTs,
        step.time.endTs,
        step.time.timeUsageMs,
        resultJson,
        step.error,
        recordsJson,
      );
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
      // Query for completed steps that match the criteria from the steps table
      const rows = await this.db.all(
        `SELECT s.*, r.pipeline_name 
         FROM steps s
         JOIN runs r ON s.run_id = r.run_id
         WHERE r.pipeline_name = ? 
         AND s.name = ? 
         AND s.end_time IS NOT NULL 
         AND s.time_usage_ms IS NOT NULL
         AND s.end_time BETWEEN ? AND ?
         ORDER BY s.end_time ASC`,
        pipelineName,
        stepName,
        timeRange.start,
        timeRange.end,
      );

      return rows.map((row: any) => {
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
      // Query distinct step names from completed steps for this pipeline
      const rows = await this.db.all(
        `SELECT DISTINCT s.name 
         FROM steps s
         JOIN runs r ON s.run_id = r.run_id
         WHERE r.pipeline_name = ? 
         AND s.end_time IS NOT NULL
         ORDER BY s.name`,
        pipelineName,
      );

      return rows.map((row: any) => row.name);
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
      await this.db.close();
      this.db = null;
      this.connected = false;
    }
  }
}
