"""Prompt for the pre-generation thinking phase (streamed model reasoning)."""

from __future__ import annotations

_MAX_THINKING_SOURCE_CHARS = 4000


SYSTEM_PROMPT_QUIZ_THINKING = """너는 학습자료로 퀴즈를 출제하기 직전, 어떤 개념을 어떻게 문제로 만들지 "소리 내어 생각하는" AI다.

## 목적
학습자가 네 사고 과정을 실시간으로 지켜본다. 문제를 실제로 내기 전에, 어떤 개념을 고를지와 그 이유를 짧게 드러내라.

## 출력 형식
- 3~6문장, 한국어 평문.
- 마크다운 헤더(#, ##), 코드 펜스, 불릿(-, •), 번호 매기기 금지.
- 사고의 흐름처럼 자연스럽게 써라.
  예: "이 자료의 핵심은 X구나. Y와 Z의 차이가 헷갈리기 쉬우니 여기를 건드려 봐야겠다..."
- 실제 문제나 선택지는 절대 작성하지 마라. 오직 출제 전략을 생각만 한다.
- 결론/요약 문구("이 정도로 출제하겠습니다" 등) 불필요. 생각을 그대로 끝낸다.

## 다룰 내용
1. 자료/주제의 핵심을 한 문장으로 파악.
2. 출제할 핵심 개념 2~4개를 구체적으로 언급.
3. 각 개념의 어떤 측면(정의/비교/인과/응용)을 다룰지.
4. 학습자가 혼동할 법한 포인트.

## 금지
- 자료에 없는 외부 지식으로 꾸며내지 마라. 자료에 기반해 생각해라.
- 자료 없이 생성 요청이면 주제 자체의 핵심 개념으로 생각해라.
- "~하도록 하겠습니다", "~입니다" 같은 격식체 금지. 사고의 흐름 그대로 자연스럽게.
- 서두에 "좋은 자료네요" 같은 평가 문구 금지. 바로 본론.
"""


def build_thinking_prompt(
    *,
    source_context: str,
    difficulty: str,
    question_types: list[str],
    is_no_source: bool,
    topic: str | None,
    question_count: int | None,
) -> str:
    display_difficulty = difficulty if difficulty != "auto" else "자동 선택"
    type_list = ", ".join(question_types) if question_types else "미지정"
    count_line = (
        f"문항 수: {question_count}개"
        if question_count
        else "문항 수: 자료 분량에 맞춰 자동 결정"
    )

    if is_no_source and topic:
        body = (
            f"주제: {topic}\n(자료 없음 — 주제 자체의 일반적 핵심 개념으로 생각해라.)"
        )
    elif is_no_source:
        body = "주제 미지정 + 자료 없음 — 학습자가 무엇을 원할지 잠깐 가늠한 뒤 일반적 기초 개념으로 생각해라."
    else:
        snippet = (source_context or "").strip()
        if len(snippet) > _MAX_THINKING_SOURCE_CHARS:
            snippet = snippet[:_MAX_THINKING_SOURCE_CHARS] + "\n...(자료 일부만 표시됨)"
        topic_line = f"참고 주제: {topic}\n" if topic else ""
        body = f"{topic_line}자료:\n{snippet}"

    return f"""{body}

{count_line}
문항 유형: {type_list}
난이도: {display_difficulty}

위 조건으로 퀴즈를 만들기 전에, 어떤 개념·각도로 문제를 낼지 3~6문장으로 소리 내어 생각해라."""
