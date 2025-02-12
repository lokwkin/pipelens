import { Step } from "./step";

/**
 * This decorator wraps the method as a substep of the step that was passed in as the last argument.
 * Note: The last argument MUST be a Step instance of the parent step.
 */
export function WithStep(stepName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      // Check if step is provided in the arguments

      const parentStep = args[args.length - 1] as Step;

      if (!parentStep || !(parentStep instanceof Step)) {
        throw new Error(`The last arg of method \`${propertyKey}\` must be a \`Step\``);
      }

      return parentStep.step(stepName, async (step) => {
        args[args.length - 1] = step;
        const newArgs = [...args.slice(0, -1), step, 'AAA'];
        return originalMethod.apply(this, newArgs);
      });
    }
    return descriptor;
  };
}
