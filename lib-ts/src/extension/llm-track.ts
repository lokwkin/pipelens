import { Step } from '../step';

export interface OpenAICompatibleChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
      content: string | null;
      function_call?: {
        name: string;
        arguments: string;
      };
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | 'null' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

type LLMUsage = NonNullable<OpenAICompatibleChatCompletionResponse['usage']>;

export const LLM_RESPONSE_RECORD_KEY_PREFIX = '__LLM_RESPONSE_';

export class LLMTrack {
  /**
   * Track an LLM response.
   * @param step - The step to track the LLM response for.
   * @param response - The LLM response to track.
   */
  public static track(step: Step, response: OpenAICompatibleChatCompletionResponse) {
    // Create a new object with only the fields defined in the interface
    const sanitizedResponse: OpenAICompatibleChatCompletionResponse = {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      choices: response.choices,
      usage: response.usage,
      system_fingerprint: response.system_fingerprint,
    };

    step.record(LLM_RESPONSE_RECORD_KEY_PREFIX + response.id, sanitizedResponse);
  }

  /**
   * Calculate the total usage of all LLM responses in the pipeline.
   * @param pipeline - The pipeline to calculate the total usage for.
   * @returns A record of total usage by model.
   */
  public static getTotalUsage(step: Step): Record<string, LLMUsage> {
    const totalUsages: Record<string, LLMUsage> = {}; // Usage by Model

    step.outputFlattened().forEach((substep) => {
      const llmResponses = Object.entries(substep.records).filter(([key]) =>
        key.startsWith(LLM_RESPONSE_RECORD_KEY_PREFIX),
      );

      llmResponses.forEach(([_key, item]) => {
        const llmResponse = item as OpenAICompatibleChatCompletionResponse;
        const model = llmResponse.model;
        if (!model) {
          return;
        }

        if (!totalUsages[model]) {
          totalUsages[model] = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };
        }

        if (totalUsages[model] && llmResponse.usage) {
          totalUsages[model].prompt_tokens += llmResponse.usage.prompt_tokens || 0;
          totalUsages[model].completion_tokens += llmResponse.usage.completion_tokens || 0;
          totalUsages[model].total_tokens += llmResponse.usage.total_tokens || 0;
        }
      });
    });

    return totalUsages;
  }
}
