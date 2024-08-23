export type TimeMeta = {
    startTs: number;
    endTs: number;
    timeUsageMs?: number;
};

export type StepMeta = {
    key: string;
    time: TimeMeta;
    record: Record<string, any>;
    result: any;
};

export class StepTracker {
    
    public key: string;
    public records: Record<string, any>;
    public result?: any;
    public time: TimeMeta;
    private subtrackers: { [key: string]: StepTracker } = {};
    private ctx: StepTracker;
    
    constructor(key: string) {
        this.key = key;
        this.records = {};
        this.time = {
            startTs: Date.now(),
            endTs: Date.now(),
            timeUsageMs: 0
        };
        this.ctx = this;
    }

    private async run(callable: (st: StepTracker) => Promise<any>) {
        this.time.startTs = Date.now();
        this.result = await callable(this.ctx);
        this.time.endTs = Date.now();
        this.time.timeUsageMs = this.time.endTs - this.time.startTs;
        return this.result;
    }

    public async track<T>(callable: (st: StepTracker) => Promise<T>): Promise<T> {
        return await this.run(callable);
    }

    public async step<T>(key: string, callable: (st: StepTracker) => Promise<T>): Promise<T> {
        const subtracker = new StepTracker(`${this.key}.${key}`);
        this.subtrackers[key] = subtracker;
        return await subtracker.run(callable);
    }

    public log(key: string, data: any) {
        // deprecated, use record instead
        console.warn('StepTracker.log() is deprecated, use StepTracker.record() instead');
        return this.record(key, data);
    }

    public record(key: string, data: any) {
        this.records[key] = data;
        return this;
    }

    public output(): StepMeta & { substeps: StepMeta[] } {
        return {
            key: this.key,
            time: this.time,
            record: this.records,
            result: this.result,
            substeps: Object.values(this.subtrackers).map((subtracker) => subtracker.output())
        }
    }

    public outputFlattened(): StepMeta[] {
        const substeps = Object.values(this.subtrackers).map((subtracker) => subtracker.outputFlattened());
        return [{
            key: this.key,
            time: this.time,
            record: this.records,
            result: this.result,
        }].concat(substeps.flat());
    }

    public ganttUrl(): string {
        const substeps = this.outputFlattened();

        const maxEndTs = Math.max(...substeps.map((step) => step.time.endTs));
  
        const chartData = {
            type: 'horizontalBar',
            data: {
                labels: substeps.map((step) => step.key),
                datasets: [
                    {
                        data: substeps.map((step) => [
                            (step.time.startTs - this.time.startTs),
                            (step.time.endTs - this.time.startTs),
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
                                max: maxEndTs - this.time.startTs,
                            },
                        },
                    ],
                },
            },
        };
  
        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartData))}`;
        return chartUrl;
    }
}
