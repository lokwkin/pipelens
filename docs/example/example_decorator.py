import asyncio
import json
import random
from steps_track import Pipeline, Step, with_step


class SamplePipeline:
    """Example class demonstrating the use of the with_step decorator."""

    def __init__(self):
        """Initialize the pipeline tracker."""
        self.pipeline_tracker = Pipeline('sample-pipeline')

    async def run(self):
        """Run the pipeline and visualize the results."""
        await self.pipeline_tracker.track(self._execute_pipeline)
        print(json.dumps([s.dict() for s in self.pipeline_tracker.output_flattened()], indent=4))
        chart = await self.pipeline_tracker.gantt_quickchart()
        print(f"Generated chart with size: {len(chart.getvalue())} bytes")

    async def _execute_pipeline(self, st: Step):
        """Main pipeline execution function."""
        await self.load_config(st)
        await self.parsing(st)

    @with_step('load_config')
    async def load_config(self, st: Step, extra_str: str = None):
        """Load configuration step."""
        print('extra_str', extra_str)
        await st.record('foo', 'bar')
        await asyncio.sleep(0.2)

    @with_step('parsing')
    async def parsing(self, st: Step):
        """Parse pages step."""
        # Preprocessing
        pages = await self.preprocess(st)

        # Wait a while
        await asyncio.sleep(0.5)

        # Concurrently parse pages
        tasks = []
        for page in pages:
            tasks.append(self.parse_page(page, st))

        await asyncio.gather(*tasks)

    @with_step('preprocess')
    async def preprocess(self, st: Step):
        """Preprocess and prepare list of pages."""
        await st.record('pageCount', 3)
        await asyncio.sleep(1.0)
        return [f"page_{i+1}" for i in range(3)]

    @with_step('parse_page')
    async def parse_page(self, page: str, st: Step):
        """Parse a single page with a random delay."""
        # Simulate work with a random delay
        await asyncio.sleep(random.uniform(0.5, 3.5))
        return page


async def main():
    """Run the sample pipeline."""
    pipeline = SamplePipeline()
    await pipeline.run()


if __name__ == "__main__":
    asyncio.run(main())
