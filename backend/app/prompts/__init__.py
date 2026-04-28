"""
System prompts for AI functions in RetryNote.

This module separates system prompts by function to enable:
- Version control (git history)
- IDE autocomplete
- Type hints for structured fields
- Runtime validation
- A/B testing variants via config
"""

from .generation import (
    SYSTEM_PROMPT_QUIZ_GENERATION,
    SYSTEM_PROMPT_QUIZ_GENERATION_EASY,
    SYSTEM_PROMPT_QUIZ_GENERATION_MEDIUM,
    SYSTEM_PROMPT_QUIZ_GENERATION_HARD,
    SYSTEM_PROMPT_DIFFICULTY_SELECTION,
    get_generation_system_prompt,
)
from .grading_short import SYSTEM_PROMPT_GRADING_SHORT
from .grading_essay import SYSTEM_PROMPT_GRADING_ESSAY
from .objection import SYSTEM_PROMPT_OBJECTION_REVIEW
from .retry_generation import (
    SYSTEM_PROMPT_RETRY_GENERATION,
    build_batch_retry_prompt,
    get_retry_system_prompt,
)
from .study import (
    STUDY_MODEL,
    SUMMARY_PROMPT,
    FLASHCARD_PROMPT,
    MINDMAP_PROMPT,
    TUTOR_SYSTEM_PROMPT,
)
from .topic_expansion import (
    TOPIC_EXPANSION_SYSTEM_MESSAGE,
    build_topic_expansion_prompt,
    get_max_tokens as get_topic_expansion_max_tokens,
    normalize_depth as normalize_topic_depth,
)

__all__ = [
    "SYSTEM_PROMPT_QUIZ_GENERATION",
    "SYSTEM_PROMPT_QUIZ_GENERATION_EASY",
    "SYSTEM_PROMPT_QUIZ_GENERATION_MEDIUM",
    "SYSTEM_PROMPT_QUIZ_GENERATION_HARD",
    "SYSTEM_PROMPT_DIFFICULTY_SELECTION",
    "get_generation_system_prompt",
    "SYSTEM_PROMPT_GRADING_SHORT",
    "SYSTEM_PROMPT_GRADING_ESSAY",
    "SYSTEM_PROMPT_OBJECTION_REVIEW",
    "SYSTEM_PROMPT_RETRY_GENERATION",
    "build_batch_retry_prompt",
    "get_retry_system_prompt",
    "STUDY_MODEL",
    "SUMMARY_PROMPT",
    "FLASHCARD_PROMPT",
    "MINDMAP_PROMPT",
    "TUTOR_SYSTEM_PROMPT",
    "TOPIC_EXPANSION_SYSTEM_MESSAGE",
    "build_topic_expansion_prompt",
    "get_topic_expansion_max_tokens",
    "normalize_topic_depth",
]
