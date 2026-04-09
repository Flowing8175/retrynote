"""
System prompts for AI functions in RetryNote.

This module separates system prompts by function to enable:
- Version control (git history)
- IDE autocomplete
- Type hints for structured fields
- Runtime validation
- A/B testing variants via config
"""

from .generation import SYSTEM_PROMPT_QUIZ_GENERATION
from .grading_short import SYSTEM_PROMPT_GRADING_SHORT
from .grading_essay import SYSTEM_PROMPT_GRADING_ESSAY
from .objection import SYSTEM_PROMPT_OBJECTION_REVIEW
from .retry_generation import SYSTEM_PROMPT_RETRY_GENERATION, build_batch_retry_prompt

__all__ = [
    "SYSTEM_PROMPT_QUIZ_GENERATION",
    "SYSTEM_PROMPT_GRADING_SHORT",
    "SYSTEM_PROMPT_GRADING_ESSAY",
    "SYSTEM_PROMPT_OBJECTION_REVIEW",
    "SYSTEM_PROMPT_RETRY_GENERATION",
    "build_batch_retry_prompt",
]
