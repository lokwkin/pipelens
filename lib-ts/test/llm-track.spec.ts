import { Pipeline } from '../src/pipeline';
import { Step } from '../src/step';
import {
  LLMTrack,
  OpenAICompatibleChatCompletionResponse,
  LLM_RESPONSE_RECORD_KEY_PREFIX,
} from '../src/extension/llm-track';

describe('LLMTrack', () => {
  describe('track', () => {
    it('should record an LLM response in the step records', () => {
      // Create a test step
      const step = new Step('test-step');

      // Create a mock OpenAI compatible response
      const mockResponse: OpenAICompatibleChatCompletionResponse = {
        id: 'test-id-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      // Track the LLM response
      LLMTrack.track(step, mockResponse);

      // Check that the response was recorded with the correct key
      const records = step.getRecords();
      expect(records).toHaveProperty(`${LLM_RESPONSE_RECORD_KEY_PREFIX}${mockResponse.id}`);
      expect(records[`${LLM_RESPONSE_RECORD_KEY_PREFIX}${mockResponse.id}`]).toEqual(mockResponse);
    });
  });

  describe('getTotalUsage', () => {
    it('should calculate total usage across all steps in a pipeline', async () => {
      // Create a test pipeline
      const pipeline = new Pipeline('test-pipeline');

      await pipeline.track(async (st) => {
        // Create two steps with LLM responses
        await st.step('step1', async (step1) => {
          const mockResponse1: OpenAICompatibleChatCompletionResponse = {
            id: 'resp-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Response 1',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          };

          LLMTrack.track(step1, mockResponse1);
          return 'result1';
        });

        await st.step('step2', async (step2) => {
          const mockResponse2: OpenAICompatibleChatCompletionResponse = {
            id: 'resp-2',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Response 2',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 200,
              completion_tokens: 100,
              total_tokens: 300,
            },
          };

          LLMTrack.track(step2, mockResponse2);
          return 'result2';
        });

        // Add a response with a different model
        await st.step('step3', async (step3) => {
          const mockResponse3: OpenAICompatibleChatCompletionResponse = {
            id: 'resp-3',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Response 3',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 25,
              total_tokens: 75,
            },
          };

          LLMTrack.track(step3, mockResponse3);
          return 'result3';
        });
      });

      // Get the total usage
      const totalUsage = LLMTrack.getTotalUsage(pipeline);

      // Check the GPT-4 usage (sum of responses 1 and 2)
      expect(totalUsage['gpt-4']?.prompt_tokens).toBe(300); // 100 + 200
      expect(totalUsage['gpt-4']?.completion_tokens).toBe(150); // 50 + 100
      expect(totalUsage['gpt-4']?.total_tokens).toBe(450); // 150 + 300

      // Check the GPT-3.5 usage (just from response 3)
      expect(totalUsage['gpt-3.5-turbo']?.prompt_tokens).toBe(50);
      expect(totalUsage['gpt-3.5-turbo']?.completion_tokens).toBe(25);
      expect(totalUsage['gpt-3.5-turbo']?.total_tokens).toBe(75);
    });

    it('should handle LLM responses without usage information', async () => {
      // Create a test pipeline
      const pipeline = new Pipeline('test-pipeline');

      await pipeline.track(async (st) => {
        await st.step('step-no-usage', async (step) => {
          const mockResponseNoUsage: OpenAICompatibleChatCompletionResponse = {
            id: 'resp-no-usage',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Response without usage',
                },
                finish_reason: 'stop',
              },
            ],
            // No usage field
          };

          LLMTrack.track(step, mockResponseNoUsage);
          return 'result';
        });
      });

      // Get the total usage
      const totalUsage = LLMTrack.getTotalUsage(pipeline);

      // Check that model is present but with zero usage
      expect(Object.keys(totalUsage)).toContain('gpt-4');
      expect(totalUsage['gpt-4']?.prompt_tokens).toBe(0);
      expect(totalUsage['gpt-4']?.completion_tokens).toBe(0);
      expect(totalUsage['gpt-4']?.total_tokens).toBe(0);
    });

    it('should handle responses without model information', async () => {
      // Create a test pipeline
      const pipeline = new Pipeline('test-pipeline');

      await pipeline.track(async (st) => {
        await st.step('step-no-model', async (step) => {
          const mockResponseNoModel: OpenAICompatibleChatCompletionResponse = {
            id: 'resp-no-model',
            object: 'chat.completion',
            created: Date.now(),
            model: '', // Empty model
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Response without model',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          };

          LLMTrack.track(step, mockResponseNoModel);
          return 'result';
        });
      });

      // Get the total usage
      const totalUsage = LLMTrack.getTotalUsage(pipeline);

      // Check that no model entry was created
      expect(Object.keys(totalUsage).length).toBe(0);
    });
  });
});
