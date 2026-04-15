from collections.abc import Mapping


def normalize_options_payload(value):
    if value is None:
        return None
    if isinstance(value, list):
        return {"options": value}
    if isinstance(value, Mapping):
        if "options" in value:
            return dict(value)
        if "choices" in value:
            normalized = dict(value)
            normalized["options"] = normalized["choices"]
            return normalized
        # Gemini returns all schema-defined properties with null for unused keys
        filtered = {k: v for k, v in value.items() if v is not None}
        return filtered if filtered else None
    return value


def normalize_correct_answer_payload(value):
    if value is None:
        return None
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, str):
        return {"answer": value}
    return value
