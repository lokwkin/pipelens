import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { StepMeta } from '../step';
import { FilterOptions, RunMeta, StorageAdapter } from './storage-adapter';
import { Pipeline } from '../pipeline';

// Promisify file system operations
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

/**
 * File-based implementation of the StorageAdapter interface.
 * Stores pipeline runs and step data in a directory structure.
 *
 * File Structure:
 * - basePath/
 *   - pipelines/
 *     - {pipelineName}.json - Contains array of RunMeta objects for each pipeline
 *   - runs/
 *     - {runId}/
 *       - meta.json - Contains RunMeta object for the run
 *       - steps.json - Contains array of StepMeta objects for all steps in the run
 *       - steps/
 *         - {stepKey}.json - Individual step data
 *   - timeseries/
 *     - {pipelineName}.{stepName}.json - Contains timeseries data for each step across runs
 */
export class FileStorageAdapter implements StorageAdapter {
  private basePath: string;
  private lockMap: Map<string, Promise<any>> = new Map();

  /**
   * Creates a new FileStorageAdapter
   * @param basePath Base directory to store all data
   */
  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Ensures the storage directory exists
   */
  public async connect(): Promise<void> {
    await this.ensureDir(this.basePath);
    await this.ensureDir(path.join(this.basePath, 'pipelines'));
    await this.ensureDir(path.join(this.basePath, 'runs'));
    await this.ensureDir(path.join(this.basePath, 'timeseries'));
  }

  /**
   * Lists all pipelines that exist in storage
   */
  public async listPipelines(): Promise<string[]> {
    const pipelinesDir = path.join(this.basePath, 'pipelines');
    await this.ensureDir(pipelinesDir);

    const files = await readdir(pipelinesDir);
    return files.map((file) => path.basename(file, '.json'));
  }

  /**
   * Lists all runs for a specific pipeline with optional filtering
   */
  public async listRuns(pipelineName: string, options?: FilterOptions): Promise<RunMeta[]> {
    const pipelineDir = path.join(this.basePath, 'pipelines', `${pipelineName}.json`);

    try {
      // Check if pipeline exists
      await stat(pipelineDir);

      // Read pipeline runs index
      const data = await this.readJsonFile(pipelineDir);
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

        // Apply pagination
        if (options.offset !== undefined) {
          runs = runs.slice(options.offset);
        }

        if (options.limit !== undefined) {
          runs = runs.slice(0, options.limit);
        }
      }

      return runs;
    } catch (error) {
      // If pipeline file doesn't exist, return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
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
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      status: 'running',
    };

    // Create run directory
    const runDir = path.join(this.basePath, 'runs', runId);
    await this.ensureDir(runDir);

    // Write run metadata
    await this.writeJsonFile(path.join(runDir, 'meta.json'), runMeta);

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

    const runDir = path.join(this.basePath, 'runs', runId);

    // Read current run metadata
    const metaPath = path.join(runDir, 'meta.json');
    const runMeta = (await this.readJsonFile(metaPath)) as RunMeta;

    // Update run metadata
    const endTime = Date.now();
    const updatedMeta: RunMeta = {
      ...runMeta,
      endTime,
      duration: endTime - runMeta.startTime,
      status,
    };

    // Write updated metadata
    await this.writeJsonFile(metaPath, updatedMeta);

    // Write steps data
    await this.writeJsonFile(path.join(runDir, 'steps.json'), stepsDump);

