import { ChartConfiguration } from 'chart.js';
import { EventEmitter } from 'stream';

export type TimeMeta = {
    startTs: number;
    endTs: number;
    timeUsageMs?: number;
};

export type StepMeta = {
    key: string;
    time: TimeMeta;
    record: Record<string, any>;
    result?: any;
    error?: string;
};

export type RunResult = {
    result: any;
    error?: Error;
    time: TimeMeta;
    records: Record<string, any>
};

export type RecordListener = (data: any) => void | Promise<void>;
export type DefaultListener = (key: string, data: any) => void | Promise<void>;
export type RunResultListener = (key: string, data: RunResult ) => void | Promise<void>;

export class StepTracker {
    
    public key: string;
    public records: Record<string, any>;
    public result?: any;
    public error?: Error;
    public time: TimeMeta;
    private logResult: boolean;
    private subtrackers: { [key: string]: StepTracker } = {};
    private ctx: StepTracker;
    private eventEmitter: EventEmitter;

    constructor(key: string, options?: {
        listeners?: Record<string, RecordListener>;
        eventEmitter?: EventEmitter;
        logResult?: boolean;
    } ) {
        this.logResult = options?.logResult ?? false;
        this.key = key;
        this.records = {};
        this.time = {
            startTs: Date.now(),
            endTs: Date.now(),
            timeUsageMs: 0
        };
        this.eventEmitter = options?.eventEmitter ?? new EventEmitter({ captureRejections: true}); 
        if (this.eventEmitter.listeners('error')?.length === 0){ 
            this.eventEmitter.on('error', () => {});
        }
        if (options?.listeners) {
            for (const [key, listener] of Object.entries(options.listeners)) {
                this.eventEmitter.on(key, listener);
            }
        }
        this.ctx = this;
    }

    private async run(callable: (st: StepTracker) => Promise<any>) {
        this.time.startTs = Date.now();
        let error: Error|undefined;
        let result: any;
        try {
            result = await callable(this.ctx);
            if (this.logResult) {
                this.result = result;
            }
            return result;
        } catch (err) {
            this.error = err as Error;
            error = err as Error;
            throw err;
        } finally {
            this.time.endTs = Date.now();
            this.time.timeUsageMs = this.time.endTs - this.time.startTs;

            const data: RunResult = {
                result: result,
                error: error,
                time: this.time,
                records: this.records
            }
            this.eventEmitter.emit('step-result', this.key, data);
        }
    }

    public async track<T>(callable: (st: StepTracker) => Promise<T>): Promise<T> {
        return await this.run(callable);
    }

    public async step<T>(key: string, callable: (st: StepTracker) => Promise<T>): Promise<T> {
        const subtracker = new StepTracker(`${this.key}.${key}`, { eventEmitter: this.eventEmitter, logResult: this.logResult });
        this.subtrackers[key] = subtracker;
        return await subtracker.run(callable);
    }

    public log(key: string, data: any) {
        // deprecated, use record instead
        console.warn('StepTracker.log() is deprecated, use StepTracker.record() instead');
        return this.record(key, data);
    }

    public async record(key: string, data: any) {
        this.records[key] = data;
        this.eventEmitter.emit(key, data);
        this.eventEmitter.emit('record', key, data);
        return this;
    }

    public on(key: 'step-result', listener: RunResultListener): this;
    public on(key: 'record', listener: DefaultListener): this;
    public on(key: string, listener: RecordListener): this;
    public on(key: string, listener: RecordListener| DefaultListener| RunResultListener): this {
        this.eventEmitter.on(key, listener);
        return this;
    }

    public output(): StepMeta & { substeps: StepMeta[] } {
        return {
            key: this.key,
            time: this.time,
            record: this.records,
            result: this.result,
            error: this.error ? (this.error.message || this.error.toString() || this.error.name) : undefined,
            substeps: Object.values(this.subtrackers).map((subtracker) => subtracker.output())
        }
    }

    public outputFlattened(): StepMeta[] {
        const substeps = Object.values(this.subtrackers).map((subtracker) => subtracker.outputFlattened());
        const currStep: StepMeta = {
            key: this.key,
            time: this.time,
            record: this.records,
            result: this.result,
            error: this.error ? (this.error.message || this.error.toString() || this.error.name) : undefined,
        };
        return [currStep].concat(substeps.flat());
    }

