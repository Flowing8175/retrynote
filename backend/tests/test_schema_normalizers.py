from app.schemas._normalizers import (
    normalize_options_payload,
    normalize_correct_answer_payload,
)


class TestNormalizeOptionsPayload:
    async def test_none_returns_none(self):
        assert normalize_options_payload(None) is None

    async def test_list_wraps_in_options_dict(self):
        result = normalize_options_payload(["a", "b", "c"])
        assert result == {"options": ["a", "b", "c"]}

    async def test_dict_with_options_key_passes_through(self):
        data = {"options": [1, 2, 3], "extra": "field"}
        result = normalize_options_payload(data)
        assert result == {"options": [1, 2, 3], "extra": "field"}

    async def test_dict_with_choices_key_adds_options(self):
        data = {"choices": ["x", "y"]}
        result = normalize_options_payload(data)
        assert "options" in result
        assert result["options"] == ["x", "y"]
        assert result["choices"] == ["x", "y"]

    async def test_dict_without_recognized_keys(self):
        data = {"foo": "bar", "baz": 42}
        result = normalize_options_payload(data)
        assert result == {"foo": "bar", "baz": 42}

    async def test_non_dict_non_list_returns_as_is(self):
        assert normalize_options_payload(42) == 42
        assert normalize_options_payload("hello") == "hello"

    async def test_empty_list_wraps_in_options(self):
        result = normalize_options_payload([])
        assert result == {"options": []}

    async def test_empty_dict_returns_none(self):
        # Gemini sometimes returns all-null property dicts; after filtering
        # out None values an empty dict is treated as "no options".
        result = normalize_options_payload({})
        assert result is None


class TestNormalizeCorrectAnswerPayload:
    async def test_none_returns_none(self):
        assert normalize_correct_answer_payload(None) is None

    async def test_dict_passes_through(self):
        data = {"answer": "A", "accepted_answers": ["A", "a"]}
        result = normalize_correct_answer_payload(data)
        assert result == {"answer": "A", "accepted_answers": ["A", "a"]}

    async def test_string_wraps_in_answer_dict(self):
        result = normalize_correct_answer_payload("hello")
        assert result == {"answer": "hello"}

    async def test_other_types_return_as_is(self):
        assert normalize_correct_answer_payload(42) == 42
        assert normalize_correct_answer_payload([1, 2]) == [1, 2]
        assert normalize_correct_answer_payload(True) is True
