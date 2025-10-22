import functools
import inspect
from typing import Any, Callable, TypeVar, cast

from .step import Step

F = TypeVar('F', bound=Callable[..., Any])


def with_step(step_name: str) -> Callable[[F], F]:
    """
    Decorator that wraps the method as a substep of the parent step.
    The parent step must be passed as the last argument of the method.

    Note: The `Step` instance that the callee method receives is a Substep.

    Args:
        step_name: The name of the substep to create

    Returns:
        A decorated function that automatically creates a substep

    Raises:
        TypeError: If the last argument is not a Step instance
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Get all arguments including self/cls for methods
            all_args = list(args)

            # Check if step is provided in the arguments
            parent_step = all_args[-1] if all_args else None

            if not parent_step or not isinstance(parent_step, Step):
                signature = inspect.signature(func)
                func_name = func.__qualname__
                raise TypeError(f"The last argument of method `{func_name}` must be a `Step`. "
                                f"Signature: {signature}")

            # Create the substep and execute the original function with the substep
            # replacing the parent step in the argument list
            async def run_in_step(step: Step) -> Any:
                # Replace the last argument (parent step) with the new substep
                all_args[-1] = step

                # Call the original function with the new arguments
                if inspect.iscoroutinefunction(func):
                    return await func(*all_args, **kwargs)
                else:
                    return func(*all_args, **kwargs)

            return await parent_step.step(step_name, run_in_step)

        return cast(F, wrapper)

    return decorator
