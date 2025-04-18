import pytest

from steps_track import Step
from steps_track.decorator import with_step


@pytest.mark.asyncio
class TestDecorator:
    """Test cases for the with_step decorator"""

    async def test_with_step_decorator(self):
        """Test basic functionality of the with_step decorator"""
        main_step = Step('main-step')

        class TestClass:
            @with_step('substep-method')
            async def method_with_step(self, param1: str, step: Step) -> str:
                await step.record('param1', param1)
                return f"Result from {step.get_name()} with {param1}"

        test_instance = TestClass()

        result = await test_instance.method_with_step('test-value', main_step)

        # Check that the result includes the substep name
        assert "Result from substep-method with test-value" == result

        # Check that the step hierarchy is correct
        hierarchy = main_step.output_nested()
        assert len(hierarchy.substeps) == 1
        assert hierarchy.substeps[0].name == 'substep-method'

        # Check that the record was added to the substep
        flattened = main_step.output_flattened()
        substep = [s for s in flattened if s.name == 'substep-method'][0]
        assert substep.records['param1'] == 'test-value'

    async def test_with_step_decorator_missing_step(self):
        """Test that the decorator raises an error when the last argument is not a Step"""
        class TestClass:
            @with_step('substep-method')
            async def method_with_step(self, param1: str, step: Step) -> str:
                return f"Result from {step.get_name()} with {param1}"

        test_instance = TestClass()

        # Calling the method without a Step should raise TypeError
        with pytest.raises(TypeError, match="must be a `Step`"):
            await test_instance.method_with_step('test-value', "not-a-step")

    async def test_with_step_decorator_multiple_methods(self):
        """Test that multiple decorated methods work together correctly"""
        main_step = Step('main-step')

        class TestService:
            @with_step('first-operation')
            async def first_operation(self, value: str, step: Step) -> str:
                await step.record('input', value)
                return f"first:{value}"

            @with_step('second-operation')
            async def second_operation(self, value: str, step: Step) -> str:
                await step.record('input', value)
                return f"second:{value}"

            @with_step('combined-operation')
            async def combined_operation(self, value: str, step: Step) -> str:
                # Call the first operation as a substep
                first_result = await self.first_operation(value, step)

                # Call the second operation as a substep
                second_result = await self.second_operation(first_result, step)

                await step.record('result', second_result)
                return second_result

        service = TestService()

        # Execute the combined operation
        result = await service.combined_operation('input', main_step)

        # Check the result
        assert result == "second:first:input"

        # Check the step hierarchy
        hierarchy = main_step.output_nested()
        assert len(hierarchy.substeps) == 1  # combined-operation

        combined_step = hierarchy.substeps[0]
        assert combined_step.name == 'combined-operation'
        assert len(combined_step.substeps) == 2  # first-operation and second-operation

        # Check that the first and second operations were recorded
        operation_names = [s.name for s in combined_step.substeps]
        assert 'first-operation' in operation_names
        assert 'second-operation' in operation_names

        # Check the records
        assert combined_step.records['result'] == "second:first:input"

    async def test_with_step_decorator_with_nested_steps(self):
        """Test that the decorator works with deeply nested steps"""
        main_step = Step('main-step')

        class TestService:
            @with_step('level1')
            async def level1_method(self, value: str, step: Step) -> str:
                result = await self.level2_method(f"{value}:l1", step)
                return result

            @with_step('level2')
            async def level2_method(self, value: str, step: Step) -> str:
                result = await self.level3_method(f"{value}:l2", step)
                return result

            @with_step('level3')
            async def level3_method(self, value: str, step: Step) -> str:
                await step.record('deep_value', value)
                return f"{value}:l3"

        service = TestService()

        # Execute the nested operations
        result = await service.level1_method('start', main_step)

        # Check the result
        assert result == "start:l1:l2:l3"

        # Verify the step hierarchy
        hierarchy = main_step.output_nested()
        assert len(hierarchy.substeps) == 1  # level1

        level1_step = hierarchy.substeps[0]
        assert level1_step.name == 'level1'
        assert len(level1_step.substeps) == 1  # level2

        level2_step = level1_step.substeps[0]
        assert level2_step.name == 'level2'
        assert len(level2_step.substeps) == 1  # level3

        level3_step = level2_step.substeps[0]
        assert level3_step.name == 'level3'
        assert level3_step.records['deep_value'] == 'start:l1:l2'