    // Update pipeline runs index
    await this.updatePipelineIndex(pipelineName, updatedMeta);
  }

  /**
   * Gets all data for a specific run
   */
  public async getRunData(runId: string): Promise<any> {
    const runDir = path.join(this.basePath, 'runs', runId);

    try {
      // Read run metadata
      const metaPath = path.join(runDir, 'meta.json');
      const meta = await this.readJsonFile(metaPath);

      // Read steps data
      const stepsPath = path.join(runDir, 'steps.json');
      let steps = [];
      try {
        steps = await this.readJsonFile(stepsPath);
      } catch (error) {
        // Steps data might not exist yet if run is still in progress
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      return { meta, steps };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Run with ID ${runId} not found`);
      }
      throw error;
    }
  }

  /**
   * Lists all steps for a specific run
   */
  public async listSteps(runId: string): Promise<StepMeta[]> {
    const stepsPath = path.join(this.basePath, 'runs', runId, 'steps.json');

    try {
      return (await this.readJsonFile(stepsPath)) as StepMeta[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Initiates a step within a run
   */
  public async initiateStep(runId: string, step: StepMeta): Promise<void> {
    const runDir = path.join(this.basePath, 'runs', runId);
    const stepsDir = path.join(runDir, 'steps');
    await this.ensureDir(stepsDir);

    // Write step data to individual file
    await this.writeJsonFile(path.join(stepsDir, `${step.key}.json`), step);
  }

  /**
   * Finishes a step and updates its metadata
   */
  public async finishStep(runId: string, step: StepMeta): Promise<void> {
    const runDir = path.join(this.basePath, 'runs', runId);
    const stepsDir = path.join(runDir, 'steps');
    await this.ensureDir(stepsDir);

    // Write updated step data
    await this.writeJsonFile(path.join(stepsDir, `${step.key}.json`), step);

    // Update timeseries data for this step
    await this.updateStepTimeseries(step.key.split('.')[0], runId, step);
  }

  /**
   * Gets timeseries data for a specific step within a time range
   */
  public async getStepTimeseries(
    pipelineName: string,
    stepName: string,
    timeRange: { start: number; end: number },
  ): Promise<any> {
    const timeseriesPath = path.join(this.basePath, 'timeseries', `${pipelineName}.${stepName}.json`);

    try {
      const data = (await this.readJsonFile(timeseriesPath)) as Array<{
        timestamp: number;
        runId: string;
        value: number;
      }>;

      // Filter by time range
      return data.filter((entry) => entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Updates the timeseries data for a step
   */
  private async updateStepTimeseries(pipelineName: string, runId: string, step: StepMeta): Promise<void> {
    const timeseriesDir = path.join(this.basePath, 'timeseries');
    await this.ensureDir(timeseriesDir);

    // Use pipeline name + step name for the timeseries file
    // This groups data by logical step rather than by specific step instance
    const timeseriesKey = `${pipelineName}.${step.name}`;
    const timeseriesPath = path.join(timeseriesDir, `${timeseriesKey}.json`);

    // Create a timeseries entry
    const entry = {
      timestamp: step.time.startTs,
      runId,
      value: step.time.timeUsageMs,
      stepKey: step.key, // Keep the original step key for reference
    };

    // Use file lock to prevent race conditions
    await this.withFileLock(timeseriesPath, async () => {
      let timeseriesData = [];

      try {
        timeseriesData = (await this.readJsonFile(timeseriesPath)) as any[];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist yet, start with empty array
      }

      // Add new entry
      timeseriesData.push(entry);

      // Sort by timestamp (newest first)
      timeseriesData.sort((a, b) => b.timestamp - a.timestamp);

      // Write updated data
      await this.writeJsonFile(timeseriesPath, timeseriesData);
    });
  }

  /**
   * Updates the pipeline index with a run
   */
  private async updatePipelineIndex(pipelineName: string, runMeta: RunMeta): Promise<void> {
    const pipelinesDir = path.join(this.basePath, 'pipelines');
    await this.ensureDir(pipelinesDir);

    const pipelinePath = path.join(pipelinesDir, `${pipelineName}.json`);

    // Use file lock to prevent race conditions
    await this.withFileLock(pipelinePath, async () => {
      let pipelineRuns: RunMeta[] = [];

      try {
        pipelineRuns = (await this.readJsonFile(pipelinePath)) as RunMeta[];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist yet, start with empty array
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
      await this.writeJsonFile(pipelinePath, pipelineRuns);
    });
  }

  /**
   * Ensures a directory exists
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Reads and parses a JSON file
   */
  private async readJsonFile(filePath: string): Promise<any> {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Writes data to a JSON file
   */
  private async writeJsonFile(filePath: string, data: any): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Executes a function with a file lock to prevent race conditions
   */
  private async withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    // Check if there's an existing lock
    const lock = this.lockMap.get(filePath);

    // Create a new promise chain
    const newLock = (lock || Promise.resolve()).then(async () => {
      try {
        return await fn();
      } finally {
        // If this is the current lock, remove it
        if (this.lockMap.get(filePath) === newLock) {
          this.lockMap.delete(filePath);
        }
      }
    });

    // Set the new lock
    this.lockMap.set(filePath, newLock);

    // Return the result of the function
    return newLock;
  }
}
