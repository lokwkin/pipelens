# pipelens/lib-py

This is the Python library implementation for **[pipelens](https://github.com/lokwkin/pipelens)**

## Installation

```bash
pip install pipelens
```

## Quick Start

```python
import asyncio
from pipelens import Pipeline, Step
from pipelens.transport import HttpTransport

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

See [GitHub repository](https://github.com/lokwkin/pipelens#readme) for more usages and repository introduction. 