# Steps Track - Python

An observability tool built to help tracking, visualizing and inspecting intermediate steps in a complex pipeline-based application. It automatically captures and stores the intermediate data, results and execution times of each step in a pipeline, visualizing the execution details and allowing easier debug or analysis through an analytic dashboard.

## Installation

```bash
pip install steps-track
```

## Quick Start

```python
import asyncio
from steps_track import Step, Pipeline, HttpTransport

async def example():
    # Create a step
    step = Step("root")
    
    # Track a function execution
    result = await step.track(async lambda s: 
        # s is the Step instance that can be used to record data
        # or create substeps
        await my_function(s)
    )
    
    # Create a pipeline with a transport
    transport = HttpTransport(base_url="http://localhost:3000/api")
    pipeline = Pipeline("my-pipeline", auto_save=True, transport=transport)
    
    # Run the pipeline
    result = await pipeline.track(async lambda p:
        # First substep
        await p.step("step1", async lambda s:
            await s.record("input", "example input")
            return "result of step1"
        )
        
        # Second substep
        return await p.step("step2", async lambda s:
            await s.record("previous_result", "result of step1")
            return "final result"
        )
    )
    
    # Generate a Gantt chart
    chart_png = await step.gantt_quickchart(unit="ms")
    
    # Generate an HTML page with a Google Gantt chart
    html = step.gantt_google_chart_html()

async def my_function(step: Step):
    # Record some data
    await step.record("key", "value")
    
    # Create a substep
    result = await step.step("substep", async lambda s:
        await s.record("subkey", "subvalue")
        return "substep result"
    )
    
    return result

# Run the example
asyncio.run(example())
```

## Using the Decorator

```python
from steps_track import Step, with_step

class MyClass:
    @with_step("process_data")
    async def process_data(self, data, step: Step):
        await step.record("input", data)
        result = await self.transform(data, step)
        return result
    
    @with_step("transform")
    async def transform(self, data, step: Step):
        # Processing logic
        transformed = data.upper()
        await step.record("transformed", transformed)
        return transformed
```

## API Reference

### Step

- `Step(name, parent=None, key=None, event_emitter=None)` - Create a new step
- `async track(callable)` - Track a function execution
- `async step(name, callable)` - Create and execute a substep
- `async record(key, data)` - Record data associated with the step
- `on(event, listener)` - Register an event listener
- `output_nested()` - Get a nested representation of this step and its substeps
- `output_flattened()` - Get a flattened list of all steps
- `async gantt_quickchart(**kwargs)` - Generate a Gantt chart using QuickChart
- `gantt_google_chart_html(**kwargs)` - Generate HTML for a Google Gantt Chart

### Pipeline

- `Pipeline(name, run_id=None, auto_save=False, transport=None)` - Create a new pipeline
- `get_run_id()` - Get the run ID for this pipeline
- `output_pipeline_meta()` - Get the complete pipeline metadata

### Transport

Base protocol for transporting data. Implementations:

- `HttpTransport(base_url, headers=None, auth_token=None)` - Send data to an HTTP API

## Events

- `step-start` - Emitted when a step starts
- `step-success` - Emitted when a step completes successfully
- `step-error` - Emitted when a step fails
- `step-record` - Emitted when data is recorded
- `step-complete` - Emitted when a step completes (regardless of success/failure) 