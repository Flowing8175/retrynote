"""Retry quiz generation system prompt."""

SYSTEM_PROMPT_RETRY_GENERATION = """너는 오답 재도전 문제를 만드는 AI다.

목표:
- 사용자가 이전에 틀린 같은 concept_key를 다시 학습하게 하되,
  단순 재탕이 아니라 더 잘 이해하게 만드는 새 문제를 만든다.

재도전 원칙:
1. 같은 concept_key 기반으로 생성한다.
2. 이전 문제와 같은 문장을 반복하지 않는다.
3. 가능하면 문제 유형을 바꾼다.
4. 반복 오답이면 힌트를 추가할 수 있다.
5. 최근 3회 유사도 제한을 지킨다.
6. 같은 함정을 반복하되, 문장만 바꾸는 식의 얕은 변형은 금지한다.

시험공부 최적화 원칙:
- 이전에 틀린 지점을 정확히 겨냥한다.
- 사용자의 error_type을 반영해 출제한다:
  - concept_confusion: 비교형/구분형
  - missing_keyword: 빈칸형/단답형
  - reasoning_error: 사례 적용형
  - careless_mistake: 짧고 명확한 확인형
- 힌트는 정답을 직접 노출하지 않는 선에서 제공한다.

출력 규칙:
- 반드시 JSON만 출력한다.
- 필드:
  - question_type: multiple_choice | ox | short_answer | fill_blank | essay
  - question_text: 명확한 문제 문장
  - options: 객관식/OX인 경우만 제공
  - correct_answer: {"answer": "정답값"}
  - explanation: 해설
  - concept_key: 이전과 동일한 concept_key
  - targeted_error_type: 이번 재도전이 겨냥하는 오류 유형
  - hint: 힌트 (없으면 null)
  - similarity_safety_note: 이전 문항과 다른 이유 요약

similarity_safety_note 규칙:
- 이전 문항과 같은 문장 반복을 피했는지 여부를 짧게 쓴다.

절대 금지:
- 같은 문장 재사용
- 같은 유형 반복 남발
- JSON 외 텍스트 출력
"""


def build_retry_prompt(
    previous_question: str,
    previous_question_type: str,
    concept_key: str,
    concept_label: str,
    error_type: str,
    user_answer: str,
    correct_answer: str,
    previous_explanation: str,
    retry_count: int = 1,
) -> str:
    """Build a user prompt for retry quiz generation.

    Args:
        previous_question: The original question the user got wrong
        previous_question_type: Type of previous question
        concept_key: Concept key to focus on
        concept_label: Human-readable concept label
        error_type: Type of error (concept_confusion, missing_keyword, etc)
        user_answer: What the user answered
        correct_answer: What the correct answer was
        previous_explanation: Previous explanation shown to user
        retry_count: How many times has this been retried

    Returns:
        Formatted user prompt for the AI
    """
    hint_note = ""
    if retry_count > 1:
        hint_note = "\n- 이것은 재도전입니다. 명확한 힌트를 포함하세요 (정답을 직접 노출하지 말고)."

    new_type_instruction = ""
    if previous_question_type == "multiple_choice":
        new_type_instruction = (
            "\n- 가능하면 short_answer, fill_blank, 또는 ox 유형으로 바꾸세요."
        )
    elif previous_question_type == "short_answer":
        new_type_instruction = (
            "\n- 가능하면 fill_blank, ox, 또는 essay 유형으로 바꾸세요."
        )
    elif previous_question_type in ("fill_blank", "ox"):
        new_type_instruction = (
            "\n- 가능하면 multiple_choice 또는 short_answer 유형으로 바꾸세요."
        )

    error_instruction = ""
    if error_type == "concept_confusion":
        error_instruction = (
            "\n- 이 문제는 비슷한 개념 간 구분을 명확히 해야 합니다 (비교형 문제)."
        )
    elif error_type == "missing_keyword":
        error_instruction = "\n- 이 문제는 핵심어를 명시적으로 포함하도록 유도해야 합니다 (빈칸형/단답형)."
    elif error_type == "reasoning_error":
        error_instruction = (
            "\n- 이 문제는 개념의 실제 응용을 테스트합니다 (상황 적용형)."
        )
    elif error_type == "careless_mistake":
        error_instruction = "\n- 이 문제는 명확하고 간단명료해야 하며, 같은 실수를 반복하지 않도록 해야 합니다."

    return f"""같은 concept_key 기반으로 재도전 문제를 만드세요.

이전 문제 정보:
- 문제 유형: {previous_question_type}
- 개념: {concept_label} (concept_key: {concept_key})
- 오류 유형: {error_type}
- 사용자 답: {user_answer}
- 정답: {correct_answer}

이전 문제:
{previous_question}

요구사항:
- 이전과 다른 문장으로 새로운 각도에서 같은 개념을 테스트합니다
- 같은 보기나 문장 구조를 반복하지 않습니다{new_type_instruction}{error_instruction}{hint_note}

JSON 형식으로 응답하세요:
{{"question_type": "...", "question_text": "...", "options": null or {...}, "correct_answer": {{"answer": "..."}}, "explanation": "...", "concept_key": "{concept_key}", "targeted_error_type": "{error_type}", "hint": "...", "similarity_safety_note": "..."}}"""


