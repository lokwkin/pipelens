import { Step } from '../src/step';
import { WithStep } from '../src/decorator';

describe('WithStep Decorator', () => {
  let parentStep: Step;

  beforeEach(() => {
    parentStep = new Step('parent-step');
  });

  it('should wrap method as a substep', async () => {
    class TestClass {
      @WithStep('test-step')
      async testMethod(_st: Step) {
        return 'success';
      }
    }

    const instance = new TestClass();
    const result = await instance.testMethod(parentStep);

    expect(result).toBe('success');
    const output = parentStep.outputNested();
    expect(output.substeps[0].name).toBe('test-step');
    expect(output.substeps[0].result).toBe('success');
  });

  it('should throw error if step is not provided', async () => {
    class TestClass {
      @WithStep('test-step')
      async testMethod(_st?: Step) {
        return 'success';
      }
    }

    const instance = new TestClass();
    try {
      await instance.testMethod();
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('The last arg of method `testMethod` must be a `Step`');
    }
  });

  it('should throw error if last argument is not a Step instance', async () => {
    class TestClass {
      @WithStep('test-step')
      async testMethod(_st: any) {
        return 'success';
      }
    }

    const instance = new TestClass();
    try {
      await instance.testMethod({});
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('The last arg of method `testMethod` must be a `Step`');
    }
  });

  it('should handle method with multiple arguments', async () => {
    class TestClass {
      @WithStep('test-step')
      async testMethod(arg1: string, arg2: number, _st: Step) {
        return `${arg1}-${arg2}`;
      }
    }

    const instance = new TestClass();
    const result = await instance.testMethod('hello', 42, parentStep);

    expect(result).toBe('hello-42');
    const output = parentStep.outputNested();
    expect(output.substeps[0].name).toBe('test-step');
    expect(output.substeps[0].result).toBe('hello-42');
  });

  it('should handle errors in decorated method', async () => {
    class TestClass {
      @WithStep('test-step')
      async testMethod(_st: Step) {
        throw new Error('test error');
      }
    }

    const instance = new TestClass();
    await expect(instance.testMethod(parentStep)).rejects.toThrow('test error');

    const output = parentStep.outputNested();
    expect(output.substeps[0].name).toBe('test-step');
    expect(output.substeps[0].error).toBe('test error');
  });

  it('should pass the substep instance to the method', async () => {
    class TestClass {
      @WithStep('test-step')
      async testMethod(st: Step) {
        await st.record('test-key', 'test-value');
        return 'success';
      }
    }

    const instance = new TestClass();
    await instance.testMethod(parentStep);

    const output = parentStep.outputNested();
    expect(output.substeps[0].records['test-key']).toBe('test-value');
  });
});
