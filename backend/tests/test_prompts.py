from app.prompts import (
    SYSTEM_PROMPT_QUIZ_GENERATION,
    SYSTEM_PROMPT_GRADING_SHORT,
    SYSTEM_PROMPT_GRADING_ESSAY,
    SYSTEM_PROMPT_OBJECTION_REVIEW,
    SYSTEM_PROMPT_RETRY_GENERATION,
)
from app.prompts.generation import build_generation_prompt


ALL_PROMPTS = [
    SYSTEM_PROMPT_QUIZ_GENERATION,
    SYSTEM_PROMPT_GRADING_SHORT,
    SYSTEM_PROMPT_GRADING_ESSAY,
    SYSTEM_PROMPT_OBJECTION_REVIEW,
    SYSTEM_PROMPT_RETRY_GENERATION,
]


class TestPromptConstants:
    async def test_all_five_prompts_are_strings(self):
        for prompt in ALL_PROMPTS:
            assert isinstance(prompt, str)

    async def test_all_five_prompts_are_non_empty(self):
        for prompt in ALL_PROMPTS:
            assert len(prompt.strip()) > 0

    async def test_exactly_five_prompts_exported(self):
        assert len(ALL_PROMPTS) == 5


class TestBuildGenerationPrompt:
    async def test_returns_string(self):
        result = build_generation_prompt(
            source_context="Some text",
            question_count=5,
            difficulty="medium",
            question_types=["multiple_choice", "ox"],
            concept_counts={},
        )
        assert isinstance(result, str)

    async def test_contains_required_components(self):
        result = build_generation_prompt(
            source_context="Sample source material",
            question_count=10,
            difficulty="hard",
            question_types=["short_answer", "essay"],
            concept_counts={},
        )
        assert "10" in result
        assert "hard" in result
        assert "short_answer" in result
        assert "essay" in result
        assert "Sample source material" in result

    async def test_handles_no_source_flag(self):
        result = build_generation_prompt(
            source_context="",
            question_count=3,
            difficulty="easy",
            question_types=["multiple_choice"],
            concept_counts={},
            is_no_source=True,
        )
        assert "low_confidence_source" in result

    async def test_handles_concept_counts_with_sorting(self):
        concepts = {"concept_a": 5, "concept_b": 2, "concept_c": 8}
        result = build_generation_prompt(
            source_context="text",
            question_count=3,
            difficulty="medium",
            question_types=["ox"],
            concept_counts=concepts,
        )
        assert "concept_c" in result
        assert "concept_a" in result
        assert "concept_b" in result
        idx_c = result.index("concept_c")
        idx_a = result.index("concept_a")
        idx_b = result.index("concept_b")
        assert idx_c < idx_a < idx_b

    async def test_empty_concept_counts_shows_none(self):
        result = build_generation_prompt(
            source_context="text",
            question_count=3,
            difficulty="medium",
            question_types=["ox"],
            concept_counts={},
        )
        assert "없음" in result
