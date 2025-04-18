# steps-track/lib-py

This is the Python library implementation for **[steps-track](https://github.com/lokwkin/steps-track)**

StepsTrack is an observability tool built to help ***tracking, visualizing and inspecting*** intermediate steps in a complex ***pipeline-based application***. It automatically captures and stores the intermediate data, results and execution times of each steps in a pipeline, visualizing the execution details and allowing easier debug or analysis through an analytic dashboard.

## Installation

```bash
pip install steps-track
```

## Quick Start

```python
import asyncio
from steps_track import Pipeline, Step
from steps_track.transport import HttpTransport

async def main():
    http_transport = HttpTransport(
        base_url='http://localhost:3000',
    )

    pipeline = Pipeline('my-pipeline', options={
        'auto_save': 'finish',
        'transport': http_transport,
    })

    async def pipeline_track(st: Step):
        async def step1(st: Step):
            # Step 1 logic
            await st.record('key', 'value')
            
        await st.step('step1', step1)
        
        async def step2(st: Step):
            # Step 2 logic
            return 'result'
            
        await st.step('step2', step2)

    await pipeline.track(pipeline_track)

    # Export output
    exported = pipeline.output_pipeline_meta()

    # Gantt Chart Visualization
    gantt_chart_buffer = await pipeline.gantt_quickchart()

if __name__ == "__main__":
    asyncio.run(main())
```

See [GitHub repository](https://github.com/lokwkin/steps-track#readme) for more usages and repository introduction. 