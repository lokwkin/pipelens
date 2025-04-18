import asyncio
import pytest
from .step import Step

# Use pytest's native async test features


@pytest.mark.asyncio
class TestStepAsync:
    """Async test cases for the Step class using pytest's native async support"""

    async def test_constructor_basic(self):
        """Test creating a step with a basic name"""
        step = Step('test-step')
        await step.track(lambda st: asyncio.sleep(0.001, result=st))

        assert step.get_name() == 'test-step'
        assert step.get_key() == 'test-step'

    async def test_constructor_with_custom_key(self):
        """Test creating a step with a custom key"""
        step = Step('test-step', key='custom-key')
        await step.track(lambda st: asyncio.sleep(0.001, result=st))

        assert step.get_name() == 'test-step'
        assert step.get_key() == 'custom-key'

    async def test_constructor_with_parent(self):
        """Test creating a step with a parent step"""
        parent_step = Step('parent')
        child_step = None

        async def parent_func(st):
            nonlocal child_step
            # Assign child_step within the scope of the function it's awaited in
            inner_child_step = await st.step('child', lambda child: asyncio.sleep(0.001, result=child))
            child_step = inner_child_step  # Assign to nonlocal variable after await
            return {'parent': st, 'child': child_step}

        await parent_step.track(parent_func)

        assert child_step is not None  # Ensure child_step was assigned
        assert child_step.get_key() == 'parent.child'

    async def test_run_return_result(self):
        """Test that run returns the callable's result"""
        step = Step('test-step')

        async def test_func(st):
            inner_result = await st.step('inner-step', lambda _: asyncio.sleep(0.001, result='result'))
            return {'step': st, 'result': inner_result}

        result = await step.track(test_func)

        assert result['result'] == 'result'

    async def test_run_handle_errors(self):
        """Test that run handles errors in the callable"""
        error = Exception('test error')
        step = Step('test-step')

        async def test_func(st):
            # Define and immediately await the inner function that raises
            async def raise_error(_):
                # Simulate an error after a small delay if needed, or just raise
                await asyncio.sleep(0.001)  # Optional delay
                raise error
            await st.step('inner-step', raise_error)

        with pytest.raises(Exception, match='test error'):
            await step.track(test_func)

    async def test_track_time_usage(self):
        """Test that time usage is tracked correctly"""
        step = Step('test-step')

        async def test_func(st):
            await st.step('inner-step', lambda _st: asyncio.sleep(0.02, result='result'))
            return st

        result = await step.track(test_func)

        flattened = result.output_flattened()
        inner_step = [s for s in flattened if s.name == 'inner-step'][0]

        assert inner_step.time.timeUsageMs is not None
        assert inner_step.time.timeUsageMs >= 15

    async def test_completed_step_time_meta(self):
        """Test that completed steps have all time metadata"""
        step = Step('test-step')
        result = await step.track(lambda st: asyncio.sleep(0.001, result=st))

        meta = result.get_step_meta()

        assert meta.time.startTs is not None
        assert meta.time.endTs is not None
        assert meta.time.timeUsageMs is not None

    async def test_record(self):
        """Test that record stores data with the given key"""
        step = Step('test-step')

        async def test_func(st):
            await st.record('test-key', 'test-value')
            return st

        result = await step.track(test_func)

        meta = result.get_step_meta()
        assert meta.records['test-key'] == 'test-value'

    # --- Event Tests (No Bubbling) ---
    # Note: Listeners must be attached to the specific step instance.

    async def test_event_step_start(self):
        """Test step-start event is emitted only by the starting step"""
        events = []
        step = Step('test-step')

        async def listener(*args):
            events.append(('step-start', args[0]))

        step.on('step-start', listener)

        async def test_func(st):
            # Pass the inner_task function to st.step
            await st.step('inner-step', lambda inner_st: asyncio.sleep(0.001, result=inner_st))
            return st

        await step.track(test_func)

        await asyncio.sleep(0.1)  # Wait for events to be emitted

        # Expect 1 event on parent, 1 event on child
        assert len(events) == 2
        assert events[0][1] == 'test-step'
        assert events[1][1] == 'test-step.inner-step'

    async def test_event_step_success(self):
        """Test step-success event is emitted only by the succeeding step"""
        events = []
        step = Step('test-step')

        async def listener(*args):
            events.append(('step-success', args[0], args[1]))

        step.on('step-success', listener)

        async def test_func(st):
            inner_result = await st.step('inner-step', lambda inner_st: asyncio.sleep(0.001, result='inner-result'))
            return {'inner': inner_result}

        await step.track(test_func)

        await asyncio.sleep(0.1)  # Wait for events to be emitted
        print(events)

        # Expect 1 success event on parent, 1 on child
        assert len(events) == 2
        assert events[0][1] == 'test-step.inner-step'
        assert events[0][2] == 'inner-result'
        assert events[1][1] == 'test-step'
        assert events[1][2] == {'inner': 'inner-result'}

    async def test_event_step_error(self):
        """Test step-error event is emitted only by the failing step"""
        events = []
        step = Step('test-step')

        async def parent_listener(*args):
            print(('step-error', args[0], args[1]))
            events.append(('step-error', args[0], args[1]))

        step.on('step-error', parent_listener)

        async def test_func(st):
            async def raise_error(_):
                await asyncio.sleep(0.001)
                raise Exception('test error')

            await st.step('inner-step', raise_error)

        with pytest.raises(Exception, match='test error'):
            await step.track(test_func)

        await asyncio.sleep(0.1)  # Wait for events to be emitted

        assert len(events) == 2
        assert events[0][1] == 'test-step.inner-step'
        assert isinstance(events[0][2], Exception)
        assert str(events[0][2]) == 'test error'
        assert events[1][1] == 'test-step'
        assert isinstance(events[1][2], Exception)
        assert str(events[1][2]) == 'test error'

    async def test_event_step_record(self):
        """Test step-record event is emitted only by the recording step"""
        events = []
        step = Step('test-step')

        async def listener(*args):
            events.append(('step-record', args[0], args[1], args[2]))

        step.on('step-record', listener)

        async def test_func(st):
            # Record on the parent step (st)
            await st.record('parent-key', 'parent-value')

            # Define inner task to record and attach listener
            async def inner_task(inner_st):
                await inner_st.record('inner-key', 'inner-value')
                return inner_st

            await st.step('inner-step', inner_task)
            return st

        await step.track(test_func)

        await asyncio.sleep(0.1)  # Wait for events to be emitted

        assert len(events) == 2

        # Expect 1 event on parent
        assert events[0][1] == 'test-step'
        assert events[0][2] == 'parent-key'
        assert events[0][3] == 'parent-value'

        # Expect 1 event on child
        assert events[1][1] == 'test-step.inner-step'
        assert events[1][2] == 'inner-key'
        assert events[1][3] == 'inner-value'

    async def test_event_step_complete(self):
        """Test step-complete event is emitted only by the completing step"""
        events = []
        step = Step('test-step')

        async def listener(*args):
            events.append(('step-complete', args[0]))

        step.on('step-complete', listener)

        async def test_func(st):
            async def inner_task(inner_st):
                await asyncio.sleep(0.001)
                return 'result'
            await st.step('inner-step', inner_task)
            return st

        await step.track(test_func)

        await asyncio.sleep(0.1)  # Wait for events to be emitted

        assert len(events) == 2
        assert events[0][1] == 'test-step.inner-step'
        assert events[1][1] == 'test-step'

    async def test_output_nested(self):
        """Test that output_nested returns the correct hierarchy"""
        step = Step('parent')

        async def test_func(st):
            await st.step('child1', lambda _: asyncio.sleep(0.001, result='result1'))
            await st.step('child2', lambda _: asyncio.sleep(0.001, result='result2'))
            return st

        result = await step.track(test_func)

        hierarchy = result.output_nested()

        assert hierarchy.name == 'parent'
        assert len(hierarchy.substeps) == 2
        assert hierarchy.substeps[0].name == 'child1'
        assert hierarchy.substeps[0].result == 'result1'
        assert hierarchy.substeps[1].name == 'child2'
        assert hierarchy.substeps[1].result == 'result2'

    async def test_output_flattened(self):
        """Test that output_flattened returns all steps in a flat list"""
        step = Step('parent')

        async def grandchild_func(st):
            await asyncio.sleep(0.001)  # Ensure coro runs
            return 'result-gc'

        async def child1_func(st):
            await st.step('grandchild', grandchild_func)
            return 'result1'

        async def child2_func(st):
            await asyncio.sleep(0.001)  # Ensure coro runs
            return 'result2'

        async def test_func(st):
            await st.step('child1', child1_func)
            await st.step('child2', child2_func)
            return st

        result = await step.track(test_func)

        flattened = result.output_flattened()

        assert len(flattened) == 4  # parent, child1, grandchild, child2
        assert flattened[0].name == 'parent'
        assert flattened[1].name == 'child1'
        assert flattened[2].name == 'grandchild'
        assert flattened[3].name == 'child2'
