import { Step } from '../src/step';
import { EventEmitter } from 'stream';

describe('Step', () => {
  let step: Step;

  beforeEach(() => {
    step = new Step('test_step');
  });

  describe('Constructor', () => {
    it('should create a step with basic properties', () => {
      expect(step['name']).toBe('test_step');
      expect(step['key']).toBe('test_step');
      expect(step['records']).toEqual({});
      expect(step['steps']).toEqual([]);
      expect(step['parent']).toBeNull();
    });

    it('should create a nested step with parent', () => {
      const parentStep = new Step('parent');
      const childStep = new Step('child', { parent: parentStep });

      expect(childStep['key']).toBe('parent.child');
      expect(childStep['parent']).toBe(parentStep);
    });
  });

  describe('Step Execution', () => {
    it('should track execution time and result', async () => {
      const result = await step.step('test', async (_st) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return 'success';
      });

      expect(result).toBe('success');
      const output = step.outputHierarchy();
      expect(output.substeps[0].result).toBe('success');
      expect(output.substeps[0].time.timeUsageMs).toBeGreaterThanOrEqual(100);
    });

    it('should handle errors', async () => {
      const error = new Error('test error');
      await expect(
        step.step('error-step', async () => {
          throw error;
        }),
      ).rejects.toThrow(error);

      const output = step.outputHierarchy();
      expect(output.substeps[0].error).toBe('test error');
    });
  });

  describe('Event Emission', () => {
    let eventEmitter: EventEmitter;
    let events: Array<{ event: string; args: any[] }>;

    beforeEach(() => {
      events = [];
      eventEmitter = new EventEmitter();
      step = new Step('test_step', { eventEmitter });

      // Track all events
      ['step-start', 'step-success', 'step-error', 'step-record', 'step-complete'].forEach((event) => {
        eventEmitter.on(event, (...args) => {
          events.push({ event, args });
        });
      });
    });

    it('should emit events in correct order', async () => {
      await step.step('test', async (st) => {
        await st.record('test-key', 'test-value');
        return 'success';
      });

      expect(events.map((e) => e.event)).toEqual(['step-start', 'step-record', 'step-success', 'step-complete']);
    });

    it('should emit error event on failure', async () => {
      await expect(
        step.step('error-step', async () => {
          throw new Error('test error');
        }),
      ).rejects.toThrow();

      expect(events.some((e) => e.event === 'step-error')).toBeTruthy();
    });
  });

  describe('Record Keeping', () => {
    it('should store records', async () => {
      await step.record('key1', 'value1');
      await step.record('key2', { nested: 'value2' });

      expect(step.getRecords()).toEqual({
        key1: 'value1',
        key2: { nested: 'value2' },
      });
    });

    it('should include records in output', async () => {
      await step.record('test-key', 'test-value');
      const output = step.outputHierarchy();
      expect(output.record['test-key']).toBe('test-value');
    });
  });

  describe('Output Formatting', () => {
    it('should format hierarchy output correctly', async () => {
      await step.step('child1', async (st) => {
        await st.record('key1', 'value1');
        return 'result1';
      });

      const output = step.outputHierarchy();
      expect(output).toMatchObject({
        name: 'test_step',
        key: 'test_step',
        substeps: [
          {
            name: 'child1',
            key: 'test_step.child1',
            record: { key1: 'value1' },
            result: 'result1',
          },
        ],
      });
    });

    it('should format flattened output correctly', async () => {
      await step.step('child1', async (st) => {
        await st.record('key1', 'value1');
        return 'result1';
      });

      const output = step.outputFlattened();
      expect(output).toHaveLength(2);
      expect(output[1]).toMatchObject({
        name: 'child1',
        key: 'test_step.child1',
        record: { key1: 'value1' },
        result: 'result1',
      });
    });

    it('should format nested hierarchy output correctly', async () => {
      await step.step('parent', async (parentStep) => {
        await parentStep.record('parentKey', 'parentValue');
        await parentStep.step('child', async (childStep) => {
          await childStep.record('childKey', 'childValue');
          return 'childResult';
        });
        return 'parentResult';
      });

      const output = step.outputHierarchy();
      expect(output).toMatchObject({
        name: 'test_step',
        key: 'test_step',
        substeps: [
          {
            name: 'parent',
            key: 'test_step.parent',
            record: { parentKey: 'parentValue' },
            result: 'parentResult',
            substeps: [
              {
                name: 'child',
                key: 'test_step.parent.child',
                record: { childKey: 'childValue' },
                result: 'childResult',
              },
            ],
          },
        ],
      });
    });

    it('should format nested flattened output correctly', async () => {
      await step.step('parent', async (parentStep) => {
        await parentStep.record('parentKey', 'parentValue');
        await parentStep.step('child', async (childStep) => {
          await childStep.record('childKey', 'childValue');
          return 'childResult';
        });
        return 'parentResult';
      });

      const output = step.outputFlattened();
      expect(output).toHaveLength(3);
      expect(output[1]).toMatchObject({
        name: 'parent',
        key: 'test_step.parent',
        record: { parentKey: 'parentValue' },
        result: 'parentResult',
      });
      expect(output[2]).toMatchObject({
        name: 'child',
        key: 'test_step.parent.child',
        record: { childKey: 'childValue' },
        result: 'childResult',
      });
    });
  });
});