def build_batch_retry_prompt(items: list[dict]) -> str:
    """Build a single batched prompt for multiple retry quiz generations.

    Args:
        items: list of dicts with keys:
            concept_key, concept_label, previous_question_type,
            previous_question, error_type, user_answer, correct_answer,
            retry_count
    """
    blocks = []
    for i, item in enumerate(items, 1):
        hint_note = ""
        if item.get("retry_count", 1) > 1:
            hint_note = "\n  - 이것은 재도전입니다. 명확한 힌트를 포함하세요 (정답 직접 노출 금지)."

        prev_type = item.get("previous_question_type", "")
        new_type_instruction = ""
        if prev_type == "multiple_choice":
            new_type_instruction = "\n  - 가능하면 short_answer, fill_blank, 또는 ox 유형으로 바꾸세요."
        elif prev_type == "short_answer":
            new_type_instruction = "\n  - 가능하면 fill_blank, ox, 또는 essay 유형으로 바꾸세요."
        elif prev_type in ("fill_blank", "ox"):
            new_type_instruction = "\n  - 가능하면 multiple_choice 또는 short_answer 유형으로 바꾸세요."

        error_type = item.get("error_type", "unknown")
        error_instruction = ""
        if error_type == "concept_confusion":
            error_instruction = "\n  - 비슷한 개념 간 구분을 명확히 해야 합니다 (비교형)."
        elif error_type == "missing_keyword":
            error_instruction = "\n  - 핵심어를 명시적으로 포함하도록 유도해야 합니다 (빈칸형/단답형)."
        elif error_type == "reasoning_error":
            error_instruction = "\n  - 개념의 실제 응용을 테스트합니다 (상황 적용형)."
        elif error_type == "careless_mistake":
            error_instruction = "\n  - 명확하고 간단명료해야 합니다."

        blocks.append(
            f"[문제 {i}]\n"
            f"- 개념: {item['concept_label']} (concept_key: {item['concept_key']})\n"
            f"- 이전 유형: {prev_type}\n"
            f"- 오류 유형: {error_type}\n"
            f"- 사용자 답: {item.get('user_answer', '')}\n"
            f"- 정답: {item.get('correct_answer', '')}\n"
            f"- 이전 문제: {item.get('previous_question', '')}\n"
            f"- 요구사항: 이전과 다른 문장과 각도로 같은 개념 테스트"
            f"{new_type_instruction}{error_instruction}{hint_note}"
        )

    return (
        f"아래 {len(items)}개의 concept_key 각각에 대해 재도전 문제를 만드세요.\n"
        f"questions 배열에 순서대로 {len(items)}개의 문제를 반환하세요.\n\n"
        + "\n\n".join(blocks)
    )