    /**
     * Generate a Gantt chart via QuickChart.io, returning an quickchart URL.
     */
    public ganttUrl(args?: {unit: 'ms' | 's', minWidth: number, minHeight: number, includeSteps?: RegExp | string[] }): string {

        const { unit, minWidth, minHeight, includeSteps } = {
            ...{ unit: 'ms', minWidth: 500, minHeight: 300 },
            ...(args ?? {}),
        };
        const substeps = includeSteps ? this.outputFlattened().filter((step) => {
            if (includeSteps instanceof RegExp) {
                return includeSteps.test(step.key);
            } else if (Array.isArray(includeSteps)) {
                return includeSteps.includes(step.key);
            }
            return true;
        }) : this.outputFlattened();

        const maxEndTs = Math.max(...substeps.map((step) => step.time.endTs));
  
        const chartData = {
            type: 'horizontalBar',
            data: {
                labels: substeps.map((step) => `${step.key} - ${(step.time.endTs - step.time.startTs) / (unit === 'ms' ? 1 : 1000)}${unit}`),
                datasets: [
                    {
                        data: substeps.map((step) => [
                            (step.time.startTs - this.time.startTs) / (unit === 'ms' ? 1 : 1000),
                            (step.time.endTs - this.time.startTs) / (unit === 'ms' ? 1 : 1000),
                        ]),
                    },
                ],
            },
            options: {
                legend: {
                    display: false,
                },
                scales: {
                    xAxes: [
                        {
                            position: 'top',
                            ticks: {
                                min: 0,
                                max: (maxEndTs - this.time.startTs) / (unit === 'ms' ? 1 : 1000),
                            },
                        },
                    ],
                },
            },
        };
  
        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartData))}&w=${Math.max(minWidth, substeps.length * 25)}&h=${Math.max(minHeight, substeps.length * 25)}`;
        return chartUrl;
    }

    /**
     * Generate a Gantt chart locally via ChartJS, returning a Buffer.
     */
    public async ganttLocal(args?: {unit?: 'ms' | 's', minWidth?: number, minHeight?: number, includeSteps?: RegExp | string[] }): Promise<Buffer> {

        let canvasConstructor : any;
        try {
            const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
            if (!ChartJSNodeCanvas) {
                throw new Error('Failed to load chartjs-node-canvas, please install it to use ganttLocal()');
            }
            canvasConstructor = ChartJSNodeCanvas;
        } catch (err) {
            console.error('Failed to load chartjs-node-canvas, please install it to use ganttLocal()');
            throw err;
        }

        const { unit, minWidth, minHeight, includeSteps } = {
            ...{ unit: 'ms', minWidth: 500, minHeight: 300 },
            ...(args ?? {}),
        };
        const substeps = includeSteps ? this.outputFlattened().filter((step) => {
            if (includeSteps instanceof RegExp) {
                return includeSteps.test(step.key);
            } else if (Array.isArray(includeSteps)) {
                return includeSteps.includes(step.key);
            }
            return true;
        }) : this.outputFlattened();

        const maxEndTs = Math.max(...substeps.map((step) => step.time.endTs));

        const chartData: ChartConfiguration = {
            type: 'bar',  // ChartJS uses 'bar' for both vertical and horizontal bar charts
            plugins: [
                {
                  id: 'customCanvasBackgroundColor',
                  beforeDraw: (chart, args, options) => {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                  },
                },
              ],
            data: {
                labels: substeps.map((step) => `${step.key} - ${(step.time.endTs - step.time.startTs) / (unit === 'ms' ? 1 : 1000)}${unit}`),
                datasets: [
                    {
                        label: 'offset',
                        data: substeps.map((step) => (step.time.startTs - this.time.startTs) / (unit === 'ms' ? 1 : 1000)),
                        backgroundColor: 'white',
                    },
                    {
                        label: 'data',
                        data: substeps.map((step) => (step.time.endTs - step.time.startTs) / (unit === 'ms' ? 1 : 1000)),
                        backgroundColor: '#23395d',
                    },
                ],
            },
            options: {
                indexAxis: 'y',  // This makes the bar chart horizontal
                plugins: {
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    x: {
                        position: 'top',
                        min: 0,
                        max: (maxEndTs - this.time.startTs) / (unit === 'ms' ? 1 : 1000),
                        stacked: true,
                        ticks: {
                            color: '#333333',
                        }
                    },
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        ticks: {
                            color: '#333333',
                        }
                    },
                },
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: 10,
                    },
                },
            }
        }

        // Create a canvas and render the chart
        const chartJSNodeCanvas = new canvasConstructor({ width: Math.max(minWidth, substeps.length * 25), height: Math.max(minHeight, substeps.length * 25) });
        const image = await chartJSNodeCanvas.renderToBuffer(chartData);
        return image;
    }
}
