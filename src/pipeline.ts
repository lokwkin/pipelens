import { Step } from "./step";
import { v4 as uuidv4 } from 'uuid';

export class Pipeline extends Step {

    private runId: string;

    constructor(name: string, options?: {
        runId?: string
    } ) {
        super(name);
        this.runId = options?.runId ?? uuidv4();
    }

    public async track<T = any>(callable: (st: Step) => Promise<T>): Promise<T> {
        return await this.run(callable);
    }
}