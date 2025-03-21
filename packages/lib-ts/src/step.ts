import { EventEmitter } from 'stream';
import {
  GanttChartArgs,
  generateExecutionGraphQuickchart,
  generateGanttChartLocal,
  generateGanttChartQuickchart,
  GraphItem,
  TimeSpan,
} from './chart';

export type TimeMeta = {
  startTs: number;
  endTs: number;
  timeUsageMs: number;
};

export type StepMeta = {
  name: string;
  key: string;
  time: TimeMeta;
  record: Record<string, any>;
  result?: any;
  error?: string;
};

export type StepEvents = 'step-start' | 'step-success' | 'step-error' | 'step-record' | 'step-complete';

export type StepGanttArg = GanttChartArgs & {
  filter?: RegExp | string[];
};

export type RecordListener = (key: string, data: any, stepMeta?: StepMeta) => void | Promise<void>;
export type StepStartListener = (key: string, stepMeta?: StepMeta) => void | Promise<void>;
export type StepSuccessListener = (key: string, result: any, stepMeta?: StepMeta) => void | Promise<void>;
export type StepErrorListener = (key: string, error: Error, stepMeta?: StepMeta) => void | Promise<void>;
export type StepCompleteListener = (key: string, stepMeta?: StepMeta) => void | Promise<void>;
export type StepRecordListener = (
  key: string,
  recordKey: string,
  data: any,
  stepMeta?: StepMeta,
) => void | Promise<void>;

export class Step {
  protected name: string;
  protected key: string;
  protected result?: any;
  protected error?: Error;
  protected records: Record<string, any>;
  protected time: TimeMeta;
  protected parent: Step | null;
  protected ctx: Step;
  protected steps: Array<Step>;
  protected eventEmitter: EventEmitter;

  constructor(
    name: string,
    options?: {
      parent?: Step;
      key?: string;
      eventEmitter?: EventEmitter;
    },
  ) {
    this.name = name;
    this.records = {};
    this.time = {
      startTs: Date.now(),
      endTs: Date.now(),
      timeUsageMs: 0,
    };
    // 1. if expicitly specified by parent, use it.
    // 2. otherwise, deduce it from the parent's key + own's name
    // 3. otherwise, use the name as key
    if (options?.key) {
      this.key = options.key;
    } else if (options?.parent) {
      this.key = `${options?.parent?.key}.${this.name.replace(/[\.]/g, '_')}`;
    } else {
      this.key = this.name.replace(/[\.]/g, '_');
    }
    this.parent = options?.parent ?? null;
    this.ctx = this;
    this.steps = [];
    this.eventEmitter = options?.eventEmitter ?? new EventEmitter({ captureRejections: true });
    if (this.eventEmitter.listeners('error')?.length === 0) {
      this.eventEmitter.on('error', () => {});
    }
  }

  public getName(): string {
    return this.name;
  }

  public getKey(): string {
    return this.key;
  }

  /**
   * This method output a nested array of step meta, only includes the meta of the current step.
   */
  public getStepMeta(): StepMeta {
    return {
      name: this.name,
      key: this.key,
      time: this.time,
      record: this.records,
      result: this.result,
      error: this.error ? this.error.message || this.error.toString() || this.error.name : undefined,
    };
  }

  protected async run(callable: (st: Step) => Promise<any>) {
    this.time.startTs = Date.now();
    try {
      this.eventEmitter.emit('step-start', this.key, this.getStepMeta());
      this.result = await callable(this.ctx);
      this.eventEmitter.emit('step-success', this.key, this.result, this.getStepMeta());
      return this.result;
    } catch (err) {
      this.error = err as Error;
      this.eventEmitter.emit('step-error', this.key, this.error, this.getStepMeta());
      throw err;
    } finally {
      this.time.endTs = Date.now();
      this.time.timeUsageMs = this.time.endTs - this.time.startTs;
      this.eventEmitter.emit('step-complete', this.key, this.getStepMeta());
    }
  }

  /**
   * Create a new step and run it.
   */
  public async step<T>(name: string, callable: (st: Step) => Promise<T>): Promise<T> {
    const step = new Step(name, { parent: this, eventEmitter: this.eventEmitter });
    const duplicates = this.steps.filter((s) => s.key === step.key).length;
    if (duplicates > 0) {
      const newKey = `${step.key}___${duplicates}`;
      console.warn(
        `Step with key "${step.key}" already exists under same parent step. Assigning a new key "${newKey}" to avoid confusion.`,
      );
      step.key = newKey;
    }
    this.steps.push(step);
    return await step.run(callable);
  }

