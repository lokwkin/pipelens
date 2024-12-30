import { Pipeline } from './pipeline';

/**
 * @deprecated This class is deprecated, use Pipeline instead.
 * Keeping StepTracker class for now for backwards compatibility.
 */
export class StepTracker extends Pipeline {
    constructor(name: string, options?: {
        logResult?: boolean
    }) {
        super(name, options);
    }
}
export * from './pipeline';
export * from './step';