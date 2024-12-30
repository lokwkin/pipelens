import { EventEmitter } from 'stream';
import { GanttChartArgs, generateExecutionGraphQuickchart, generateGanttChartLocal, generateGanttChartQuickchart, GraphItem, TimeSpan } from './chart';

export type TimeMeta = {
    startTs: number;
    endTs: number;
    timeUsageMs?: number;
};

export type StepMeta = {
    name: string;
    key: string;
    time: TimeMeta;
    record: Record<string, any>;
    result?: any;
    error?: string;
};

export type RunData = {
    result: any;
    error?: Error;
    time: TimeMeta;
    records: Record<string, any>
};
export type StepEvents = 'step-start' | 'step-success' | 'step-error' | 'step-record' | 'step-complete';

export type StepGanttArg = GanttChartArgs & {
    filter?: RegExp | string[];
}

export type RecordListener = (key: string, data: any) => void | Promise<void>;
export type StepStartListener = (key: string) => void | Promise<void>;
export type StepSuccessListener = (key: string, result: any) => void | Promise<void>;
export type StepErrorListener = (key: string, error: Error) => void | Promise<void>;
export type StepCompleteListener = (key: string, runData: RunData ) => void | Promise<void>;
export type StepRecordListener = (key: string, recordKey: string, data: any) => void | Promise<void>;

export class Step {
    
    private name: string;
    private key: string;
    private result?: any;
    private error?: Error;
    private records: Record<string, any>;
    private time: TimeMeta;
    private parent: Step | null;
    private ctx: Step;
    private steps: Array<Step>;
    private eventEmitter: EventEmitter;

    constructor(name: string, options?: {
        parent?: Step
        eventEmitter?: EventEmitter;
    } ) {
        this.name = name;
        this.records = {};
        this.time = {
            startTs: Date.now(),
            endTs: Date.now(),
            timeUsageMs: 0
        };
        this.key =  `${options?.parent ? `${options?.parent?.key}.` : '' }${this.name.replace(/\./g, '_')}`;
        this.parent = options?.parent ?? null;
        this.ctx = this;
        this.steps = [];
        this.eventEmitter = options?.eventEmitter ?? new EventEmitter({ captureRejections: true}); 
        if (this.eventEmitter.listeners('error')?.length === 0){ 
            this.eventEmitter.on('error', () => {});
        }
    }

    protected async run(callable: (st: Step) => Promise<any>) {
        this.time.startTs = Date.now();
        let error: Error|undefined;
        let result: any;
        try {
            this.eventEmitter.emit('step-start', this.key);
            this.result = await callable(this.ctx);
            this.eventEmitter.emit('step-success', this.key, this.result);
            return this.result;
        } catch (err) {
            this.error = err as Error;
            error = err as Error;
            this.eventEmitter.emit('step-error', this.key, error);
            throw err;
        } finally {
            this.time.endTs = Date.now();
            this.time.timeUsageMs = this.time.endTs - this.time.startTs;

            const runData: RunData = {
                result: result,
                error: error,
                time: this.time,
                records: this.records
            }
            this.eventEmitter.emit('step-complete', this.key, runData);
        }
    }

    public async step<T>(name: string, callable: (st: Step) => Promise<T>): Promise<T> {
        const step = new Step(name, { parent: this, eventEmitter: this.eventEmitter });
        if (this.steps.some((s) => s.key === step.key)) {
            console.warn(`Step with key "${step.key}" already exists under same parent step. Consider assigning unique keys to avoid confusion.`);
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
        this.eventEmitter.emit('record', recordKey, data);  // deprecated
        this.eventEmitter.emit('step-record', this.key, recordKey, data);
        return this;
    }


    public on(key: 'step-start', listener: StepStartListener): this;
    public on(key: 'step-success', listener: StepSuccessListener): this;
    public on(key: 'step-error', listener: StepErrorListener): this;
    public on(key: 'step-record', listener: StepRecordListener): this;
    public on(key: 'step-complete', listener: StepCompleteListener): this;
    public on(key: StepEvents, listener: StepStartListener | StepSuccessListener | StepErrorListener | StepRecordListener | StepCompleteListener): this {
        this.eventEmitter.on(key, listener);
        return this;
    }

    public outputHierarchy(): StepMeta & { substeps: StepMeta[] } {
        return {
            name: this.name,
            key: this.key,
            time: this.time,
            record: this.records,
            result: this.result,
            error: this.error ? (this.error.message || this.error.toString() || this.error.name) : undefined,
            substeps: this.steps.map((step) => step.outputHierarchy())
        }
    }

    public outputFlattened(): StepMeta[] {
        const substeps = this.steps.map((step) => step.outputFlattened()).flat();
        return [{
            name: this.name,
            key: this.key,
            time: this.time,
            record: this.records,
            result: this.result,
            error: this.error ? (this.error.message || this.error.toString() || this.error.name) : undefined,
        }, ...substeps];
    }

    public getRecords(): Record<string, any> {
        return this.records;
    }

    public getTime(): TimeMeta {
        return this.time;
    }

    public executionGraphQuickchart(): string {

        const buildGraph = (step: Step): GraphItem[] => {
            const item: GraphItem = {
                descriptor: `"${step.key}"`,
                label: `${step.name}${step.time.timeUsageMs ? `\n${step.time.timeUsageMs}ms` : ''}`
            };
            if (step.parent) {
                const linkage: GraphItem = {
                    descriptor: `"${step.parent.key}" -> "${step.key}"`,
                }
                return [item, linkage, ...step.steps.map((s) => buildGraph(s)).flat()];
            } else {
                return [item, ...step.steps.map((s) => buildGraph(s)).flat()];
            }
        };
        const nodes = buildGraph(this);
        return generateExecutionGraphQuickchart(nodes);
    }

    private getGanttSpans(filter?: RegExp | string[]): TimeSpan[] {

        const flattned = this.outputFlattened().filter((step: StepMeta) => {
            if (!filter) {
                return true;
            }
            if (filter instanceof RegExp) {
                return filter.test(step.key);
            } else if (Array.isArray(filter)) {
                return filter.includes(step.key);
            }
            return true;
        })

        return flattned.map((step) => ({
            key: step.key,
            startTs: step.time.startTs - this.time.startTs, 
            endTs: step.time.endTs - this.time.startTs,
        }));
    }
    /**
     * Generate a Gantt chart via QuickChart.io, returning an quickchart URL.
     */
    public ganttQuickchart(args?: StepGanttArg ): string {
        return generateGanttChartQuickchart(this.getGanttSpans(args?.filter), args);        
    }

    /**
     * Generate a Gantt chart locally via ChartJS, returning a Buffer.
     */
    public async ganttLocal(args?: StepGanttArg ): Promise<Buffer> {
        return generateGanttChartLocal(this.getGanttSpans(args?.filter), args);     
    }
}