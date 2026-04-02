import pytest
from app.utils.normalize import (
    normalize_answer,
    normalize_concept_key,
    is_similar_answer,
)


class TestNormalizeAnswer:
    def test_basic_lowercase(self):
        assert normalize_answer("Hello World") == "hello world"

    def test_strips_whitespace(self):
        assert normalize_answer("  hello  ") == "hello"

    def test_collapses_multiple_spaces(self):
        assert normalize_answer("hello    world") == "hello world"

    def test_removes_punctuation(self):
        assert normalize_answer("Hello, World!") == "hello world"

    def test_korean_text(self):
        assert normalize_answer("서울특별시") == "서울특별시"

    def test_mixed_korean_english(self):
        result = normalize_answer("사회복지실천기술에서 면담기법은 핵심이다.")
        assert "사회복지실천기술" in result
        assert "면담기법" in result

    def test_none_returns_empty(self):
        assert normalize_answer(None) == ""

    def test_empty_string(self):
        assert normalize_answer("") == ""

    def test_only_whitespace(self):
        assert normalize_answer("   ") == ""

    def test_nfc_normalization(self):
        # Hangul decomposition vs composition
        result = normalize_answer("가")
        assert result == "가"

    def test_removes_special_chars(self):
        result = normalize_answer("answer@#$%^&*()")
        assert "@" not in result
        assert "#" not in result

    def test_numbers_preserved(self):
        assert normalize_answer("Answer 123") == "answer 123"

    def test_underscore_preserved(self):
        assert normalize_answer("test_answer") == "test_answer"

    def test_tabs_and_newlines(self):
        assert normalize_answer("hello\tworld\n") == "hello world"


class TestNormalizeConceptKey:
    def test_basic_normalization(self):
        assert normalize_concept_key("Social Work Interview") == "social_work_interview"

    def test_korean_concept(self):
        result = normalize_concept_key("사회복지실천기술 면담기법")
        assert result == "사회복지실천기술_면담기법"

    def test_spaces_to_underscores(self):
        assert normalize_concept_key("a b c") == "a_b_c"

    def test_multiple_spaces(self):
        assert normalize_concept_key("a  b   c") == "a_b_c"

    def test_removes_special_chars(self):
        result = normalize_concept_key("test-concept@key!")
        assert "-" not in result
        assert "@" not in result
        assert "!" not in result

    def test_none_returns_empty(self):
        assert normalize_concept_key(None) == ""

    def test_empty_string(self):
        assert normalize_concept_key("") == ""

    def test_numbers_preserved(self):
        assert normalize_concept_key("concept 123") == "concept_123"

    def test_leading_trailing_spaces(self):
        assert normalize_concept_key("  concept  ") == "concept"

    def test_hyphen_replaced(self):
        assert normalize_concept_key("self-determination") == "selfdetermination"

    def test_nfc_normalization(self):
        result = normalize_concept_key("가")
        assert result == "가"


class TestIsSimilarAnswer:
    def test_exact_match(self):
        assert is_similar_answer("hello", "hello") is True

    def test_case_insensitive(self):
        assert is_similar_answer("Hello", "hello") is True

    def test_whitespace_difference(self):
        assert is_similar_answer("hello world", "hello  world") is True

    def test_similar_text(self):
        assert is_similar_answer("사회복지실천기술", "사회복지실천 기술") is True

    def test_different_text(self):
        assert is_similar_answer("apple", "banana") is False

    def test_empty_user_answer(self):
        assert is_similar_answer("", "hello") is False

    def test_empty_accepted_answer(self):
        assert is_similar_answer("hello", "") is False

    def test_both_empty(self):
        assert is_similar_answer("", "") is False

    def test_custom_threshold(self):
        # "abcdef" vs "abcxyz" - ratio ~0.5, should fail at default 0.8
        assert is_similar_answer("abcdef", "abcxyz", threshold=0.8) is False
        # Should pass with lower threshold
        assert is_similar_answer("abcdef", "abcxyz", threshold=0.4) is True

    def test_very_short_answer(self):
        assert is_similar_answer("a", "a") is True
        assert is_similar_answer("a", "b") is False

    def test_normalized_equality_shortcut(self):
        # When normalized answers are identical, should return True regardless of threshold
        assert is_similar_answer("Hello World", "hello world", threshold=0.99) is True

    def test_korean_similarity(self):
        assert is_similar_answer("면담기법은 핵심이다", "면담기법이 핵심이다") is True
