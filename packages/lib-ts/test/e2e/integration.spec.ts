import { Pipeline } from '../../src/pipeline';
import { HttpTransport } from '../../src/transport/http-transport';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

    // Reset mocks between tests
    jest.clearAllMocks();

    // Set up the axios mock
    mockedAxios.post.mockResolvedValue({ data: {} });
  });

  afterAll(() => {
    // Clean up after all tests
    cleanupTestFiles(testStoragePath);
  });

  /**
   * This test verifies the complete lifecycle of a pipeline with multiple steps:
   *
   * 1. Initializes a Pipeline with HttpTransport for data persistence
   * 2. Tests nested steps hierarchy with three main steps:
   *    - load-data: simulates loading data with network delay
   *    - process-data: demonstrates processing with substeps for each item
   *    - aggregate-results: shows aggregation of processed data
   * 3. Verifies metadata recording with the record() method
   * 4. Confirms correct HTTP transport communication:
   *    - Pipeline events (start/finish)
   *    - Step events (start/finish) for all steps and substeps
   * 5. Validates time tracking for steps and operations
   * 6. Ensures the nested structure of steps is maintained properly
   * 7. Checks that results flow correctly through the pipeline
   */
  it('should track a complete pipeline execution with multiple steps', async () => {
    // Create a transport with mocked HTTP
    const transport = new HttpTransport({
      baseUrl: 'https://api.example.com',
      batchLogs: false,
    });

    // Create a pipeline with auto-save enabled
    const pipeline = new Pipeline('integration-test', {
      autoSave: 'real_time',
      transport,
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

    // Count the HTTP calls
    const postCalls = mockedAxios.post.mock.calls;

    // We expect exactly 20 HTTP calls for the following reasons:
    // - 1 call for pipeline/start (initiateRun)
    // - 1 call for pipeline/finish (finishRun)
    // - 9 calls for step/start (initiateStep):
    //   * 1 for the Pipeline itself (Pipeline extends Step)
    //   * 1 for load-data
    //   * 1 for process-data
    //   * 5 for each process-item-N
    //   * 1 for aggregate-results
    // - 9 calls for step/finish (finishStep):
    //   * 1 for the Pipeline itself
    //   * 1 for load-data
    //   * 1 for process-data
    //   * 5 for each process-item-N
    //   * 1 for aggregate-results
    expect(postCalls.length).toBe(20);

    // Verify the step hierarchy
    const hierarchy = pipeline.outputNested();
    expect(hierarchy.name).toBe('integration-test');
    expect(hierarchy.substeps.length).toBe(3);

    // Check the first step (load-data)
    expect(hierarchy.substeps[0].name).toBe('load-data');
    expect(hierarchy.substeps[0].result).toEqual({ items: [1, 2, 3, 4, 5] });

    // Check the second step (process-data)
    expect(hierarchy.substeps[1].name).toBe('process-data');
    expect(hierarchy.substeps[1].result).toEqual([2, 4, 6, 8, 10]);

    // Check that process-item steps exist in the step hierarchy
    const processDataStep = hierarchy.substeps[1];
    expect(processDataStep.substeps.length).toBe(5);
    expect(processDataStep.substeps.map((s) => s.name)).toEqual([
      'process-item-1',
      'process-item-2',
      'process-item-3',
      'process-item-4',
      'process-item-5',
    ]);

    // Check the third step (aggregate-results)
    expect(hierarchy.substeps[2].name).toBe('aggregate-results');
    expect(hierarchy.substeps[2].result).toBe(30);

    // Verify recorded data
    expect(hierarchy.records['data-count']).toBe(5);

    // Verify time tracking
    expect(hierarchy.time.timeUsageMs).toBeGreaterThan(0);
    expect(hierarchy.substeps[0].time.timeUsageMs).toBeGreaterThanOrEqual(50);
    expect(hierarchy.substeps[2].time.timeUsageMs).toBeGreaterThanOrEqual(30);
  });

  /**
   * This test verifies the error handling capabilities of the Pipeline:
   *
   * 1. Tests how the Pipeline handles and propagates errors from steps
   * 2. Verifies that steps completed before the error maintain their results
   * 3. Ensures the Pipeline properly tracks and exposes error information
   * 4. Validates that errors are communicated to the transport layer:
   *    - The run should be marked as 'failed'
   *    - Error information should be included in the step metadata
   * 5. Confirms that time tracking continues to work for both successful
   *    and failed steps
   * 6. Checks that the step hierarchy maintains the correct structure
   *    and error information
   */
  it('should handle errors in steps and mark the run as failed', async () => {
    // Create a transport with mocked HTTP
    const transport = new HttpTransport({
      baseUrl: 'https://api.example.com',
      batchLogs: false,
    });

    // Create a pipeline with auto-save enabled
    const pipeline = new Pipeline('error-test', {
      autoSave: 'real_time',
      transport,
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

    // Verify axios calls for error case
    expect(mockedAxios.post).toHaveBeenCalled();

    // There should be a call to finish the run with failed status
    const finishRunCall = mockedAxios.post.mock.calls.find(
      (call) => call[0] === 'https://api.example.com/api/ingestion/pipeline/finish',
    );
    expect(finishRunCall).toBeDefined();

    // Safely check the status property
    if (finishRunCall) {
      const payload = finishRunCall[1] as { status: string };
      expect(payload.status).toBe('failed');
    }

    // Verify the step hierarchy
    const hierarchy = pipeline.outputNested();
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
