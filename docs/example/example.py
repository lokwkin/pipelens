import asyncio
import json
import random
from steps_track import Step, Pipeline, StepGanttArg
from steps_track.transport import HttpTransport


async def parse_page(page: str):
    """Simulate parsing a page with random delay."""
    await asyncio.sleep(random.uniform(0.5, 3.5))
    return page


async def main():
    # HTTP transport for sending data to a dashboard
    http_transport = HttpTransport(
        base_url='http://localhost:3001/',  # URL of your dashboard
        batch_logs=True,  # Enable batching for better performance
        flush_interval=5000,  # Flush logs every 5 seconds
        max_batch_size=50,  # Maximum batch size before forcing a flush
        debug=True
    )

    pipeline = Pipeline('pipeline', options={
        'auto_save': 'finish',
        'transport': http_transport  # Setting this will automatically transport logs to the dashboard
    })

    # Set up event listeners
    async def on_step_record(step_key, key, data, _):
        print(f"[{step_key}] Record: {key} = {data}")

    async def on_step_success(step_key, result, _):
        print(f"[{step_key}] Success. Result: {json.dumps(result) if result else 'N/A'}")

    async def on_step_error(step_key, error, _):
        print(f"[{step_key}] Error: {str(error)}")

    pipeline.on('step-record', on_step_record)
    pipeline.on('step-success', on_step_success)
    pipeline.on('step-error', on_step_error)

    # Main pipeline execution
    async def pipeline_track(st: Step):
        # Load config step
        async def load_config(st: Step):
            # ...
            # Your logic here
            # ...
            await st.record('foo', 'bar')
            await asyncio.sleep(0.2)

        await st.step('load_config', load_config)

        # Parsing step
        async def parsing(st: Step):
            # Preprocess step
            async def preprocess(st: Step):
                # Some preprocess logic
                await st.record('pageCount', 3)
                await asyncio.sleep(3.0)
                return [f"page_{i+1}" for i in range(3)]

            pages = await st.step('preprocess', preprocess)

            await asyncio.sleep(0.5)

            # Concurrent substeps for page parsing
            tasks = []
            for page in pages:
                async def parse_page_step(st: Step, page=page):
                    return await parse_page(page)

                tasks.append(st.step(f"{page}", parse_page_step))

            await asyncio.gather(*tasks)

            # Example of handling errors
            try:
                async def error_step(st: Step):
                    await asyncio.sleep(0.8)
                    raise Exception("Sample Error")

                await st.step('sample-error', error_step)
            except Exception as e:
                print('Catch error', str(e))

        await st.step('parsing', parsing)

    # Run the pipeline
    await pipeline.track(pipeline_track)

    # Flush any pending logs
    if hasattr(http_transport, 'flush_and_stop'):
        await http_transport.flush_and_stop()

    # Generate visualizations
    gantt_args = StepGanttArg(
        unit='s',  # 's' | 'ms'. Default 'ms'
        min_width=500,  # Default 500
        min_height=300,  # Default 300
        filter='pipeline.parsing(\\.[a-zA-Z0-9-_])?'  # string[] | RegExp. if not provided, all steps will be included
    )

    steps_flattened = pipeline.output_flattened()

    print('Steps:', json.dumps([s.model_dump() for s in steps_flattened], indent=2))

    # Generate charts
    gantt_chart_buffer = await pipeline.gantt_quickchart(gantt_args)
    gantt_chart_html = pipeline.gantt_google_chart_html(gantt_args)

    # Uncomment to save the charts
    with open('gantt.png', 'wb') as f:
        f.write(gantt_chart_buffer.getvalue())
    with open('gantt.html', 'w') as f:
        f.write(gantt_chart_html)

    # Make sure to flush any pending logs when your application is shutting down
    await http_transport.flush_and_stop()


if __name__ == "__main__":
    asyncio.run(main())
