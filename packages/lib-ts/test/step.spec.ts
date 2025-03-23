import { Step } from '../src/step';

describe('Step', () => {
  describe('constructor', () => {
    it('should create a step with the given name', () => {
      const step = new Step('test-step');
      expect(step.getName()).toBe('test-step');
      expect(step.getKey()).toBe('test-step');
    });

    it('should create a step with a custom key if provided', () => {
      const step = new Step('test-step', { key: 'custom-key' });
      expect(step.getName()).toBe('test-step');
      expect(step.getKey()).toBe('custom-key');
    });

    it('should create a step with a key derived from parent if parent is provided', () => {
      const parentStep = new Step('parent');
      const childStep = new Step('child', { parent: parentStep });
      expect(childStep.getKey()).toBe('parent.child');
    });
  });

  describe('run', () => {
    it('should run the callable and return its result', async () => {
      const step = new Step('test-step');
      const result = await step.step('inner-step', async () => 'result');
      expect(result).toBe('result');
    });

    it('should handle errors in the callable', async () => {
      const step = new Step('test-step');
      const error = new Error('test error');

      await expect(
        step.step('inner-step', async () => {
          throw error;
        }),
      ).rejects.toThrow('test error');
    });

    it('should track time usage', async () => {
      const step = new Step('test-step');
      await step.step('inner-step', async (_st) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'result';
      });

      const meta = step.outputFlattened()[1]; // Get the inner step meta
      expect(meta.time.timeUsageMs).toBeDefined(); // Check that timeUsageMs is defined for completed steps
      expect(meta.time.timeUsageMs).toBeGreaterThanOrEqual(15);
    });

    it('should have undefined endTs and timeUsageMs for running steps', async () => {
      const step = new Step('test-step');
      
      // Get the step meta before completing it
      const meta = step.getStepMeta();
      
      // Verify that endTs and timeUsageMs are undefined for a running step
      expect(meta.time.startTs).toBeDefined();
      expect(meta.time.endTs).toBeUndefined();
      expect(meta.time.timeUsageMs).toBeUndefined();
    });
  });

  describe('record', () => {
    it('should record data with the given key', async () => {
      const step = new Step('test-step');
      await step.record('test-key', 'test-value');

      const meta = step.getStepMeta();
      expect(meta.records['test-key']).toBe('test-value');
    });
  });

  describe('events', () => {
    it('should emit step-start event when a step starts', async () => {
      const step = new Step('test-step');
      const startListener = jest.fn();

      step.on('step-start', startListener);

      await step.step('inner-step', async () => 'result');

      expect(startListener).toHaveBeenCalledTimes(1); // Only for inner-step
    });

    it('should emit step-success event when a step succeeds', async () => {
      const step = new Step('test-step');
      const successListener = jest.fn();

      step.on('step-success', successListener);

      await step.step('inner-step', async () => 'result');

      expect(successListener).toHaveBeenCalledTimes(1); // Only for inner-step
      expect(successListener.mock.calls[0][1]).toBe('result'); // Check the result
    });

    it('should emit step-error event when a step fails', async () => {
      const step = new Step('test-step');
      const errorListener = jest.fn();
      const error = new Error('test error');

      step.on('step-error', errorListener);

      await expect(
        step.step('inner-step', async () => {
          throw error;
        }),
      ).rejects.toThrow('test error');

      expect(errorListener).toHaveBeenCalledTimes(1);
      expect(errorListener.mock.calls[0][1]).toBe(error);
    });

    it('should emit step-record event when data is recorded', async () => {
      const step = new Step('test-step');
      const recordListener = jest.fn();

      step.on('step-record', recordListener);

      await step.record('test-key', 'test-value');

      expect(recordListener).toHaveBeenCalledTimes(1);
      expect(recordListener.mock.calls[0][1]).toBe('test-key');
      expect(recordListener.mock.calls[0][2]).toBe('test-value');
    });

    it('should emit step-complete event when a step completes', async () => {
      const step = new Step('test-step');
      const completeListener = jest.fn();

      step.on('step-complete', completeListener);

      await step.step('inner-step', async () => 'result');

      expect(completeListener).toHaveBeenCalledTimes(1); // Only for inner-step
    });
  });

  describe('output methods', () => {
    it('should output hierarchy correctly', async () => {
      const step = new Step('parent');
      await step.step('child1', async () => 'result1');
      await step.step('child2', async () => 'result2');

      const hierarchy = step.outputHierarchy();

      expect(hierarchy.name).toBe('parent');
      expect(hierarchy.substeps.length).toBe(2);
      expect(hierarchy.substeps[0].name).toBe('child1');
      expect(hierarchy.substeps[0].result).toBe('result1');
      expect(hierarchy.substeps[1].name).toBe('child2');
      expect(hierarchy.substeps[1].result).toBe('result2');
    });

    it('should output flattened steps correctly', async () => {
      const step = new Step('parent');
      await step.step('child1', async (st) => {
        await st.step('grandchild', async () => 'result-gc');
        return 'result1';
      });
      await step.step('child2', async () => 'result2');

      const flattened = step.outputFlattened();

      expect(flattened.length).toBe(4); // parent, child1, grandchild, child2
      expect(flattened[0].name).toBe('parent');
      expect(flattened[1].name).toBe('child1');
      expect(flattened[2].name).toBe('grandchild');
      expect(flattened[3].name).toBe('child2');
    });

    it('should handle running steps in output methods', async () => {
      const parentStep = new Step('parent');
      
      // Create a child step but don't await it yet
      const childPromise = parentStep.step('child', async (st) => {
        // This will be a running step when we check the outputs
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result';
      });
      
      // Get outputs before child step completes
      const hierarchy = parentStep.outputHierarchy();
      const flattened = parentStep.outputFlattened();
      
      // Check that the child step has undefined endTs and timeUsageMs
      expect(hierarchy.substeps[0].time.endTs).toBeUndefined();
      expect(hierarchy.substeps[0].time.timeUsageMs).toBeUndefined();
      
      expect(flattened[1].time.endTs).toBeUndefined();
      expect(flattened[1].time.timeUsageMs).toBeUndefined();
      
      // Wait for the child step to complete
      await childPromise;
    });
  });
});