  /**
   * @deprecated
   */
  public log(key: string, data: any) {
    console.warn('Step.log() is deprecated, use Step.record() instead');
    return this.record(key, data);
  }
  public async record(recordKey: string, data: any) {
    this.records[recordKey] = data;
    this.eventEmitter.emit('record', recordKey, data, this.getStepMeta()); // deprecated
    this.eventEmitter.emit('step-record', this.key, recordKey, data, this.getStepMeta());
    return this;
  }

  public on(key: 'step-start', listener: StepStartListener): this;
  public on(key: 'step-success', listener: StepSuccessListener): this;
  public on(key: 'step-error', listener: StepErrorListener): this;
  public on(key: 'step-record', listener: StepRecordListener): this;
  public on(key: 'step-complete', listener: StepCompleteListener): this;
  public on(
    key: StepEvents,
    listener: StepStartListener | StepSuccessListener | StepErrorListener | StepRecordListener | StepCompleteListener,
  ): this {
    this.eventEmitter.on(key, listener);
    return this;
  }

  /**
   * This method output a nested array of step meta, including it own meta and its substeps' meta.
   */
  public outputHierarchy(): StepMeta & { substeps: StepMeta[] } {
    return {
      name: this.name,
      key: this.key,
      time: this.time,
      record: this.records,
      result: this.result,
      error: this.error ? this.error.message || this.error.toString() || this.error.name : undefined,
      substeps: this.steps.map((step) => step.outputHierarchy()),
    };
  }

  /**
   * This method output a flattened array of step meta, including it own meta and its substeps' meta.
   */
  public outputFlattened(): StepMeta[] {
    const substeps = this.steps.map((step) => step.outputFlattened()).flat();
    return [
      {
        name: this.name,
        key: this.key,
        time: this.time,
        record: this.records,
        result: this.result,
        error: this.error ? this.error.message || this.error.toString() || this.error.name : undefined,
      },
      ...substeps,
    ];
  }

  /**
   * Same as `outputFlattened()`
   */
  public outputSteps(): StepMeta[] {
    return this.outputFlattened();
  }

  public getRecords(): Record<string, any> {
    return this.records;
  }

  public getTimeMeta(): TimeMeta {
    return this.time;
  }

  /**
   * Generate a execution graph via QuickChart.io, returning an quickchart URL.
   */
  public executionGraphQuickchart(): string {
    const buildGraph = (step: Step): GraphItem[] => {
      const item: GraphItem = {
        descriptor: `"${step.key}"`,
        label: `${step.name}${step.time.timeUsageMs ? `\n${step.time.timeUsageMs}ms` : ''}`,
      };
      if (step.parent) {
        const linkage: GraphItem = {
          descriptor: `"${step.parent.key}" -> "${step.key}"`,
        };
        return [item, linkage, ...step.steps.map((s) => buildGraph(s)).flat()];
      } else {
        return [item, ...step.steps.map((s) => buildGraph(s)).flat()];
      }
    };
    const nodes = buildGraph(this);
    return generateExecutionGraphQuickchart(nodes);
  }

  private static getGanttSpans(steps: StepMeta[], filter?: RegExp | string[]): TimeSpan[] {
    const minStartTs = Math.min(...steps.map((step) => step.time.startTs));

    const flattned = steps.filter((step: StepMeta) => {
      if (!filter) {
        return true;
      }
      if (filter instanceof RegExp) {
        return filter.test(step.key);
      } else if (Array.isArray(filter)) {
        return filter.includes(step.key);
      }
      return true;
    });

    return flattned.map((step) => ({
      key: step.key,
      startTs: step.time.startTs - minStartTs,
      endTs: step.time.endTs - minStartTs,
    }));
  }
  /**
   * Generate a Gantt chart via QuickChart.io, returning an quickchart URL.
   */
  public ganttQuickchart(args?: StepGanttArg): string {
    return generateGanttChartQuickchart(Step.getGanttSpans(this.outputFlattened(), args?.filter), args);
  }

  /**
   * Generate a Gantt chart locally via ChartJS, returning a Buffer.
   */
  public async ganttLocal(args?: StepGanttArg): Promise<Buffer> {
    return generateGanttChartLocal(Step.getGanttSpans(this.outputFlattened(), args?.filter), args);
  }

  /**
   * Generate a Gantt chart via QuickChart.io, returning an quickchart URL.
   */
  public static ganttQuickChart(steps: StepMeta[], args?: StepGanttArg): string {
    return generateGanttChartQuickchart(Step.getGanttSpans(steps, args?.filter), args);
  }

  /**
   * Generate a Gantt chart locally via ChartJS, returning a Buffer.
   */
  public static ganttLocal(steps: StepMeta[], args?: StepGanttArg): Promise<Buffer> {
    return generateGanttChartLocal(Step.getGanttSpans(steps, args?.filter), args);
  }
}
