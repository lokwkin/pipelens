import { Pipeline } from '../src/pipeline';
import { StorageAdapter } from '../src/storage/storage-adapter';

// Mock the StorageAdapter
class MockStorageAdapter implements StorageAdapter {
  initiateRun = jest.fn().mockResolvedValue(undefined);
  finishRun = jest.fn().mockResolvedValue(undefined);
  initiateStep = jest.fn().mockResolvedValue(undefined);
  finishStep = jest.fn().mockResolvedValue(undefined);

  // Implement the rest of the required methods
  connect = jest.fn().mockResolvedValue(undefined);
  listPipelines = jest.fn().mockResolvedValue([]);
  listRuns = jest.fn().mockResolvedValue([]);
  getRunData = jest.fn().mockResolvedValue({});
  listRunSteps = jest.fn().mockResolvedValue([]);
  getPipelineStepTimeseries = jest.fn().mockResolvedValue([]);
  listPipelineSteps = jest.fn().mockResolvedValue([]);
}

describe('Pipeline', () => {
  describe('constructor', () => {
    it('should create a pipeline with the given name', () => {
      const pipeline = new Pipeline('test-pipeline');
      expect(pipeline.getName()).toBe('test-pipeline');
      expect(pipeline.getKey()).toBe('test-pipeline');
    });

    it('should generate a runId if not provided', () => {
      const pipeline = new Pipeline('test-pipeline');
      expect(pipeline.getRunId()).toBeDefined();
      expect(typeof pipeline.getRunId()).toBe('string');
    });

    it('should use the provided runId if given', () => {
      const runId = 'custom-run-id';
      const pipeline = new Pipeline('test-pipeline', { runId });
      expect(pipeline.getRunId()).toBe(runId);
    });

    it('should throw an error if autoSave is enabled but no storageAdapter is provided', () => {
      expect(() => {
        new Pipeline('test-pipeline', { autoSave: true });
      }).toThrow('Storage adapter must be provided when autoSave is enabled');
    });

    it('should not throw an error if autoSave is enabled and storageAdapter is provided', () => {
      expect(() => {
        new Pipeline('test-pipeline', {
          autoSave: true,
          storageAdapter: new MockStorageAdapter(),
        });
      }).not.toThrow();
    });
  });

  describe('track', () => {
    it('should track steps and return the result', async () => {
      const pipeline = new Pipeline('test-pipeline');
      const result = await pipeline.track(async (st) => {
        await st.step('step1', async () => 'result1');
        return 'final-result';
      });

      expect(result).toBe('final-result');

      const hierarchy = pipeline.outputNested();
      expect(hierarchy.name).toBe('test-pipeline');
      expect(hierarchy.substeps.length).toBe(1);
      expect(hierarchy.substeps[0].name).toBe('step1');
      expect(hierarchy.substeps[0].result).toBe('result1');
    });

    it('should handle errors in tracked steps', async () => {
      const pipeline = new Pipeline('test-pipeline');
      const error = new Error('test error');

      await expect(
        pipeline.track(async (st) => {
          await st.step('step1', async () => {
            throw error;
          });
          return 'final-result';
        }),
      ).rejects.toThrow('test error');
    });
  });

  describe('autoSave', () => {
    it('should call storage adapter methods when autoSave is enabled', async () => {
      const storageAdapter = new MockStorageAdapter();
      const pipeline = new Pipeline('test-pipeline', {
        autoSave: true,
        storageAdapter,
      });

      await pipeline.track(async (st) => {
        await st.step('step1', async () => 'result1');
        return 'final-result';
      });

      // Check that storage adapter methods were called
      expect(storageAdapter.initiateRun).toHaveBeenCalledTimes(1);

      // Just verify that initiateRun was called, but don't check the exact content
      // as the pipeline meta might change during execution
      expect(storageAdapter.initiateRun.mock.calls[0][0].runId).toBe(pipeline.getRunId());
      expect(storageAdapter.initiateRun.mock.calls[0][0].name).toBe('test-pipeline');

      expect(storageAdapter.initiateStep).toHaveBeenCalledTimes(2); // Once for pipeline, once for step1

      // Order can be different, so let's just check that both the pipeline and step1 were initiated
      const keys = [storageAdapter.initiateStep.mock.calls[0][1].key, storageAdapter.initiateStep.mock.calls[1][1].key];
      expect(keys).toContain(pipeline.getKey());
      expect(keys).toContain(`${pipeline.getKey()}.step1`);

      expect(storageAdapter.finishStep).toHaveBeenCalledTimes(2); // Once for step1, once for pipeline

      // Verify the finishStep calls - order can vary
      const finishKeys = [
        storageAdapter.finishStep.mock.calls[0][1].key,
        storageAdapter.finishStep.mock.calls[1][1].key,
      ];
      expect(finishKeys).toContain(pipeline.getKey());
      expect(finishKeys).toContain(`${pipeline.getKey()}.step1`);

      expect(storageAdapter.finishRun).toHaveBeenCalledTimes(1);

      // Verify finishRun call with correct parameters
      expect(storageAdapter.finishRun.mock.calls[0][0].runId).toBe(pipeline.getRunId());
      expect(storageAdapter.finishRun.mock.calls[0][0].name).toBe('test-pipeline');
      expect(storageAdapter.finishRun.mock.calls[0][1]).toBe('completed');
    });

    it('should mark run as failed when a step throws an error', async () => {
      const storageAdapter = new MockStorageAdapter();
      const pipeline = new Pipeline('test-pipeline', {
        autoSave: true,
        storageAdapter,
      });
      const error = new Error('test error');

      await expect(
        pipeline.track(async (st) => {
          await st.step('step1', async () => {
            throw error;
          });
          return 'final-result';
        }),
      ).rejects.toThrow('test error');

      // Check that storage adapter methods were called with the correct status
      expect(storageAdapter.finishRun).toHaveBeenCalledTimes(1);

      // Verify finishRun call with the failed status
      expect(storageAdapter.finishRun.mock.calls[0][0].runId).toBe(pipeline.getRunId());
      expect(storageAdapter.finishRun.mock.calls[0][1]).toBe('failed');
    });
  });

  describe('inheritance from Step', () => {
    it('should inherit methods from Step class', async () => {
      const pipeline = new Pipeline('test-pipeline');

      // Test record method from Step
      await pipeline.record('test-key', 'test-value');
      const meta = pipeline.getStepMeta();
      expect(meta.records['test-key']).toBe('test-value');

      // Test event handling from Step
      const recordListener = jest.fn();
      pipeline.on('step-record', recordListener);
      await pipeline.record('another-key', 'another-value');
      expect(recordListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('outputPipelineMeta', () => {
    it('should output the correct pipeline metadata', () => {
      const pipeline = new Pipeline('test-pipeline');
      const pipelineMeta = pipeline.outputPipelineMeta();

      expect(pipelineMeta.runId).toBe(pipeline.getRunId());
      expect(pipelineMeta.name).toBe('test-pipeline');
      expect(pipelineMeta.key).toBe('test-pipeline');
      expect(Array.isArray(pipelineMeta.steps)).toBe(true);
    });

    it('should include all steps in the pipeline metadata', async () => {
      const pipeline = new Pipeline('test-pipeline');

      await pipeline.track(async (st) => {
        await st.step('step1', async () => 'result1');
        await st.step('step2', async () => 'result2');
        return 'final-result';
      });

      const pipelineMeta = pipeline.outputPipelineMeta();

      // The steps array should contain the pipeline itself and the two tracked steps
      expect(pipelineMeta.steps.length).toBe(3);
      expect(pipelineMeta.steps.some((s) => s.name === 'test-pipeline')).toBe(true);
      expect(pipelineMeta.steps.some((s) => s.name === 'step1')).toBe(true);
      expect(pipelineMeta.steps.some((s) => s.name === 'step2')).toBe(true);
    });
  });
});
