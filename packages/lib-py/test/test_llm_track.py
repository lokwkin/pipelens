import pytest
import time

from pipelens import (
    Step,
    Pipeline,
    LLMTrack,
    OpenAICompatibleChatCompletionResponse,
    LLM_RESPONSE_RECORD_KEY_PREFIX
)


@pytest.mark.asyncio
class TestLLMTrack:
    """Test cases for the LLMTrack utility class"""

    async def test_track(self):
        """Test that an LLM response is recorded in the step records"""
        # Create a test step
        step = Step('test-step')

        # Create a mock OpenAI compatible response
        mock_response = OpenAICompatibleChatCompletionResponse(
            id='test-id-123',
            object='chat.completion',
            created=int(time.time() * 1000),
            model='gpt-4',
            choices=[
                {
                    'index': 0,
                    'message': {
                        'role': 'assistant',
                        'content': 'Test response',
                    },
                    'finish_reason': 'stop',
                }
            ],
            usage={
                'prompt_tokens': 100,
                'completion_tokens': 50,
                'total_tokens': 150,
            }
        )

        # Track the LLM response
        await LLMTrack.track(step, mock_response)

        # Check that the response was recorded with the correct key
        records = step.get_records()
        record_key = f"{LLM_RESPONSE_RECORD_KEY_PREFIX}{mock_response.id}"

        assert record_key in records
        assert records[record_key]['id'] == mock_response.id
        assert records[record_key]['model'] == 'gpt-4'
        assert records[record_key]['usage']['prompt_tokens'] == 100
        assert records[record_key]['usage']['completion_tokens'] == 50
        assert records[record_key]['usage']['total_tokens'] == 150

    async def test_get_total_usage(self):
        """Test calculating total usage across all steps in a pipeline"""
        # Create a test pipeline
        pipeline = Pipeline('test-pipeline')

        async def create_track_step(resp_id, model, prompt_tokens, completion_tokens):
            async def track_step(step):
                mock_response = OpenAICompatibleChatCompletionResponse(
                    id=resp_id,
                    object='chat.completion',
                    created=int(time.time() * 1000),
                    model=model,
                    choices=[
                        {
                            'index': 0,
                            'message': {
                                'role': 'assistant',
                                'content': f'Response for {resp_id}',
                            },
                            'finish_reason': 'stop',
                        }
                    ],
                    usage={
                        'prompt_tokens': prompt_tokens,
                        'completion_tokens': completion_tokens,
                        'total_tokens': prompt_tokens + completion_tokens,
                    }
                )
                await LLMTrack.track(step, mock_response)
                return f'result-{resp_id}'
            return track_step

        async def with_steps(st):
            # Create steps with LLM responses
            await st.step('step1', await create_track_step('resp-1', 'gpt-4', 100, 50))
            await st.step('step2', await create_track_step('resp-2', 'gpt-4', 200, 100))
            await st.step('step3', await create_track_step('resp-3', 'gpt-3.5-turbo', 50, 25))
            return 'results'

        # Run the pipeline with the steps
        await pipeline.track(with_steps)

        # Get the total usage
        total_usage = LLMTrack.get_total_usage(pipeline)

        # Check the GPT-4 usage (sum of responses 1 and 2)
        assert total_usage['gpt-4'].prompt_tokens == 300  # 100 + 200
        assert total_usage['gpt-4'].completion_tokens == 150  # 50 + 100
        assert total_usage['gpt-4'].total_tokens == 450  # 150 + 300

        # Check the GPT-3.5 usage (just from response 3)
        assert total_usage['gpt-3.5-turbo'].prompt_tokens == 50
        assert total_usage['gpt-3.5-turbo'].completion_tokens == 25
        assert total_usage['gpt-3.5-turbo'].total_tokens == 75

    async def test_handle_response_without_usage(self):
        """Test handling LLM responses without usage information"""
        # Create a test pipeline
        pipeline = Pipeline('test-pipeline')

        async def create_no_usage_step():
            async def track_step(step):
                mock_response = OpenAICompatibleChatCompletionResponse(
                    id='resp-no-usage',
                    object='chat.completion',
                    created=int(time.time() * 1000),
                    model='gpt-4',
                    choices=[
                        {
                            'index': 0,
                            'message': {
                                'role': 'assistant',
                                'content': 'Response without usage',
                            },
                            'finish_reason': 'stop',
                        }
                    ]
                    # No usage field
                )
                await LLMTrack.track(step, mock_response)
                return 'result'
            return track_step

        async def with_steps(st):
            await st.step('step-no-usage', await create_no_usage_step())
            return 'results'

        # Run the pipeline with the step
        await pipeline.track(with_steps)

        # Get the total usage
        total_usage = LLMTrack.get_total_usage(pipeline)

        # Check that model is present but with zero usage
        assert 'gpt-4' in total_usage
        assert total_usage['gpt-4'].prompt_tokens == 0
        assert total_usage['gpt-4'].completion_tokens == 0
        assert total_usage['gpt-4'].total_tokens == 0

    async def test_handle_response_without_model(self):
        """Test handling responses without model information"""
        # Create a test pipeline
        pipeline = Pipeline('test-pipeline')

        async def create_no_model_step():
            async def track_step(step):
                mock_response = OpenAICompatibleChatCompletionResponse(
                    id='resp-no-model',
                    object='chat.completion',
                    created=int(time.time() * 1000),
                    model='',  # Empty model
                    choices=[
                        {
                            'index': 0,
                            'message': {
                                'role': 'assistant',
                                'content': 'Response without model',
                            },
                            'finish_reason': 'stop',
                        }
                    ],
                    usage={
                        'prompt_tokens': 100,
                        'completion_tokens': 50,
                        'total_tokens': 150,
                    }
                )
                await LLMTrack.track(step, mock_response)
                return 'result'
            return track_step

        async def with_steps(st):
            await st.step('step-no-model', await create_no_model_step())
            return 'results'

        # Run the pipeline with the step
        await pipeline.track(with_steps)

        # Get the total usage
        total_usage = LLMTrack.get_total_usage(pipeline)

        # Check that no model entry was created
        assert len(total_usage) == 0
