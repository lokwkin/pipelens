import { Pipeline } from '../src/pipeline';
import { FileStorageAdapter } from '../src/storage/file-storage-adapter';
import * as fs from 'fs';
import * as path from 'path';

// Helper function to clean up test files
function cleanupTestFiles(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// Helper function to wait for a specified time
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('End-to-End Integration Tests', () => {
  const testStoragePath = path.join(__dirname, '../test-storage');

  beforeEach(() => {
    // Clean up before each test
    cleanupTestFiles(testStoragePath);
  });

  afterAll(() => {
    // Clean up after all tests
    cleanupTestFiles(testStoragePath);
  });

  it('should track a complete pipeline execution with multiple steps', async () => {
    // Create a storage adapter
    const storageAdapter = new FileStorageAdapter(testStoragePath);
    await storageAdapter.connect();

    // Create a pipeline with auto-save enabled
    const pipeline = new Pipeline('integration-test', {
      autoSave: true,
      storageAdapter,
    });

    // Run the pipeline with multiple steps
    const result = await pipeline.track(async (st) => {
      // Step 1: Simulate data loading
      const data = await st.step('load-data', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate network delay
        return { items: [1, 2, 3, 4, 5] };
      });

      // Record some metadata
      await st.record('data-count', data.items.length);

      // Step 2: Process the data
      const processed = await st.step('process-data', async (processStep) => {
        const results = [];

        // Create substeps for each item
        for (const item of data.items) {
          const result = await processStep.step(`process-item-${item}`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate processing
            return item * 2;
          });
          results.push(result);
        }

        return results;
      });

      // Step 3: Aggregate results
      const sum = await st.step('aggregate-results', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30)); // Simulate aggregation
        return processed.reduce((acc, val) => acc + val, 0);
      });

      return {
        originalData: data,
        processedData: processed,
        sum,
      };
    });

    // Wait for all async operations to complete
    await wait(100);

    // Verify the pipeline result
    expect(result).toEqual({
      originalData: { items: [1, 2, 3, 4, 5] },
      processedData: [2, 4, 6, 8, 10],
      sum: 30,
    });

    // Verify that the run was saved
    const runs = await storageAdapter.listRuns('integration-test');
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('completed');

    // Get the run data
    const runData = await storageAdapter.getRunData(pipeline.getRunId());
    expect(runData).toBeDefined();
    expect(runData.meta.status).toBe('completed');

    // Verify steps were recorded
    const steps = await storageAdapter.listRunSteps(pipeline.getRunId());

    // Check that we have the expected number of steps (1 pipeline + 3 main steps + 5 substeps)
    expect(steps.length).toBe(9);

    // Verify the step hierarchy
    const hierarchy = pipeline.outputHierarchy();
    expect(hierarchy.name).toBe('integration-test');
    expect(hierarchy.substeps.length).toBe(3);

    // Check the first step (load-data)
    expect(hierarchy.substeps[0].name).toBe('load-data');
    expect(hierarchy.substeps[0].result).toEqual({ items: [1, 2, 3, 4, 5] });

    // Check the second step (process-data)
    expect(hierarchy.substeps[1].name).toBe('process-data');
    expect(hierarchy.substeps[1].result).toEqual([2, 4, 6, 8, 10]);

    // Count the number of process-item steps
    const processItemSteps = steps.filter((step) => step.key.startsWith('integration-test.process-data.process-item'));
    expect(processItemSteps.length).toBe(5);

    // Check the third step (aggregate-results)
    expect(hierarchy.substeps[2].name).toBe('aggregate-results');
    expect(hierarchy.substeps[2].result).toBe(30);

    // Verify recorded data
    expect(hierarchy.record['data-count']).toBe(5);

    // Verify time tracking
    expect(hierarchy.time.timeUsageMs).toBeGreaterThan(0);
    expect(hierarchy.substeps[0].time.timeUsageMs).toBeGreaterThanOrEqual(50);
    expect(hierarchy.substeps[2].time.timeUsageMs).toBeGreaterThanOrEqual(30);
  });

  it('should handle errors in steps and mark the run as failed', async () => {
    // Create a storage adapter
    const storageAdapter = new FileStorageAdapter(testStoragePath);
    await storageAdapter.connect();

    // Create a pipeline with auto-save enabled
    const pipeline = new Pipeline('error-test', {
      autoSave: true,
      storageAdapter,
    });

    // Run the pipeline with a step that will fail
    try {
      await pipeline.track(async (st) => {
        // Step 1: This will succeed
        await st.step('successful-step', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return 'success';
        });

        // Step 2: This will fail
        await st.step('failing-step', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('Intentional test error');
        });

        // This should not execute
        return 'completed';
      });

      // Should not reach here
      fail('Pipeline should have thrown an error');
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toBe('Intentional test error');
      } else {
        fail('Expected error to be an instance of Error');
      }
    }

    // Wait for all async operations to complete
    await wait(100);

    // Verify that the run was saved and marked as failed
    const runs = await storageAdapter.listRuns('error-test');
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('failed');

    // Get the run data
    const runData = await storageAdapter.getRunData(pipeline.getRunId());
    expect(runData).toBeDefined();
    expect(runData.meta.status).toBe('failed');

    // Verify steps were recorded
    const steps = await storageAdapter.listRunSteps(pipeline.getRunId());

    // Check that we have the expected number of steps (1 pipeline + 2 steps)
    expect(steps.length).toBe(3);

    // Verify the step hierarchy
    const hierarchy = pipeline.outputHierarchy();
    expect(hierarchy.name).toBe('error-test');
    expect(hierarchy.substeps.length).toBe(2);

    // Check the first step (successful-step)
    expect(hierarchy.substeps[0].name).toBe('successful-step');
    expect(hierarchy.substeps[0].result).toBe('success');
    expect(hierarchy.substeps[0].error).toBeUndefined();

    // Check the second step (failing-step)
    expect(hierarchy.substeps[1].name).toBe('failing-step');
    expect(hierarchy.substeps[1].error).toBe('Intentional test error');

    // Verify time tracking
    expect(hierarchy.time.timeUsageMs).toBeGreaterThan(0);
    expect(hierarchy.substeps[0].time.timeUsageMs).toBeGreaterThanOrEqual(20);
    expect(hierarchy.substeps[1].time.timeUsageMs).toBeGreaterThanOrEqual(20);
  });
});
