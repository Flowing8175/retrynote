import re
import unicodedata


def normalize_answer(text: str) -> str:
    if text is None:
        return ""
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    text = text.lower()
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[^\w\s가-힣]", "", text)
    text = text.strip()
    return text


def normalize_concept_key(raw: str) -> str:
    if raw is None:
        return ""
    key = raw.strip().lower()
    key = re.sub(r"\s+", "_", key)
    key = re.sub(r"[^a-z0-9가-힣_]", "", key)
    key = unicodedata.normalize("NFC", key)
    return key


def is_similar_answer(
    user_answer: str, accepted_answer: str, threshold: float = 0.8
) -> bool:
    if not user_answer or not accepted_answer:
        return False
    norm_user = normalize_answer(user_answer)
    norm_accepted = normalize_answer(accepted_answer)
    if norm_user == norm_accepted:
        return True
    from difflib import SequenceMatcher

    ratio = SequenceMatcher(None, norm_user, norm_accepted).ratio()
    return ratio >= threshold
