"""Prompt template for expanding a user-supplied topic into a canonical
learning document.

Why a single canonical document?
  Each downstream study generator (summary, flashcards, mindmap, concept
  notes) calls the LLM independently. Without a shared source text, every
  call would draw freshly from model knowledge and diverge in scope, terms
  and depth. We pre-generate one document and feed all generators from it
  so they share a single source of truth, mirroring how uploaded files do.
"""

from typing import Literal, TypedDict


TopicDepth = Literal["brief", "standard", "deep"]


class _DepthSpec(TypedDict):
    label: str
    target_chars: str
    section_count: str
    max_tokens: int


_DEPTH_SPECS: dict[TopicDepth, _DepthSpec] = {
    "brief": {
        "label": "간단",
        "target_chars": "한국어 기준 1,200~1,800자 (영어는 600~900단어)",
        "section_count": "3~4개 섹션",
        "max_tokens": 3500,
    },
    "standard": {
        "label": "표준",
        "target_chars": "한국어 기준 3,500~5,000자 (영어는 1,800~2,500단어)",
        "section_count": "5~7개 섹션",
        "max_tokens": 7000,
    },
    "deep": {
        "label": "상세",
        "target_chars": "한국어 기준 7,000~9,500자 (영어는 3,500~4,800단어)",
        "section_count": "8~12개 섹션",
        "max_tokens": 12000,
    },
}


def normalize_depth(depth: str | None) -> TopicDepth:
    if depth == "brief" or depth == "standard" or depth == "deep":
        return depth
    return "standard"


def get_max_tokens(depth: TopicDepth) -> int:
    return _DEPTH_SPECS[depth]["max_tokens"]


TOPIC_EXPANSION_SYSTEM_MESSAGE = (
    "너는 학습자가 직접 입력한 주제를 깊이 있는 학습 자료로 풀어내는 전문 교재 저자다. "
    "이 자료는 이후 요약·플래시카드·마인드맵·암기노트 생성의 단일 원천(source of truth)으로 사용된다. "
    "따라서 모든 핵심 개념, 정의, 관계, 예시가 이 한 문서 안에 빠짐없이 들어 있어야 한다. "
    "마크다운만 사용하고, 코드 펜스(```)는 코드 예시일 때만 쓴다. JSON·메타 설명·서두 인사 금지."
)


_TEMPLATE = """주제: {topic}
요청 깊이: {depth_label} ({depth_value})

위 주제에 대한 **자기완결적인(self-contained) 학습 문서**를 마크다운으로 작성한다. 이 문서 한 편만 보고도 이후 단계(요약, 플래시카드, 마인드맵, 암기노트)에서 일관된 결과가 나와야 한다.

## 분량 및 구조
- 길이: {target_chars}.
- 섹션: {section_count}. 각 섹션은 `## 제목` 으로 시작하고, 필요한 경우 `### 하위 제목` 으로 분해한다. `####` 이상의 깊이는 사용하지 않는다.
- 도입부에서 이 주제의 정의를 1~2문장으로 명확히 진술한다.
- 마지막 섹션에는 핵심 정리(`## 핵심 정리`)를 두고, 5~10개의 핵심 포인트를 짧은 글머리 기호 목록으로 나열한다.

## 내용 요건
- **핵심 용어**(정의가 필요한 단어, 같은 용어가 두 번 이상 등장하는 단어)는 처음 등장할 때 **굵은 글씨**로 강조하고 바로 정의를 붙인다.
- 각 섹션은 다음 중 최소 하나를 포함한다: 정의, 분류/구성요소, 동작 원리/메커니즘, 사례/예시, 비교/대조, 한계나 흔한 오해.
- 추상적 설명에 그치지 말고 구체적 사례·수치·간단한 비유를 함께 제시한다.
- 사실관계가 모호하거나 시점에 따라 달라지는 정보(예: 최신 통계, 특정 인물의 현재 직책)는 단정하지 말고 "일반적으로", "대표적인 예로" 와 같이 신중하게 표현한다.

## 단일 원천 보장
- 후속 단계에서 이 문서만 보고 요약/플래시카드/마인드맵/개념노트를 만들 것이므로:
  - 해당 주제의 핵심 용어 10개 이상이 본문에 명시적으로 등장해야 한다.
  - 핵심 용어 사이의 관계(상위-하위, 인과, 비교)가 본문에서 명시적으로 서술되어야 한다.
  - 중요한 정의는 본문 안에 풀어 적고, "자세한 내용은 외부 자료 참고" 같은 회피 표현 금지.

## 스타일
- 한국어 입력이면 한국어로, 영어 입력이면 영어로 작성한다.
- 존댓말이 아닌 학습 교재 톤(담백한 평서문)으로 작성한다.
- 광고성 어투, 자기 언급("이 글에서는…"), 챗봇 인사말 금지.

## 출력 형식
- 마크다운 본문만 출력. 머리말("아래는…", "다음은…") 없이 바로 첫 `# {topic}` 제목으로 시작한다.
- JSON, 코드 펜스 래퍼, 메타 주석 금지.
"""


def build_topic_expansion_prompt(topic: str, depth: TopicDepth) -> str:
    spec = _DEPTH_SPECS[depth]
    return _TEMPLATE.format(
        topic=topic.strip(),
        depth_label=spec["label"],
        depth_value=depth,
        target_chars=spec["target_chars"],
        section_count=spec["section_count"],
    )
