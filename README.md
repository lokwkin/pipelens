# PipeLens (Formerly Steps-track)

[![npm version](https://badge.fury.io/js/pipelens.svg)](https://badge.fury.io/js/pipelens)
[![npm downloads](https://img.shields.io/npm/dt/pipelens.svg)](https://www.npmjs.com/package/pipelens)
[![pypi version](https://badge.fury.io/py/pipelens.svg)](https://pypi.org/project/pipelens/)
[![pypi downloads](https://pepy.tech/badge/pipelens)](https://pepy.tech/project/pipelens)
[![lib-ts test](https://github.com/lokwkin/pipelens/actions/workflows/test-lib-ts.yml/badge.svg)](https://github.com/lokwkin/pipelens/actions/workflows/test-lib-ts.yml/badge.svg)
[![lib-py test](https://github.com/lokwkin/pipelens/actions/workflows/test-lib-py.yml/badge.svg)](https://github.com/lokwkin/pipelens/actions/workflows/test-lib-py.yml/badge.svg)

<img src="./docs/pipelens.png">

⭐ **Building LLM applications without a framework?** ⭐

⭐ **Not sure what’s slow or what’s happening under the hood?** ⭐

⭐ **You’ve come to the right place!** ⭐

## What is PipeLens?

**PipeLens** is an observability tool built to help ***tracking, visualizing and inspecting*** intermediate steps in a pipeline-based / multi-steps application. It automatically captures and stores the intermediate data, results and execution times of each steps in a pipeline, visualizing the execution details and allowing easier debug or analysis through an analytic dashboard. 

It supports both *Python* and *Typescript / Node.js*

<details>
<summary>Some Background of the Project</summary>
    
> PipeLens is a lightweight inspection and debugging tool originally built to monitor an agentic Retrieval-Augmented Generation (RAG) pipeline running in a production environment—where visibility, performance, and stability are critical.
> 
> When chaining multiple LLM agents with custom logic and dynamic inputs, non-deterministic nature of LLM outputs of each steps often lead to dynamic route of logics and behaviors. I needed a inspection tool but the existing tools didn't provide the granularity I needed to trace what happened inside each step of the pipeline.
> 
> So I built PipeLens to do just that: trace, inspect, and understand every step of each request. It helped me quickly spot bottlenecks, unexpected behaviors and performance drags, and address them effectively.
> 
> I'm open-sourcing it in the hope that it helps others building and operating complex LLM pipelines.
>
> Contributions welcome!
</details>

***Sounds interesting? Kindly give it a Star, it means a lot! 🙏***

## Features

#### [1. Tracking Pipeline Steps](#tracking-pipeline-steps)
- **Tracking**: Define steps in pipeline to track intermediates data, results and execution time
- **Visualizing**: Exporting the details and generating basic visualizations including Gantt and Execution Graph
- **Event Emitting**: Listen to step events for real-time monitoring and custom handling
- **ES6 Decorators**: Easy integration with ES6 decorators
- **LLM Tracking Extension**: Simple tracker optimized for LLM usage

#### [2. Using Dashboard](#using-dashboard)
Monitor and analyze pipeline executions through an interactive web interface
- Detailed Steps Data and Results Inspection
- Real-time Execution Monitoring
- Gantt Chart Visualization for pipeline
- Step Execution Stats

*Note: PipeLens is designed for any pipeline-based / multi-steps logic, especially agentic LLM pipelines*

## Getting Started

This repository is a **monorepo** containing following packages:
- [Typescript](./lib-ts) / [Python](./lib-py) libraries that provides basic tracker and chart generation function for your pipeline
- [Dashboard](./dashboard) that visualizes and allows you to monitor tracked data for analysis.

### Setup from your codebase

#### Installation

```bash
# Typescript
npm install --save pipelens

# Python
pip install pipelens
```

#### Define steps in your code where you intended to track
<details>
<summary>Typescript</summary>

```typescript
// ================================================
// Using TypeScript Decorators
// ================================================
import { Pipeline, Step, WithStep } from 'pipelens';

@WithStep('some_step')
async function someStep(inputStr: string, st: Step) {
  // ... some logic ...
  st.record('key', 'value'); // Record data for analysis
  return 'some_result'; // Results are automatically recorded
}

@WithStep('child')
async function childFunc(param: number, st: Step) {
  // ... some logic ...
}

@WithStep('parent')
async function parentFunc(st: Step) {
  // Track nested steps
  await childFunc(1, st);
  await childFunc(2, st);
  
  // Track parallel steps
  await Promise.all([
    childFunc(3, st),
    childFunc(4, st),
  ]);
}

async function runPipeline(st: Step) {
  await someStep('some_value', st);
  await parentFunc(st);
}

const pipeline = new Pipeline('my_pipeline');
await pipeline.track(runPipeline);

// ================================================
// Or you may optionally run without decorators
// ================================================
import { Pipeline, Step } from 'pipelens';

// Create pipeline
const pipeline = new Pipeline('my-pipeline');

// Define your pipeline logic without decorators
async function pipelineLogic(st: Step) {
  // Helper function for your business logic
  async function someTask(someArgs: string, step: Step) {
    // ... your logic ...
    step.record('key', 'value'); // Record data for analysis
    return 'some_result'; // Results are automatically recorded
  }

  // Track a simple step
  async function someStep(step: Step) {
    return await someTask('your_args', step);
  }
  
  const result = await st.step('some_step', someStep);
  
  // Track nested steps
  async function parentStep(step: Step) {
    async function child1(step: Step) {
      return await someTask('args', step);
    }
    
    async function child2(step: Step) {
      return await someTask('args', step);
    }
    
    await step.step('child_1', child1);
    await step.step('child_2', child2);
  }
  
  await st.step('parent', parentStep);
  
  // Track parallel steps
  async function parallel1(step: Step) {
    return await someTask('args', step);
  }
  
  async function parallel2(step: Step) {
    return await someTask('args', step);
  }
  
  await Promise.all([
    st.step('parallel_1', parallel1),
    st.step('parallel_2', parallel2),
  ]);
}

// Run the pipeline
await pipeline.track(pipelineLogic);


// ================================================
// Some simple visualization functions to use if you 
// don't want to integrate with dashboard
// ================================================

// Generate a Gantt chart Buffer using quickchart.io
const ganttChartBuffer = await pipeline.ganttQuickchart();

// Generate a Gantt chart HTML file with Google Charts
const ganttChartHtml = await pipeline.ganttGoogleChartHtml();

// Generate an execution graph URL
const executionGraphUrl = pipeline.executionGraphQuickchart();

// Get the hierarchical output of all steps
const stepsHierarchy = pipeline.outputNested();
```
</details>

<details>
<summary>Python</summary>

```python
# ================================================
# Using Python Decorators
# ================================================
from pipelens import Pipeline, Step, with_step

@with_step('some_step')
async def some_step(input_str: str, st: Step):
    # ... some logic ...
    await st.record('key', 'value')  # Record data for analysis
    return 'some_result'  # Results are automatically recorded

@with_step('child')
async def child_func(param: int, st: Step):
    # ... some logic ...

@with_step('parent')
async def parent_func(st: Step):
    # Track nested steps
    await child_func(1, st)
    await child_func(2, st)
    
    # Track parallel steps
    import asyncio
    await asyncio.gather(
        child_func(3, st),
        child_func(4, st),
    )

async def run_pipeline(st: Step):
    await some_step('some_value', st)
    await parent_func(st)

pipeline = Pipeline('my_pipeline')
await pipeline.track(run_pipeline)

# ================================================
# Or you may optionally run without decorators
# ================================================
import asyncio
from pipelens import Pipeline, Step

# Create pipeline
pipeline = Pipeline('my-pipeline')

async def pipeline_logic(st: Step):
    # Helper function for your business logic
    async def some_task(some_args: str, step: Step):
        # ... your logic ...
        await step.record('key', 'value')  # Record data for analysis
        return 'some_result'  # Results are automatically recorded

    # Track a simple step
    async def some_step(step: Step):
        return await some_task('your_args', step)
    
    result = await st.step('some_step', some_step)
    
    # Track nested steps
    async def parent_step(step: Step):
        async def child_1(step: Step):
            return await some_task('args', step)
        
        async def child_2(step: Step):
            return await some_task('args', step)
        
        await step.step('child_1', child_1)
        await step.step('child_2', child_2)
    
    await st.step('parent', parent_step)
    
    # Track parallel steps
    async def parallel_1(step: Step):
        return await some_task('args', step)
    
    async def parallel_2(step: Step):
        return await some_task('args', step)
    
    await asyncio.gather(
        st.step('parallel_1', parallel_1),
        st.step('parallel_2', parallel_2)
    )

# Run the pipeline
await pipeline.track(pipeline_logic)

# ================================================
# Some simple visualization functions to use if you 
# don't want to integrate with dashboard
# ================================================

# Generate a Gantt chart Buffer using quickchart.io
gantt_chart_buffer = await pipeline.gantt_quickchart()

# Generate a Gantt chart HTML file with Google Charts
gantt_chart_html = await pipeline.gantt_google_chart_html()

# Generate an execution graph URL
execution_graph_url = pipeline.execution_graph_quickchart()

# Get the hierarchical output of all steps
steps_hierarchy = pipeline.output_nested()
```
</details>


PipeLens also provides **Event Emitting** listeners, **ES6/Python Decorators** and - **LLM Tracking Extension** support for easier integration. For more detailed usages, check out the [Basic Usage](./docs/basic-usage.md) and [Advanced Usage](./docs/advanced-usage.md) guides.

### Using Dashboard

PipeLens includes a dashboard that provides several features for monitoring and analyzing pipeline executions. 

#### Initial Configuration

During pipeline initialization, define a Transport to relay pipeline run data to dashboard later on. Currently supported a HttpTransport. See [Advanced Usage](./docs/advanced-usage.md) for more details.

<details>
<summary>Typescript</summary>

```typescript
const httpTransport = new HttpTransport({
  baseUrl: 'http://localhost:3000',
  batchLogs: true,
});

// Create pipeline with HTTP transport
const pipeline = new Pipeline('my-pipeline', {
  autoSave: 'real_time',
  transport: httpTransport
});

// Run your pipeline
await pipeline.track(async (st) => {
  // Your pipeline steps here
});

// Make sure to flush any pending logs when your application is shutting down
await httpTransport.flushAndStop();
```
</details>

<details>
<summary>Python</summary>

```python
from pipelens import Pipeline, Step
from pipelens.transport import HttpTransport, HttpTransportOptions

http_transport = HttpTransport(HttpTransportOptions(
    base_url='http://localhost:3000',
    batch_logs=True
))

# Create pipeline with HTTP transport
pipeline = Pipeline('my-pipeline', 
    auto_save='real_time',
    transport=http_transport
)

# Run your pipeline
async def pipeline_logic(st):
    # Your pipeline steps here
    pass

await pipeline.track(pipeline_logic)

# Make sure to flush any pending logs when your application is shutting down
await http_transport.flush_and_stop()
```
</details>

#### Starting up with Docker Deployment (Recommended)

```bash
# Basic quick start with SQLite (default)
docker run -p 3000:3000 lokwkin/pipelens-dashboard

# Use SQLite storage with custom path
docker run -p 3000:3000 -v $(pwd)/data:/app/data -e STORAGE_OPTION=sqlite -e SQLITE_PATH=/app/data/pipelens.db lokwkin/pipelens-dashboard

# Use PostgreSQL storage
docker run -p 3000:3000 -e STORAGE_OPTION=postgres -e POSTGRES_URL=postgres://user:password@host:5432/pipelens lokwkin/pipelens-dashboard
```

### Detailed Steps and Records Inspection

Pipelens dashboard provides Gantt Chart for visualizing the time usages of each steps in a pipeline run. You can also see the data you recorded for each steps as well as the error message if error thrown.

The dashboard also allows auto-refreshing, allowing you to monitor real-time pipeline runs.

<img src="./docs/dashboard-run-detail.gif">

### Step Execution Stats

Aggregated from historical execution of a step, you can see the performance over time for optimization and improvements.

<img src="./docs/dashboard-stats.gif">

## Roadmap and To Dos
- Dashboard fix auto-refresh disabled when changed page
- Add integration test for data transporting
- Use memory-store instead of storing nested steps class in runtime
- Enhance support for FastAPI with dependency injection
- Support Open telemetry integration


## License
MIT © [lokwkin](https://github.com/lokwkin)
