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
from .grading_exam import SYSTEM_PROMPT_EXAM_BATCH
from .objection import SYSTEM_PROMPT_OBJECTION_REVIEW
from .error_classification import SYSTEM_PROMPT_ERROR_CLASSIFY
from .wrong_note_feedback import SYSTEM_PROMPT_WRONG_NOTE_FEEDBACK
from .retry_generation import SYSTEM_PROMPT_RETRY_GENERATION
from .dashboard_coaching import SYSTEM_PROMPT_DASHBOARD_COACHING

__all__ = [
    "SYSTEM_PROMPT_QUIZ_GENERATION",
    "SYSTEM_PROMPT_GRADING_SHORT",
    "SYSTEM_PROMPT_GRADING_ESSAY",
    "SYSTEM_PROMPT_EXAM_BATCH",
    "SYSTEM_PROMPT_OBJECTION_REVIEW",
    "SYSTEM_PROMPT_ERROR_CLASSIFY",
    "SYSTEM_PROMPT_WRONG_NOTE_FEEDBACK",
    "SYSTEM_PROMPT_RETRY_GENERATION",
    "SYSTEM_PROMPT_DASHBOARD_COACHING",
]
