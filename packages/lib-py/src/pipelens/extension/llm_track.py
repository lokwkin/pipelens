from typing import Dict, List, Optional, Literal, Any
from pydantic import BaseModel

from ..step import Step


class MessageContent(BaseModel):
    role: Literal['system', 'user', 'assistant', 'tool', 'function']
    content: Optional[str] = None
    function_call: Optional[Dict[str, Any]] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


class Choice(BaseModel):
    index: int
    message: MessageContent
    finish_reason: Optional[Literal['stop', 'length', 'function_call', 'tool_calls', 'content_filter', 'null']] = None


class Usage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class OpenAICompatibleChatCompletionResponse(BaseModel):
    id: str
    object: Literal['chat.completion']
    created: int
    model: str
    choices: List[Choice]
    usage: Optional[Usage] = None
    system_fingerprint: Optional[str] = None


# Type for LLM usage by model
LLMUsage = Usage

# Prefix for LLM response records
LLM_RESPONSE_RECORD_KEY_PREFIX = "__LLM_RESPONSE_"


class LLMTrack:
    """
    Utility class for tracking LLM responses in steps.
    """

    @staticmethod
    async def track(step: Step, response: OpenAICompatibleChatCompletionResponse) -> None:
        """
        Track an LLM response in a step.

        Args:
            step: The step to track the LLM response for.
            response: The LLM response to track.
        """
        # Create a new object with only the fields defined in the interface
        sanitized_response = OpenAICompatibleChatCompletionResponse(
            id=response.id,
            object=response.object,
            created=response.created,
            model=response.model,
            choices=response.choices,
            usage=response.usage,
            system_fingerprint=response.system_fingerprint
        )

        await step.record(LLM_RESPONSE_RECORD_KEY_PREFIX + response.id, sanitized_response.model_dump())

    @staticmethod
    def get_total_usage(step: Step) -> Dict[str, LLMUsage]:
        """
        Calculate the total usage of all LLM responses in the step and its substeps.

        Args:
            step: The step to calculate the total usage for.

        Returns:
            A dictionary of total usage by model.
        """
        total_usages: Dict[str, LLMUsage] = {}  # Usage by Model

        for substep in step.output_flattened():
            # Filter records to only include LLM responses
            llm_responses = {k: v for k, v in substep.records.items()
                             if k.startswith(LLM_RESPONSE_RECORD_KEY_PREFIX)}

            for _, item in llm_responses.items():
                llm_response = item
                model = llm_response.get('model', '')
                if not model:
                    continue

                if model not in total_usages:
                    total_usages[model] = Usage(
                        prompt_tokens=0,
                        completion_tokens=0,
                        total_tokens=0
                    )

                usage = llm_response.get('usage')
                if usage:
                    total_usages[model].prompt_tokens += usage.get('prompt_tokens', 0)
                    total_usages[model].completion_tokens += usage.get('completion_tokens', 0)
                    total_usages[model].total_tokens += usage.get('total_tokens', 0)

        return total_usages
