"""
/study content-generation prompts, split by (item_type, difficulty).

v2 redesign rationale: v1 single-pass prompts caused gpt-5.4-mini to rely on the
safest generation path (copy a source sentence verbatim), especially in OX medium/hard O.
v2 splits per difficulty, uses positive-voice step procedures, and enforces quantitative
thresholds on source-text overlap. Design doc: .sisyphus/plans/study-items-v2-redesign.md

Exports (composed templates):
  STUDY_MCQ_{EASY,MEDIUM,HARD,MIXED}_PROMPT
  STUDY_OX_{EASY,MEDIUM,HARD,MIXED}_PROMPT
  STUDY_CLOZE_{EASY,MEDIUM,HARD,MIXED}_PROMPT
  STUDY_SHORT_ANSWER_{EASY,MEDIUM,HARD,MIXED}_PROMPT
  STUDY_FLASHCARD_PROMPT  (difficulty-agnostic per spec)

Helpers:
  get_study_prompt(item_type, difficulty) -> template string
  build_study_prompt(document_text, item_type, difficulty, count, language) -> rendered prompt
"""

STUDY_ITEMS_MODEL = "gemini-3.1-flash-lite-preview"


_SHARED_BASE = """[역할]
너는 학습 평가 설계 전문가다. 원문 근거·오개념 타깃·정량 기준에 따라 item 을 작성한다.

---

[입력 형식]

다음 4개 필드가 주어진다.
- document_text : 학습 자료 원문 (100~100,000자)
- difficulty    : 이 프롬프트에 고정됨 (각 프롬프트가 한 난이도만 담당)
- count         : 생성할 문항 수 (정수, 1~30)
- language      : "auto" | "ko" | "en"

language 처리:
- auto   → document_text 언어 감지 후 동일 언어로 출력
- ko / en → 지정 언어로 출력
- 혼합 문서 → 문자 수 50% 이상 언어를 주 언어로 선택
- 전문 용어는 원문 표기 유지 (번역 금지)

---

[공통 제약]

C1. 원문 근거 준수
  - 모든 정답·해설은 document_text 에 명시된 사실 또는 그로부터의 직접 추론에 기반한다.
  - source_span 은 document_text 에서 120자 이내로 직접 발췌한다.
  - 원문에 없는 고유명사·수치·연도·인명·학자명·예시·비유 생성 금지.

C2. 원문 문장 경계 인식
  - 작업 시작 시 document_text 를 마침표("." "。") 기준으로 문장으로 분할하여 S1, S2, S3, ...
    으로 라벨링한다고 생각하고 작업한다.
  - 각 item 의 근거가 어느 S_i 에 있는지 식별한 뒤 item 을 구성한다.

C3. 원문 연속 발췌 한도
  - 각 item 의 모든 필드(front·back·correct_answer·options[].text 등)는 document_text 의 어떤
    구간과도 15자 이상 연속 일치하지 않는다.
  - 조사·어미·쉼표·공백만 바꾼 경우도 연속 일치로 간주한다 ("~으로"→"~이며" 는 연속 일치다).
  - source_span 은 예외로 원문 인용 허용.

---

[공통 분기 처리]

| 상황 | 행동 |
|------|------|
| document_text 길이 < 100자 | 생성 중단. items=[], error="insufficient_source", message="원문이 최소 100자에 미달합니다". |
| document_text 길이 > 100,000자 | 앞부분 100,000자만 사용. 각 item source_span 앞에 "[truncated]" 접두 표기. |
| count > 30 | 생성 중단. items=[], error="count_exceeded", message="최대 30개까지 생성 가능합니다". |
| count 가 원문 capacity 초과 (원문 1,000자당 최대 5문항 기준) | 생성 가능한 최대 수만 생성. error="capacity_reduced", message="원문 분량 대비 최대 N개로 축소했습니다". |
| language 누락 | "auto" 적용. |
| count 누락 또는 0 | 5 적용. |
| 유형별 루브릭 실패 | 해당 item 재생성 1회. 재실패 시 items 에서 제외 (error 안 냄). |

---

[공통 금지 사항]

N1. JSON 바깥 텍스트, 마크다운 코드 펜스(```), preamble("다음은…"), 후기("위 JSON은…") 출력.
N2. 원문에 없는 정보를 확정적 사실로 제시 (문제·선지·해설 모두).
N3. 이중 부정 표현 ("…하지 않는 것은 아니다").
N4. 주관적·모호한 한정어 ("적절히·충분히·보통·대체로·가능하면") 사용.
N5. 문제 본문에 "자료에서 설명한·지문에 따르면·위 내용에서" 같은 자료 참조 수식어.
N6. 같은 문항을 여러 번 LLM 호출로 생성한다는 전제의 지시 (페어와이즈 랭킹 등). 단일 패스로 완결.

---

[공통 출력 원칙]

순수 JSON 객체만 출력한다. 최상위 스키마:

{{
  "items": [ /* Item 배열, 길이 = 실제 생성된 문항 수 */ ],
  "error": null | "insufficient_source" | "count_exceeded" | "capacity_reduced",
  "message": null | "한국어 사유 한 문장 (error 가 null 이 아닐 때만)"
}}

각 item 의 세부 스키마는 [유형별 규칙] 에서 정의한다.
null 값은 JSON null (문자열 "null" 이 아님) 으로 출력한다.
"""


_SHARED_TAIL = """
---

[작업 입력]

- document_text:
{document_text}

- difficulty : {difficulty}
- count      : {count}
- language   : {language}

위 입력을 기반으로, 모든 [공통 제약]·[공통 분기 처리]·[공통 금지 사항]·[유형별 규칙]을 준수하여 순수 JSON 객체를 생성한다.
"""


_MCQ_EASY = """
---

[유형별 규칙 — MCQ EASY]

이 프롬프트는 difficulty="easy" 의 MCQ 문항을 생성한다.

Item 스키마 (MCQ MEDIUM 과 동일하되 다음만 상이):
  "bloom_level": "Remember" | "Understand"
  "difficulty": "easy"
  front 길이: 15~80자 (easy 는 단순 정의·식별 수준)

---

[MCQ easy 작성 절차]

Step 1 : 원문의 핵심 개념 C 를 선택. C 의 정의·분류·명칭을 묻는다.
Step 2 (front) : 15~80자 의문문. "X 는 무엇인가?", "Y 에 해당하는 것은?" 형식 허용.
Step 3 (정답 선지) : C 의 정의 또는 이름을 10~30자로. front 와 4어절 연속 일치 금지.
Step 4 (오답 3개) :
  easy 는 ✅ 이웃 개념 (축 α) 과 ✅ 정반대 속성 (축 γ) 2축만 사용 가능.
  상·하위 혼동 (β), 부분·전체 (δ) 등은 easy 에 과도한 난이도이므로 사용 금지.
  각 오답이 자명하지 않도록 원문을 피상적으로 읽은 학습자가 실제로 고를 법한 선지로 구성.
Step 5 (선지 길이) : 10~30자 범위, 편차 최장의 30% 이내.
Step 6 (점검) : front-정답 독립성 + 부정쌍 없음.

---

[MCQ easy ✅ 예시]

원문: "CPU 가 프로세스에 할당되어 준비 상태에서 실행 상태로 전이되는 동작을 디스패치라 한다."

{{
  "item_type": "mcq",
  "front": "준비 상태의 프로세스가 CPU 를 받아 실행 상태로 옮겨가는 동작의 이름은?",
  "options": [
    {{"label": "A", "text": "컨텍스트 스위칭 — 상태 저장과 복원의 절차",
       "correct": false, "misconception_targeted": "디스패치와 컨텍스트 스위칭의 이웃 개념 혼동 (축 α)"}},
    {{"label": "B", "text": "디스패치 — 준비→실행 전이 동작",
       "correct": true, "misconception_targeted": null}},
    {{"label": "C", "text": "프리엠션 — CPU 자원을 회수하는 동작",
       "correct": false, "misconception_targeted": "전이 방향을 정반대로 인식 (축 γ)"}},
    {{"label": "D", "text": "블로킹 — 프로세스가 대기 상태로 들어가는 동작",
       "correct": false, "misconception_targeted": "상태 전이 방향 오인 (축 γ)"}}
  ],
  "correct_answer": "B",
  "bloom_level": "Remember",
  "difficulty": "easy",
  "source_span": "준비 상태에서 실행 상태로 전이되는 동작을 디스패치라 한다",
  "explanation": "원문은 준비→실행 전이를 디스패치로 정의하므로 B 가 정답이다. A 는 컨텍스트 스위칭과 혼동, C·D 는 상태 전이의 방향을 거꾸로 인식한 오개념이다. 상태 전이마다 고유한 용어가 배정된다는 것이 프로세스 상태 모델의 기저 원리다."
}}

---

[MCQ easy 최종 자기 점검]

(1) front 15~80자, 선지 10~30자
(2) 오답 3개가 축 α 또는 γ 중에서 선택됨
(3) front-정답 독립성 + 부정쌍 없음
(4) bloom_level ∈ {{Remember, Understand}}, difficulty = "easy"
"""


_MCQ_MEDIUM = """
---

[유형별 규칙 — MCQ MEDIUM (4지선다)]

이 프롬프트는 difficulty="medium" 의 MCQ 문항을 생성한다.

Item 스키마:

{{
  "item_type": "mcq",
  "front": "완결된 의문문 (15~120자, 지시대명사 '이것·그것·해당' 금지)",
  "options": [
    {{"label": "A", "text": "선지 (10~40자)", "correct": true|false,
       "misconception_targeted": "오답이면 오개념(10~60자), 정답이면 null"}},
    /* B, C, D — 정확히 4개, 각 10~40자 */
  ],
  "correct_answer": "A"|"B"|"C"|"D",
  "bloom_level": "Understand" | "Apply" | "Analyze",
  "difficulty": "medium",
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "3~6문장 해설"
}}

bloom_level 은 Understand/Apply/Analyze 중 하나.

---

[MCQ medium 작성 절차 — 6 Step 순차 실행]

Step 1 : 원문에서 핵심 개념 C 를 선택. C 의 정의·속성·인과 중 하나를 묻는 front 로 시작.

Step 2 (front) :
  front 는 15~120자 의문문. "C 란 무엇인가?" 같은 단순 정의 질문 대신
  "~의 이유는?", "~의 결과는?", "~의 차이는?", "~가 가능한 조건은?" 형식을 권장.
  자료 참조 수식어 ('자료에 따르면', '지문에서') 금지.

Step 3 (정답 선지 구성) :
  정답 text 를 10~40자 명사구로 작성. C 의 본질을 담되 front 와 4어절 이상 연속 일치 금지.
  ❌ front 에 '컨텍스트 스위칭을 PCB 저장·복원 과정으로 설명한 것은?' 이면
     정답 text 에 'PCB 저장·복원' 이 그대로 들어가면 안 된다 (front-정답 독립성 위반).

Step 4 (3개 오답 구성 — 4축 중 서로 다른 3축 타깃) :
  다음 4축 중 서로 다른 3축을 선택하여 각 오답이 1축의 오개념을 타깃한다.
    축 α : 이웃 개념 혼동      (예: 디스패치 vs 컨텍스트 스위칭)
    축 β : 상위/하위 개념 혼동 (예: 스레드 속성을 프로세스에 적용)
    축 γ : 정반대 속성         (예: 공유 vs 독립, 필수 vs 불필요)
    축 δ : 부분/전체 혼동      (예: PCB 의 일부 정보 ≠ 전체 저장·복원 절차)
  각 오답의 misconception_targeted 필드에 해당 축의 오개념을 10~60자로 명시.

Step 5 (선지 길이 균일화) :
  4개 선지 text 길이가 최장선지의 70% 이상이 되도록 조정.
  예: 최장 40자면 최단 28자 이상.
       최장 15자면 최단 10.5자 이상 → 짧은 선지에 원문 근거 한 문구 추가.
  특히 정답 선지가 짧으면 오답보다 짧아져 답이 노출되므로 주의.

Step 6 (front-정답 독립성 + 부정쌍 점검) :
  (a) front 의 핵심 개념구 (4어절 이상 실질형태소 연쇄) 가 정답 선지에 그대로 없는지 확인.
  (b) 4개 선지 중 어떤 2개도 "X 이다" vs "X 이 아니다·불필요·제거" 형태의 부정쌍이 아닌지 확인.

---

[MCQ medium 금지 사항]

- "위의 모든 것" / "모두 정답입니다" / "해당 없음" / "None of the above" 선지 금지.
- 정답에만 "반드시·핵심적으로·중요하게" 같은 강조어 사용 금지.
- "~만·모든·절대·항상·결코" 같은 극단 한정어를 오답에만 사용 금지.

---

[MCQ medium 해설 (explanation) 3부 구조, 3~6문장]

문장 1 (정답 근거, 20~80자)   : 원문 인용 또는 원리로 정답이 옳은 이유.
문장 2 (오답 오개념, 30~120자) : 3개 오답이 드러내는 오개념을 한 문장에 묶어 서술.
문장 3 (기저 원리, 20~60자)   : 일반화된 규칙 또는 개념 구분 기준.

---

[MCQ medium ✅ 예시]

원문:
  S1 "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다."
  S2 "덕분에 컨텍스트 스위칭 시 공유 자원의 메모리 맵 전환이 불필요하다."

{{
  "item_type": "mcq",
  "front": "스레드 간 컨텍스트 스위칭에서 프로세스 간 대비 절감되는 대표 비용 항목은 무엇인가?",
  "options": [
    {{"label": "A", "text": "공유 자원의 메모리 맵을 새로 구성하는 비용",
       "correct": true, "misconception_targeted": null}},
    {{"label": "B", "text": "스레드별 스택 프레임을 독립적으로 구성하는 비용",
       "correct": false, "misconception_targeted": "스택 독립 유지를 비용 절감 항목으로 오해 (축 γ)"}},
    {{"label": "C", "text": "프로세스 ID 와 스케줄링 정보의 신규 할당 비용",
       "correct": false, "misconception_targeted": "PCB 하위 정보를 스위칭 절감 항목으로 오해 (축 δ)"}},
    {{"label": "D", "text": "가상 메모리 정보 전체를 교체하는 비용",
       "correct": false, "misconception_targeted": "프로세스 간 스위칭 비용을 스레드 간으로 혼동 (축 α)"}}
  ],
  "correct_answer": "A",
  "bloom_level": "Understand",
  "difficulty": "medium",
  "source_span": "덕분에 컨텍스트 스위칭 시 공유 자원의 메모리 맵 전환이 불필요하다.",
  "explanation": "원문은 스레드가 공유 자원 (코드·데이터·힙) 을 함께 쓰므로 스위칭 시 맵 전환이 빠진다고 밝힌다. B·C·D 는 각각 독립 자원 (스택), PCB 하위 항목, 프로세스 간 비용을 잘못 대입한 오개념이다. 공유 범위가 전환 대상의 크기를 결정하는 것이 비용 차이의 기저 원리다."
}}

---

[MCQ medium 최종 자기 점검]

(1) 선지 개수 정확히 4개, correct=true 는 정확히 1개
(2) 모든 선지 text 길이 10~40자, 길이 편차가 최장선지의 30% 이내
(3) front 의 4어절 이상 연속 어구가 정답 선지에 없음
(4) 4개 선지 6쌍 중 부정쌍 없음
(5) 각 오답의 misconception_targeted 가 서로 다른 4축 중 3개를 타깃
(6) bloom_level ∈ {{Understand, Apply, Analyze}}, difficulty = "medium"
"""


_MCQ_HARD = """
---

[유형별 규칙 — MCQ HARD]

이 프롬프트는 difficulty="hard" 의 MCQ 문항을 생성한다.

Item 스키마는 MCQ MEDIUM 과 동일하되 다음 필드만 다르다:
  "bloom_level": "Apply" | "Analyze" | "Evaluate"
  "difficulty": "hard"
  "explanation": 4~6문장 (분석 깊이 확보)
  front 길이: 20~150자 (hard 는 조건·상황 설정이 필요한 경우가 많음)

bloom_level 은 Apply/Analyze/Evaluate 중 하나. Remember/Understand 는 hard 부적합.

---

[MCQ hard 작성 절차 — 6 Step, medium 과의 차이점 강조]

Step 1 : 원문에서 **2개 이상의 개념 또는 상호작용·trade-off** 을 포함하는 주제를 선택.
           단일 정의 암기 수준은 hard 부적합 (medium 으로).

Step 2 (front) :
  다음 중 하나의 형식을 권장:
    "상황 ~ 에서 ~ 가 일어나는 근본 이유는?" (인과 분석)
    "~ 와 ~ 의 trade-off 에서 ~ 를 선택하는 근거로 적절한 것은?" (평가)
    "두 조건 ~ 와 ~ 가 동시에 성립할 때 예상되는 결과는?" (적용)
  front 가 20~150자. 조건·상황을 명시적으로 설정해 고차 사고를 유도.

Step 3 (정답 선지) :
  정답 text 10~50자. 원리 또는 trade-off 의 본질을 담는다.
  front 와 4어절 이상 연속 일치 금지.

Step 4 (3개 오답 — medium 의 4축 + hard 전용 축 포함) :
  medium 의 4축 (α 이웃 개념 / β 상·하위 / γ 정반대 / δ 부분·전체) 에 더해
    축 ε : 조건 일반화 오류 — 원문이 특정 조건에만 적용되는 원리를 모든 조건에 적용했다고 오해
    축 ζ : 인과 역전      — 원문의 A → B 를 B → A 로 뒤집은 오개념
  중 서로 다른 3축을 타깃한다. misconception_targeted 는 10~80자로 명시.

Step 5 (선지 길이 균일화) : 길이 편차가 최장선지의 30% 이내. 최소 10자.

Step 6 (독립성 + 부정쌍 점검) : medium 과 동일.

---

[MCQ hard 금지 사항]

MCQ medium 의 금지 사항 전부 적용. 추가로:
- 단순 암기 수준 질문 ("X 의 약어는?", "Y 의 정의는?") 금지 — medium/cloze 로 내라.
- 원문에 명시되지 않은 외부 지식 (예: 특정 DB 구현체 세부사항) 요구 금지.

---

[MCQ hard 해설 (explanation) 3부 구조, 4~6문장]

문장 1-2 (정답 근거, 40~120자)   : 원문 인용 + 원리 연결.
문장 3 (오답 오개념, 40~120자)   : 3개 오답의 오개념을 한 문장으로 묶어 서술.
문장 4 (기저 trade-off/원리, 30~80자) : 결정 기준 또는 일반화된 원리.

---

[MCQ hard ✅ 예시]

원문:
  S1 "선점형 스케줄링은 운영체제가 실행 중인 프로세스를 강제로 중단시키고 CPU 를 재할당할 수 있다."
  S2 "비선점형은 프로세스가 자발적으로 CPU 를 반환할 때까지 기다린다."
  S3 "선점형은 응답성이 좋지만 컨텍스트 스위칭 비용이 증가하고, 비선점형은 처리량이 좋지만 긴 작업이 다른 작업을 지연시킨다."
  S4 "실시간 시스템은 마감 시간 준수가 필수이므로 선점형을 주로 사용한다."

{{
  "item_type": "mcq",
  "front": "응답성 민감도가 낮지만 평균 처리량 최대화가 목적인 배치 시스템에서 스케줄링 방식을 선택해야 할 때, 원문의 근거로 가장 타당한 선택과 그 이유는?",
  "options": [
    {{"label": "A", "text": "선점형 — 응답성 향상이 배치 시스템의 핵심 요구이므로",
       "correct": false, "misconception_targeted": "응답성이 배치 시스템의 핵심이라는 일반화 오류 (축 ε)"}},
    {{"label": "B", "text": "비선점형 — 처리량이 좋고 지연이 큰 긴 작업이 배치의 특성에 맞으므로",
       "correct": true, "misconception_targeted": null}},
    {{"label": "C", "text": "선점형 — 실시간 시스템과 배치 시스템은 마감 요구가 동일하므로",
       "correct": false, "misconception_targeted": "실시간과 배치의 마감 요구를 동일 취급 (축 β)"}},
    {{"label": "D", "text": "비선점형 — 컨텍스트 스위칭 비용 자체가 배치 처리량을 결정하므로",
       "correct": false, "misconception_targeted": "스위칭 비용과 처리량의 인과 역전 (축 ζ)"}}
  ],
  "correct_answer": "B",
  "bloom_level": "Evaluate",
  "difficulty": "hard",
  "source_span": "비선점형은 처리량이 좋지만 긴 작업이 다른 작업을 지연시킨다",
  "explanation": "원문 S3 은 비선점형의 장점으로 '처리량이 좋다' 를 명시하고 단점인 '긴 작업의 지연' 은 배치 환경에서 허용 범위이므로 B가 옳다. A 는 응답성을 배치 핵심으로 보는 일반화 오류이며, C 는 실시간·배치의 요구를 혼동하고, D 는 스위칭 비용이 처리량을 결정한다는 인과 역전이다. 정책 선택은 응답성·처리량·지연 허용도의 가중 비교로 판정해야 한다."
}}

---

[MCQ hard 최종 자기 점검]

(1) front 가 조건·상황을 명시적으로 설정 (단순 정의 질문 아님)
(2) 선지 길이 10~50자, 편차 30% 이내
(3) front-정답 독립성 + 부정쌍 없음
(4) 3개 오답이 서로 다른 3축 (α/β/γ/δ/ε/ζ 중) 타깃
(5) bloom_level ∈ {{Apply, Analyze, Evaluate}}, difficulty = "hard"
"""


_MCQ_MIXED = """
---

[유형별 규칙 — MCQ MIXED]

이 프롬프트는 difficulty="mixed" 의 MCQ 문항을 생성한다. count 개를 다음 분포로 섞는다:
  Remember (easy 수준)           : count × 20%
  Apply (medium 수준)             : count × 50%
  Analyze (medium/hard 경계)     : count × 20%
  Evaluate (hard 수준)           : count × 10%
정수 반올림은 상위 레벨부터. 각 item 의 difficulty 필드에 실제 난이도 (easy/medium/hard) 기록.

Item 스키마 및 작성 절차는 난이도별 규칙을 따른다:
  easy 수준   — MCQ EASY 규칙 (축 α, γ 만 사용, front 15~80자)
  medium 수준 — MCQ MEDIUM 규칙 (축 4개 α β γ δ, front 15~120자)
  hard 수준   — MCQ HARD 규칙 (축 6개 α β γ δ ε ζ, front 20~150자, 조건 설정)

공통 점검: 모든 선지 길이 10~50자, 편차 30% 이내, front-정답 독립성, 부정쌍 없음,
bloom_level 이 item 의 difficulty 허용 집합에 속함.
"""


_OX_EASY = """
---

[유형별 규칙 — OX EASY]

이 프롬프트는 오로지 difficulty="easy" 의 OX 문항을 생성한다.

Item 스키마:

{{
  "item_type": "ox",
  "front": "단정 서술문 1개 (20~100자, 이중 부정 금지)",
  "options": [
    {{"label": "O", "text": "참", "correct": true|false, "misconception_targeted": null}},
    {{"label": "X", "text": "거짓", "correct": true|false,
       "misconception_targeted": "거짓이 정답이면 반전 유형(10~80자), 아니면 null"}}
  ],
  "correct_answer": "O" | "X",
  "bloom_level": "Remember" | "Understand",
  "difficulty": "easy",
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "2~4문장 해설"
}}

bloom_level 은 Remember / Understand 중 하나.

---

[OX easy X (거짓이 정답) 작성 절차 — '표면 대립']

Step X-1 : 원문의 핵심 사실 한 가지를 선택 (예: "A 는 B 를 공유한다").
Step X-2 : 그 사실의 술어만 단순 반의어로 반전한 문장을 front 로 쓴다.
            ("공유↔독립", "있다↔없다", "증가↔감소", "가능↔불가능" 수준의 반전만 허용).
Step X-3 : 주어와 목적어는 원문 그대로 유지. 개념 교차나 함정은 사용 금지 (이건 medium/hard).
Step X-4 : 완성 문장이 원문과 15자 이상 연속 일치하지 않게 조사·어미를 바꾼다.

[OX easy X ✅ 예시]

원문: "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다."

✅ front: "스레드는 스택과 레지스터도 서로 공유한다."  (독립 → 공유 반전)
  correct_answer: "X"

---

[OX easy O (참이 정답) 작성 절차 — '구조 재서술']

Step O-1 : 원문 단일 문장에서 핵심 사실 1개를 선택.
Step O-2 : 그 사실을 자기 말로 재서술 (20~100자). 원문 구조를 바꾸되 사실 내용은 유지.
            easy O 는 단일 문장 재서술이 허용된다 (medium O 와의 차별점).
Step O-3 : 원문과 15자 이상 연속 일치 금지.

[OX easy O ✅ 예시]

같은 원문.

✅ front: "스레드끼리는 코드·데이터·힙 영역을 함께 사용한다."  (원문 재서술, 연속 일치 <15자)
  correct_answer: "O"

---

[OX easy 해설] explanation 2~4문장:
문장 1 원문 근거 / 문장 2 X 면 반전 유형, O 면 원문 매핑 / 문장 3 기저 개념 (선택)

---

[OX easy 최종 자기 점검]

(1) front 길이 20~100자, 이중 부정 없음
(2) X 정답이면 단순 반의어 반전만 사용 (개념 교차·함정 금지)
(3) front 와 원문의 15자 이상 연속 일치 없음
(4) bloom_level ∈ {{Remember, Understand}}, difficulty = "easy"
"""


_OX_MEDIUM = """
---

[유형별 규칙 — OX MEDIUM]

이 프롬프트는 오로지 difficulty="medium" 의 OX 문항을 생성한다.

Item 스키마:

{{
  "item_type": "ox",
  "front": "단정 서술문 1개 (20~120자, 이중 부정 금지)",
  "options": [
    {{"label": "O", "text": "참", "correct": true|false, "misconception_targeted": null}},
    {{"label": "X", "text": "거짓", "correct": true|false,
       "misconception_targeted": "거짓 선지가 정답이면 타깃 오개념(10~80자), 아니면 null"}}
  ],
  "correct_answer": "O" | "X",
  "bloom_level": "Understand" | "Apply" | "Analyze",
  "difficulty": "medium",
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "2~5문장 해설"
}}

bloom_level 은 Understand / Apply / Analyze 중 하나. Remember·Evaluate·Create 는 사용 금지.
O 선지와 X 선지 중 정확히 1개만 correct=true.

---

[OX medium X (거짓이 정답) 작성 절차 — '개념 교차' 패턴]

Step X-1 : 원문에서 서로 인접한 2개 개념 C_a, C_b 를 식별한다.
            인접 기준 — 둘 다 같은 단락 안에 있거나, 대비·비교 구조로 함께 등장한다.

Step X-2 : C_a 의 정의 D_a 와 C_b 의 정의 D_b 를 각각 한 문장으로 정리한다.

Step X-3 : D_a 와 D_b 의 정의·역할·속성을 서로 뒤바꾼 문장을 front 로 쓴다.
            "C_a 는 원래 D_a 다" 가 원문의 사실이라면, front 는 "C_a 는 D_b 다" 형태가 된다.

Step X-4 : 주어-술어 일관성 점검. front 의 주어 C_a 가 술어 D_b 를 가진 문장이 문법적으로
            성립하는지 확인. 비문이면 주어를 다른 개념으로 교체하지 말고 술어 표현만 교체한다.

[OX medium X ✅ 예시]

원문: "선점형 스케줄링은 운영체제가 실행 중인 프로세스를 강제로 중단시키고 CPU 를 재할당할 수 있다.
       비선점형은 프로세스가 자발적으로 CPU 를 반환할 때까지 기다린다."

✅ front: "선점형 스케줄링에서는 프로세스가 자발적으로 CPU 를 반환할 때까지 운영체제가 기다린다."
  correct_answer: "X"  (비선점형 정의를 선점형에 귀속 — 개념 교차)

---

[OX medium O (참이 정답) 작성 절차 — '서로 다른 2문장 합성']

이 절차는 v1 에서 가장 빈번히 실패한 영역이다. 원문 단일 문장 재서술은 easy 수준이므로 medium O 로
출제 금지. 반드시 아래 5 Step 을 엄격히 따른다.

Step O-1 : 원문 문장을 S1, S2, S3, ... 로 라벨링한다고 상상한다.
           (실제 출력에는 포함하지 않고 작업 메모로만 사용)

Step O-2 : 서로 다른 두 문장 S_i, S_j (i ≠ j) 를 선택한다.
           **같은 문장에서 두 사실을 뽑으면 easy 수준이며 medium O 로 부적합.**

Step O-3 : S_i 에서 핵심 사실 f_i (10~30자 명사구 또는 짧은 절), S_j 에서 핵심 사실 f_j 를
           각각 추출한다. f_i 와 f_j 는 서로 다른 개념을 다루어야 한다.

Step O-4 : f_i 와 f_j 를 다음 연결어 중 하나로 합쳐 1개 문장 (20~120자) 으로 만든다:
             - "그리고" / "-고"
             - "-지만" / "하지만"
             - "때문에" / "-므로"
             - "따라서" / "그래서"

Step O-5 : 완성 문장이 원문 S_i, S_j 중 어느 쪽과도 15자 이상 연속 일치하지 않는지 확인.
           일치 구간이 있으면 f_i 또는 f_j 의 표현을 동의어·구조 변환으로 교체한다.

[OX medium O ✅ 예시 2개]

원문:
  S1 "프로세스는 실행 중인 프로그램으로, 각자 독립된 코드·데이터·힙·스택을 가진다."
  S2 "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다."
  S3 "덕분에 컨텍스트 스위칭 시 공유 자원의 메모리 맵 전환이 불필요하다."
  S4 "반면 프로세스 간 컨텍스트 스위칭은 가상 메모리 정보 전체를 교체해야 한다."

✅ 예시 A (S2+S3, "-므로"):
  f_i = "스레드의 코드·데이터·힙 공유" (S2)
  f_j = "맵 전환 불필요" (S3)
  front: "스레드는 코드·데이터·힙을 공유하므로 스위칭 시 맵 전환이 필요 없다."

✅ 예시 B (S2+S4, "-지만"):
  f_i = "스레드는 힙까지 공유" (S2)
  f_j = "프로세스 간은 가상 메모리 전체 교체" (S4)
  front: "스레드는 힙까지 공유하지만, 프로세스 간 스위칭에서는 가상 메모리 전체가 교체된다."

❌ 금지 1 (단일 문장 재서술 — Step O-2 위반):
  "스레드는 한 프로세스 안에서 코드·데이터·힙을 공유한다." → S2 만 재서술, easy 수준.

❌ 금지 2 (15자 이상 연속 일치 — Step O-5 위반):
  "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하고..." → S2 와 22자 연속 일치.

---

[OX medium 해설] explanation 2~5문장:
문장 1 근거 / 문장 2 X 면 교차 유형·O 면 S_i+S_j 출처 / 문장 3 기저 원리 (20~60자)

---

[OX medium 최종 자기 점검]

문항 작성 후 다음을 모두 확인:
  (1) front 길이 20~120자, 이중 부정 없음
  (2) X 정답이면 개념 교차 패턴, O 정답이면 서로 다른 두 문장(S_i ≠ S_j)에서 추출
  (3) front 와 원문 S_i, S_j 어느 것과도 15자 이상 연속 일치 없음
  (4) bloom_level ∈ {{Understand, Apply, Analyze}}, difficulty = "medium"
  (5) O/X 중 정확히 1개만 correct=true
"""


_OX_HARD = """
---

[유형별 규칙 — OX HARD]

이 프롬프트는 오로지 difficulty="hard" 의 OX 문항을 생성한다.

Item 스키마:

{{
  "item_type": "ox",
  "front": "단정 서술문 1개 (20~150자, 이중 부정 금지)",
  "options": [
    {{"label": "O", "text": "참", "correct": true|false, "misconception_targeted": null}},
    {{"label": "X", "text": "거짓", "correct": true|false,
       "misconception_targeted": "거짓이 정답이면 함정 유형 명시(10~80자), 아니면 null"}}
  ],
  "correct_answer": "O" | "X",
  "bloom_level": "Apply" | "Analyze" | "Evaluate",
  "difficulty": "hard",
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "3~5문장 해설"
}}

bloom_level 은 Apply/Analyze/Evaluate 중 하나. Remember/Understand 는 hard 에 부적합.

---

[OX hard X (거짓이 정답) 작성 절차 — '함정' 2가지 중 택 1]

Type I : 상식 함정
  외부 상식·이름 추론으로는 참처럼 들리지만 원문 기준 거짓.
  예: "READ COMMITTED" 라는 이름만 보면 "커밋된 것만 읽으니 반복 조회도 고정되겠지" 라고
      착각되지만 원문은 Non-repeatable Read 발생을 명시.

Type II : 결합 판정
  원문의 2개 이상 문장을 결합해야만 참/거짓 판정이 가능. 한 문장만 보면 참처럼 보여야 한다.
  예: "SERIALIZABLE 은 이상 제거" 만 보면 "그럼 동시성도 유지되겠지" 오판이 가능하나,
      원문은 바로 "동시성 크게 저하" 를 함께 명시.

Step X-1 : Type I 또는 II 를 선택.
Step X-2 : Type I 이면 이름·통념 기반의 "당연한 참" 후보 문장을 작성 후 원문으로 반박.
            Type II 이면 서로 다른 두 문장 S_i, S_j 에서 각각 한 부분씩 뽑아 "한 쪽만 보면 참"
            이 되도록 문장을 만든 뒤, 다른 문장이 부정하는 구조로 만든다.
Step X-3 : 완성 문장이 원문과 15자 이상 연속 일치하지 않게 검증.

[OX hard X ✅ 예시]

원문:
  S1 "READ COMMITTED 는 커밋된 데이터만 읽지만 같은 쿼리의 결과가 달라지는 Non-repeatable Read 가 발생할 수 있다."
  S2 "SERIALIZABLE 은 모든 이상 현상을 제거하지만 동시성이 크게 저하된다."

✅ Type II 예시 (S2 두 부분 결합):
  front: "SERIALIZABLE 은 모든 이상 현상을 제거하면서 동시성 저하 없이 트랜잭션을 실행한다."
  correct_answer: "X"
  함정: S2 앞부분만 보면 참. 뒷부분 '동시성 크게 저하' 를 결합해야 거짓 판정.

---

[OX hard O (참이 정답) 작성 절차 — '반직관 참']

hard O 는 "일반 상식으로는 반직관적이거나 헷갈리지만 원문 기준 참" 문장이어야 한다.
'상식적으로 당연히 참' 은 medium 수준이므로 hard O 로 부적합.

Step O-1 : 원문에서 trade-off 또는 반직관 사실을 찾는다
            (예: 엄격할수록 동시성 하락, 응답성과 오버헤드의 교환 등).

Step O-2 : 그 trade-off 를 서로 다른 두 문장 S_i, S_j 에서 각각 1부분씩 뽑아 하나의 문장으로
            합친다 (medium O 와 같은 2문장 결합 원칙).

Step O-3 : 완성 문장이 원문 S_i, S_j 어느 쪽과도 15자 이상 연속 일치하지 않게 검증.

[OX hard O ✅ 예시]

같은 원문 (S1, S2 위 참고).

✅ 예시 (S2 내 두 측면을 trade-off 로 결합):
  front: "SERIALIZABLE 은 이상 현상을 완전 제거하는 대가로 동시성을 크게 희생한다."
  correct_answer: "O"
  (반직관성 : 엄격한 고립성이 '좋다' 라고 직관할 수 있으나 원문은 비용을 명시)

❌ 금지 1 (원문 15자 이상 연속 일치 — 복붙 수준):
  "REPEATABLE READ 는 같은 행의 반복 조회 결과를 보장하지만, 범위 쿼리에서 새 행이 추가되는 Phantom Read 는 발생할 수 있다."
  사유: 원문 S1 과 30자+ 연속 일치. hard O 가 아니라 hard 수준의 복붙 문제.

❌ 금지 2 (상식적으로 당연히 참):
  "SERIALIZABLE 은 동시성에 영향이 전혀 없다."
  사유: 이건 거짓이라 hard O 부적합 ; 또한 상식 해석 가능하므로 반직관성 없음.

---

[OX hard 해설] explanation 3~5문장:
문장 1 원문 근거 / 문장 2 Type I 또는 II 함정 유형 혹은 O 반직관 포인트 / 문장 3 기저 trade-off

---

[OX hard 최종 자기 점검]

(1) front 길이 20~150자, 이중 부정 없음
(2) X 정답이면 Type I 또는 II 함정 적용 ; O 정답이면 반직관+2문장 결합
(3) front 와 원문의 15자 이상 연속 일치 없음
(4) bloom_level ∈ {{Apply, Analyze, Evaluate}}, difficulty = "hard"
(5) O/X 중 정확히 1개만 correct=true
"""


_OX_MIXED = """
---

[유형별 규칙 — OX MIXED]

이 프롬프트는 difficulty="mixed" 의 OX 문항을 생성한다. count 개 문항을 다음 분포로 섞는다:
  Remember/Understand (easy 수준)   : count × 30%
  Understand/Apply (medium 수준)    : count × 50%
  Analyze/Evaluate (hard 수준)      : count × 20%
정수로 떨어지지 않으면 상위 난이도부터 반올림.

Item 스키마는 각 item 의 `difficulty` 필드에 해당 item 의 실제 난이도 (easy/medium/hard) 를 기록:

{{
  "item_type": "ox",
  "front": "단정 서술문 (20~150자)",
  "options": [
    {{"label": "O", "text": "참", "correct": true|false, "misconception_targeted": null}},
    {{"label": "X", "text": "거짓", "correct": true|false, "misconception_targeted": null 또는 문자열}}
  ],
  "correct_answer": "O" | "X",
  "bloom_level": "Remember"|"Understand"|"Apply"|"Analyze"|"Evaluate",
  "difficulty": "easy" | "medium" | "hard",
  "source_span": "120자 이내",
  "explanation": "2~5문장"
}}

각 난이도별 작성 절차는 다음을 따른다:
  easy   — 단순 반의어 반전 (X) / 단일 문장 재서술 (O)
  medium — 개념 교차 (X) / 서로 다른 2문장 결합 (O)  [S_i ≠ S_j 필수]
  hard   — 상식 함정 또는 결합 판정 (X) / 반직관적 참 (O)

공통 점검: front 와 원문의 15자 이상 연속 일치 없음. bloom_level 은 item 의 difficulty 허용 집합에 속함.
"""


_CLOZE_EASY = """
---

[유형별 규칙 — CLOZE EASY]

이 프롬프트는 difficulty="easy" 의 cloze 문항을 생성한다.

Item 스키마 (CLOZE MEDIUM 과 동일하되):
  "bloom_level": "Remember" | "Understand"
  "difficulty": "easy"
  front 길이: 15~100자

---

[CLOZE easy 작성 절차]

Step 1 (빈칸 대상) : 원문의 핵심 개념어 (용어·정의 대상의 명사) 1개.
  easy 는 빈칸 1개만 허용 (2개는 medium 이상).
Step 2 (원문 재구성 — 구체 절차) :
  (a) 원문 S 에서 빈칸 대상 T 를 제외한 나머지를 의미 단위로 분해.
  (b) 단위 순서를 바꾸거나 동의어 치환 후 [___] 배치.
  (c) 빈칸 제외 구간과 원문 S 를 글자 대조, 15자 이상 연속 일치 없음 검증.

  ❌ 원문 "Atomicity(원자성)는 트랜잭션 내 연산이 전부 반영되거나 전부 취소되어야 함을 의미한다"
     front: "[___]는 트랜잭션 내 연산이 전부 반영되거나 전부 취소되어야 함을 의미한다"
     (30자+ 연속 일치)
  ✅ front: "트랜잭션 연산이 전부 반영되거나 전부 취소되어야 하는 성질을 [___] 이라 한다"
     (어순 재배치 + "의미한다"→"이라 한다")
Step 3 (답 특정) : 답이 1개로 유일. 중의성 있으면 폐기.
Step 4 (acceptable_answers) : 원문 "A(B)" 병기 있으면 B 필수 포함.

---

[CLOZE easy ✅ 예시]

원문: "Atomicity(원자성)는 트랜잭션 내 연산이 전부 반영되거나 전부 취소되어야 함을 의미한다."

{{
  "item_type": "cloze",
  "front": "트랜잭션 연산이 전부 반영되거나 전부 취소되어야 하는 성질을 [___] 이라 한다.",
  "options": null,
  "correct_answer": "Atomicity",
  "acceptable_answers": ["원자성", "atomicity"],
  "bloom_level": "Remember",
  "difficulty": "easy",
  "source_span": "Atomicity(원자성)는 트랜잭션 내 연산이 전부 반영되거나 전부 취소되어야 함을 의미한다.",
  "explanation": "원문에서 '전부 반영 또는 전부 취소' 조건을 만족하는 성질의 이름은 Atomicity 다. 부분 결과가 남지 않게 하는 원자성이 ACID 의 A 에 해당한다."
}}

---

[CLOZE easy 최종 자기 점검]

(1) 빈칸 정확히 1개
(2) 빈칸 제외 구간과 원문 15자 이상 연속 일치 없음
(3) "A(B)" 병기 B 가 acceptable_answers 에 포함됨
(4) bloom_level ∈ {{Remember, Understand}}, difficulty = "easy"
"""


_CLOZE_MEDIUM = """
---

[유형별 규칙 — CLOZE MEDIUM (빈칸 채우기)]

이 프롬프트는 difficulty="medium" 의 cloze 문항을 생성한다.

Item 스키마:

{{
  "item_type": "cloze",
  "front": "빈칸 [___] 1~2개 포함 1문장 (20~120자)",
  "options": null,
  "correct_answer": "빈칸 정답 텍스트 (빈칸 2개면 '||' 로 구분)",
  "acceptable_answers": ["동의어·영문표기·약어 배열"],
  "bloom_level": "Understand" | "Apply",
  "difficulty": "medium",
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "2~4문장 해설"
}}

---

[CLOZE medium 작성 절차]

Step 1 (빈칸 대상 선정) :
  원문에서 핵심 개념어 (명사·용어·고유명사) 1~2개를 선택.
  금지 : 조사·수식어(형용사·부사)·흔한 동사·빈도부사 ("주로·자주·흔히·대개").
    ❌ "실시간 시스템은 선점형을 [___] 사용한다" (빈도부사 중의성)
    ✅ "CPU 가 준비→실행 전이되는 동작을 [___] 라 한다" (개념어)

Step 2 (원문 문장 재구성 — 복붙 방지, 구체 절차) :
  (a) 원문 S 에서 빈칸 대상 용어 T 를 식별.
  (b) S 에서 T 를 제외한 나머지 구간을 의미 단위로 분해 (예: [주어] / [조건] / [술어]).
  (c) 각 단위의 순서를 재배치하거나 동의어로 치환한 뒤, 빈칸 [___] 를 적절 위치에 배치.
  (d) 완성한 front 에서 빈칸 제외 구간과 원문 S 를 글자 단위로 겹쳐 15자 이상 연속 일치가
      없는지 검증. 있으면 (c) 로 돌아가 재치환·재배치.

  ❌ 원문 "CPU 가 프로세스에 할당되어 준비 상태에서 실행 상태로 전이되는 동작을 디스패치라 한다"
     front: "CPU 가 프로세스에 할당되어 준비 상태에서 실행 상태로 전이되는 동작을 [___] 라 한다"
     (빈칸 제외 구간이 원문과 30자+ 연속 일치 — 금지)
  ✅ front: "CPU 할당 후 준비에서 실행 상태로 옮겨가는 동작은 [___] 이다"
     (의미 단위 재배치 + "프로세스에 할당"→"할당 후", "전이되는 동작"→"옮겨가는 동작")

  ❌ 원문 "Consistency(일관성)는 트랜잭션 전후로 데이터베이스의 무결성 제약 조건이 유지됨을 의미한다"
     front: "[___]는 트랜잭션 전후로 데이터베이스의 무결성 제약 조건이 유지됨을 뜻한다"
     (뒷부분 "트랜잭션 전후로 ... 유지됨을" 30자+ 연속 일치 — 금지)
  ✅ front: "트랜잭션 전과 후 동일한 무결성 제약이 만족되는 ACID 성질은 [___] 이다"
     (어순 재배치 + "전후"→"전과 후", "유지"→"만족", "의미"→"성질")

Step 3 (답 중의성 점검) :
  원문에서 같은 조건을 만족하는 답이 2개 이상 존재하는지 검토. 존재하면 문맥 조건을 1~2개 추가해
  답을 1개로 특정한다. 여전히 2개 이상이면 해당 문항 폐기.

Step 4 (acceptable_answers 구성) :
  동의어·영문표기·줄임말만 포함. 대소문자·공백·조사 차이는 채점 측 처리 대상이므로 제외.
  **원문에 "A(B)" 또는 "A(B, ...)" 형태 병기가 있으면 B 를 반드시 포함한다.**
    예: 원문 "Atomicity(원자성)는 ..." + correct_answer="Atomicity"
        → acceptable_answers=["원자성"]  (B 필수)
    예: correct_answer="PCB", acceptable_answers=["Process Control Block", "프로세스 제어 블록"]
  동의어 없으면 [].

---

[CLOZE medium 금지 사항]

- 한 문장에 빈칸 3개 이상.
- 빈칸 위치가 문장 맨 앞 또는 맨 뒤여서 맥락 유추 불가능한 형태.
- 원문에 없는 개념을 빈칸 정답으로 출제.
- 빈칸 제외 구간이 원문 15자 이상 연속 일치 (M2 위반).

---

[CLOZE medium 해설 (explanation) 2~4문장]

문장 1 (답 특정 근거, 30~80자) : 원문 인용 또는 원리로 답이 특정되는 이유.
문장 2 (기저 원리·인접 개념 구분, 20~60자).

---

[CLOZE medium ✅ 예시]

원문:
  "컨텍스트 스위칭은 CPU 가 현재 프로세스의 상태를 PCB 에 저장하고 다음 프로세스의 상태를 PCB 에서 복원하는 과정이다."
  "PCB (Process Control Block) 에는 프로세스 ID, 레지스터 값, 메모리 정보가 저장된다."

{{
  "item_type": "cloze",
  "front": "컨텍스트 스위칭 중 저장·복원의 매체로 사용되는 자료구조는 [___] 이다.",
  "options": null,
  "correct_answer": "PCB",
  "acceptable_answers": ["Process Control Block", "프로세스 제어 블록"],
  "bloom_level": "Understand",
  "difficulty": "medium",
  "source_span": "컨텍스트 스위칭은 CPU 가 현재 프로세스의 상태를 PCB 에 저장하고 다음 프로세스의 상태를 PCB 에서 복원하는 과정이다.",
  "explanation": "원문은 저장·복원의 매체를 PCB 로 명시하므로 빈칸이 특정된다. PCB 에는 ID·레지스터·메모리 정보가 함께 저장되는 것이 컨텍스트 스위칭의 매개 자료구조로 기능하는 이유다."
}}

---

[CLOZE medium 최종 자기 점검]

(1) 빈칸 1~2개, 정답이 개념어 (조사·부사 아님)
(2) 빈칸 제외 구간이 원문과 15자 이상 연속 일치 없음
(3) 원문에 "A(B)" 병기가 있으면 B 가 acceptable_answers 에 포함됨
(4) 답이 유일하게 특정됨 (중의성 없음)
(5) bloom_level ∈ {{Understand, Apply}}, difficulty = "medium"
"""


_CLOZE_HARD = """
---

[유형별 규칙 — CLOZE HARD]

이 프롬프트는 difficulty="hard" 의 cloze 문항을 생성한다.

Item 스키마 (CLOZE MEDIUM 과 동일하되):
  "bloom_level": "Apply" | "Analyze"
  "difficulty": "hard"
  front 길이: 30~150자 (맥락·조건 명시)

---

[CLOZE hard 작성 절차]

Step 1 (빈칸 대상) : 단순 용어 암기 수준은 hard 부적합. 다음 중 하나를 빈칸 처리:
  - 원리·인과 관계의 핵심어 (예: trade-off 의 이름, 현상 유발 조건명)
  - 조건부로만 특정되는 개념어 (맥락이 필요한 답)
Step 2 (원문 재구성 + 맥락 추가) :
  서로 다른 2개 문장 S_i, S_j 에서 맥락을 합성해 front 를 작성한다. 한 문장에서 빈칸 뽑지 말 것.
  (a) S_i 의 조건, S_j 의 결과를 뽑아 1문장으로 연결. (b) 빈칸 [___] 배치.
  (c) 빈칸 제외 구간과 S_i, S_j 각각을 글자 대조, 15자 이상 연속 일치 없음 검증.
  일치 발견 시 동의어 치환·순서 재배치로 교체 후 재검증.
Step 3 (답 특정 + 중의성 제거) : 답이 S_i 와 S_j 의 결합 맥락에서만 유일하게 특정되어야 한다.
  단일 문장 맥락으로도 답이 나오면 medium 이므로 hard 부적합.
Step 4 (acceptable_answers) : 원문 병기 B 필수 포함.

---

[CLOZE hard ✅ 예시]

원문:
  S1 "REPEATABLE READ 는 같은 행의 반복 조회 결과를 보장하지만, 범위 쿼리에서 새 행이 추가되는 Phantom Read 는 여전히 발생할 수 있다."
  S2 "SERIALIZABLE 은 모든 이상 현상을 제거하지만 동시성이 크게 저하된다."

{{
  "item_type": "cloze",
  "front": "같은 행 반복 조회는 고정되지만 범위 쿼리에서 새 행이 끼어드는 이상 현상이 남는 고립성 수준은 [___] 이다.",
  "options": null,
  "correct_answer": "REPEATABLE READ",
  "acceptable_answers": ["Repeatable Read", "반복 읽기"],
  "bloom_level": "Analyze",
  "difficulty": "hard",
  "source_span": "REPEATABLE READ 는 같은 행의 반복 조회 결과를 보장하지만, 범위 쿼리에서 새 행이 추가되는 Phantom Read 는 여전히 발생할 수 있다.",
  "explanation": "원문 S1 은 REPEATABLE READ 에서 Phantom Read 가 발생한다고 명시한다. 같은 행 보장과 범위 쿼리의 행 추가 허용이 공존하는 수준이 해당 고립성 수준이다. 이상 현상 제거 범위가 고립성 수준 구분의 핵심이다."
}}

---

[CLOZE hard 최종 자기 점검]

(1) 빈칸 1~2개, 정답이 단순 용어가 아닌 맥락 기반 개념어
(2) front 가 원문 2개 문장에서 맥락을 합성
(3) 빈칸 제외 구간과 원문 15자 이상 연속 일치 없음
(4) 답이 결합 맥락에서만 유일하게 특정됨
(5) bloom_level ∈ {{Apply, Analyze}}, difficulty = "hard"
"""


_CLOZE_MIXED = """
---

[유형별 규칙 — CLOZE MIXED]

이 프롬프트는 difficulty="mixed" 의 cloze 문항을 생성한다. count 개를 다음 분포로 섞는다:
  easy   (Remember/Understand)   : count × 40%
  medium (Understand/Apply)       : count × 40%
  hard   (Apply/Analyze)          : count × 20%
정수 반올림은 상위 레벨부터. 각 item 의 `difficulty` 필드에 실제 난이도 기록.

각 난이도별 작성 절차는 해당 난이도 전용 프롬프트와 동일:
  easy   — 빈칸 1개, 단일 문장 재구성
  medium — 빈칸 1~2개, 단일 또는 2문장 재구성
  hard   — 빈칸 1~2개, 2문장 맥락 결합 필수

공통: 빈칸 제외 구간이 원문과 15자 이상 연속 일치 없음. "A(B)" 병기 시 B 가 acceptable_answers 에 포함.
"""


_SA_EASY = """
---

[유형별 규칙 — SHORT_ANSWER EASY]

이 프롬프트는 difficulty="easy" 의 short_answer 문항을 생성한다.

Item 스키마 (SA MEDIUM 과 동일하되):
  "bloom_level": "Understand"
  "difficulty": "easy"
  front 길이 : 15~80자
  correct_answer 길이 : 20~150자
  explanation : 2~4문장

---

[SA easy 작성 절차]

Step 1 (질문 형태) : 단순 설명·서술 유형. 여전히 단어 1~2개 답은 cloze 로 돌려야 한다.
  ✅ "~의 구성 요소를 나열하며 설명하시오"
  ✅ "~의 기본 원리를 서술하시오"
  ❌ "~의 약어는?" (→ cloze)

Step 2 (모범 답안) : 20~150자, 1~2문장. 원문 사실을 자기 말로 서술.

Step 3 (원문 복붙 점검) :
  correct_answer 작성 후 원문과 글자 대조. 15자 이상 연속 일치 구간 발견 시 동의어 치환 /
  순서 재배치 / 요약 압축 중 하나로 교체. 교체 후 재검증.

Step 4 (key_points) : 2~4개, 각 15자 이내.

---

[SA easy ✅ 예시]

원문: "PCB (Process Control Block) 는 운영체제가 각 프로세스의 상태를 관리하기 위해 유지하는 자료구조로, 프로세스 ID, 레지스터 값, 메모리 정보, 스케줄링 정보를 포함한다."

{{
  "item_type": "short_answer",
  "front": "PCB 가 보유하는 정보 네 가지를 나열하며 역할을 설명하시오.",
  "options": null,
  "correct_answer": "PCB 는 각 프로세스의 상태를 운영체제가 추적하기 위해 유지하는 자료구조다. 저장 항목은 프로세스 ID, 레지스터 값, 메모리 정보, 스케줄링 정보의 네 가지다.",
  "key_points": ["프로세스 ID", "레지스터 값", "메모리 정보", "스케줄링 정보"],
  "bloom_level": "Understand",
  "difficulty": "easy",
  "source_span": "PCB 는 운영체제가 각 프로세스의 상태를 관리하기 위해 유지하는 자료구조로, 프로세스 ID, 레지스터 값, 메모리 정보, 스케줄링 정보를 포함한다.",
  "explanation": "원문이 PCB 에 포함되는 네 정보를 명시하므로 답안은 이 네 항목을 정확히 나열해야 한다. PCB 는 프로세스 상태 관리의 중앙 자료구조 역할을 한다."
}}

---

[SA easy 최종 자기 점검]

(1) front 15~80자, 설명·나열 요구
(2) correct_answer 20~150자
(3) 원문 15자 이상 연속 일치 없음
(4) key_points 2~4개, 각 15자 이내
(5) bloom_level = "Understand", difficulty = "easy"
"""


_SA_MEDIUM = """
---

[유형별 규칙 — SHORT_ANSWER MEDIUM]

이 프롬프트는 difficulty="medium" 의 short_answer 문항을 생성한다.

Item 스키마:

{{
  "item_type": "short_answer",
  "front": "완결된 의문문 (빈칸 없음, 20~120자)",
  "options": null,
  "correct_answer": "모범 답안 (30~220자, 1~3문장)",
  "key_points": ["채점 핵심 2~5개, 각 15자 이내(영문 전문용어 포함 시 25자까지)"],
  "bloom_level": "Understand" | "Apply" | "Analyze",
  "difficulty": "medium",
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "3~5문장 해설"
}}

bloom_level 은 Understand/Apply/Analyze 중 하나.

---

[SA medium 작성 절차]

Step 1 (질문 형태) : 분석·비교·과정·인과를 요구하는 의문문. 단어 1~2개 답은 cloze 로 돌려라.
  ✅ 허용 형태:
    "~의 이유를 설명하시오"
    "~의 과정을 단계별로 서술하시오"
    "~와 ~의 차이를 비교하시오"
    "~이 ~에 미치는 영향을 분석하시오"
  ❌ 금지 형태:
    "프로세스 제어 블록의 약어는?"  (→ cloze)
    "CPU 할당 대기 상태의 이름은?" (→ cloze)

Step 2 (모범 답안) :
  30~220자, 1~3문장으로 완결. 원문 명시 사실·원리만 사용 (외부 지식 추가 금지).
  단, 원문을 그대로 복붙하지 않는다 — 사실을 통합·요약·구조화한 서술.

Step 3 (key_points 구성) :
  2~5개 핵심 개념 추출. 각 항목은 한글 기준 15자 이내 명사구 또는 짧은 구문.
  영문 전문용어를 포함하는 항목은 25자까지 허용 (예: "Non-repeatable Read 발생").
  모범 답안에 포함된 개념만 key_points 로 삼는다.

Step 4 (원문 복붙 점검 — 글자 대조 절차) :
  (a) correct_answer 를 완성한 직후, 원문 S_i 와 글자 단위로 겹쳐본다.
  (b) 15자 이상 연속 일치 구간 [L, R] 을 식별. ("띄어쓰기만 차이" 도 연속 일치로 간주)
  (c) 일치 구간 발견 시 다음 중 하나를 해당 구간에 적용:
      - 동의어 치환  : "중단시키다"→"멈추다"·"정지시키다", "재할당"→"재배분"·"다시 배정",
                        "의미한다"→"뜻한다"·"가리킨다", "유지"→"보존"·"지속"
      - 순서 재배치  : "A 가 B 를 C 한다" → "C 되는 B 의 주체는 A" 또는 "B 는 A 에 의해 C 된다"
      - 요약 압축    : 해당 구간을 원래 길이의 50% 이하로 축약
  (d) 교체 후 (a) 로 돌아가 다시 대조. 2회 연속 일치 해소 못하면 문장 전체 재작성.

---

[SA medium 금지 사항]

- 원문 한 문장 복붙 수준의 단순 정의 질문.
- 답이 1~2 단어로 끝나는 질문.
- 여러 개의 독립 질문을 한 문항에 묶기 ("A 를 설명하고, 또한 B 와 C 도 비교하시오").

---

[SA medium 해설 (explanation) 3~5문장]

문장 1 (원문 근거, 30~80자)
문장 2 (key_points 가 채점 기준인 이유, 30~80자)
문장 3 (기저 원리 또는 개념 구분, 20~60자)

---

[SA medium ✅ 예시]

원문:
  S2 "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다."
  S3 "덕분에 컨텍스트 스위칭 시 공유 자원의 메모리 맵 전환이 불필요하다."
  S4 "반면 프로세스 간 컨텍스트 스위칭은 가상 메모리 정보 전체를 교체해야 한다."

{{
  "item_type": "short_answer",
  "front": "스레드 간 컨텍스트 스위칭 비용이 프로세스 간보다 낮은 이유를 설명하시오.",
  "options": null,
  "correct_answer": "스레드는 같은 프로세스 내에서 코드·데이터·힙을 함께 쓰므로 스위칭 시 공유 자원의 메모리 맵을 갈아끼울 필요가 없다. 반면 프로세스 간 스위칭은 가상 메모리 정보 전체를 교체해야 하므로 더 큰 비용이 든다.",
  "key_points": ["공유 자원 유지", "메모리 맵 전환 불필요", "가상 메모리 교체 필요"],
  "bloom_level": "Analyze",
  "difficulty": "medium",
  "source_span": "덕분에 컨텍스트 스위칭 시 공유 자원의 메모리 맵 전환이 불필요하다.",
  "explanation": "원문은 스레드의 공유 구조와 프로세스 간 가상 메모리 전환을 대비해 서술한다. 답안은 공유/전환 비용의 양쪽을 모두 포함해야 하므로 key_points 도 이 두 축을 중심으로 구성된다. 자원 공유 범위가 스위칭 비용을 결정하는 것이 기저 원리다."
}}

---

[SA medium 최종 자기 점검]

(1) front 20~120자, 분석·비교·인과 의문문 (단어 1~2개 답 금지)
(2) correct_answer 30~220자, 1~3문장
(3) correct_answer 와 원문의 15자 이상 연속 일치 없음
(4) key_points 2~5개, 각 한글 15자 / 영문 포함 25자 이내
(5) bloom_level ∈ {{Understand, Apply, Analyze}}, difficulty = "medium"
"""


_SA_HARD = """
---

[유형별 규칙 — SHORT_ANSWER HARD]

이 프롬프트는 difficulty="hard" 의 short_answer 문항을 생성한다.

Item 스키마 (SA MEDIUM 과 동일하되):
  "bloom_level": "Analyze" | "Evaluate" | "Create"
  "difficulty": "hard"
  front 길이 : 30~150자 (조건·상황 설정 필수)
  correct_answer 길이 : 50~250자 (더 깊은 분석 서술)
  explanation : 4~5문장

---

[SA hard 작성 절차]

Step 1 (질문 형태) : 평가·비판·설계·고차 적용 유형 중 하나.
  ✅ 허용 형태:
    "~ 상황에서 ~ 를 선택하는 근거를 분석·평가하시오"
    "~ 와 ~ 의 trade-off 관점에서 ~ 를 정당화하시오"
    "만약 ~ 조건이 바뀐다면 ~ 에 어떤 영향을 주는지 추론하시오"
    "원문의 ~ 원리를 새로운 상황 ~ 에 어떻게 적용할 수 있는지 설명하시오"

Step 2 (모범 답안) :
  50~250자, 2~3문장. trade-off, 조건부 결론, 원리 일반화 중 하나를 반드시 포함.
  원문 사실에 기반하되 원문 범위 밖 상황에 대한 추론은 원문 원리 연장선에서만.

Step 3 (key_points) : 3~5개, 각 15자(영문 25자) 이내. 고차 분석 요소를 포함.

Step 4 (원문 복붙 점검 — 글자 대조) :
  correct_answer 작성 후 원문과 글자 단위 대조. 15자 이상 연속 일치 구간 발견 시
  동의어 치환·순서 재배치·요약 압축 중 하나를 적용 후 재검증.
  hard 는 답안이 길어 (50~250자) 복붙 위험이 큼 — 특히 원문의 "응답성↔처리량" 같은 trade-off
  표현을 그대로 인용하지 않고 "반응 속도↔처리량", "~의 대가" 등으로 재표현한다.

---

[SA hard ✅ 예시]

원문:
  S3 "선점형은 응답성이 좋지만 컨텍스트 스위칭 비용이 증가하고, 비선점형은 처리량이 좋지만 긴 작업이 다른 작업을 지연시킨다."
  S4 "실시간 시스템은 마감 시간 준수가 필수이므로 선점형을 주로 사용한다."

{{
  "item_type": "short_answer",
  "front": "실시간 시스템의 특성이 '응답성보다 긴 처리량 최대화' 로 전환된다면 원문 근거로 스케줄링 정책 선택이 어떻게 달라질지 분석하시오.",
  "options": null,
  "correct_answer": "원문은 실시간의 마감 요구를 선점형 선택의 근거로 제시한다. 요구가 '처리량 최대화' 로 바뀌면 비선점형의 장점(높은 처리량)이 우세해진다. 긴 작업의 지연 위험은 감수 대상이 되며, 선점의 응답성 이득보다 스위칭 비용 절감이 중요해지므로 비선점형 선택이 합리적이다.",
  "key_points": ["원문 근거 전환", "처리량 우위", "긴 작업 지연 감수", "스위칭 비용 절감 가치"],
  "bloom_level": "Evaluate",
  "difficulty": "hard",
  "source_span": "실시간 시스템은 마감 시간 준수가 필수이므로 선점형을 주로 사용한다",
  "explanation": "원문은 스케줄링 정책 선택의 근거로 시스템의 시간 요구를 제시한다. 요구가 바뀌면 원문의 원리 (응답성 vs 처리량의 교환) 를 새 상황에 적용해 결론이 뒤집힌다. key_points 는 원문 근거·처리량 우위·감수 대상·가치 전환의 네 축을 포함해야 한다. 정책 선택은 요구 조건과 trade-off 특성의 매핑으로 결정된다."
}}

---

[SA hard 최종 자기 점검]

(1) front 30~150자, 조건·상황·가정 설정 포함
(2) correct_answer 50~250자, trade-off 또는 원리 일반화 포함
(3) 원문 15자 이상 연속 일치 없음
(4) key_points 3~5개, 분석·평가 요소 포함
(5) bloom_level ∈ {{Analyze, Evaluate, Create}}, difficulty = "hard"
"""


_SA_MIXED = """
---

[유형별 규칙 — SHORT_ANSWER MIXED]

이 프롬프트는 difficulty="mixed" 의 SA 문항을 생성한다. count 개를 다음 분포로 섞는다:
  easy   (Understand)                : count × 20%
  medium (Understand/Apply/Analyze)   : count × 60%
  hard   (Analyze/Evaluate/Create)    : count × 20%
정수 반올림은 상위 레벨부터. 각 item 의 difficulty 필드에 실제 난이도 기록.

각 난이도별 작성 절차는 해당 전용 프롬프트와 동일:
  easy   — 설명·나열, correct_answer 20~150자
  medium — 분석·비교·인과, correct_answer 30~220자
  hard   — 평가·설계·고차 적용, correct_answer 50~250자

공통: correct_answer 와 원문 15자 이상 연속 일치 없음. key_points 각 15자 (영문 25자) 이내.
"""


_FLASHCARD = """
---

[유형별 규칙 — FLASHCARD (플래시카드)]

Item 스키마:

{{
  "item_type": "flashcard",
  "front": "질문 문장 (15~40자, 반드시 물음표로 끝남)",
  "back": "답·설명 (30~150자, 1~2문장. 원문 구조와 다르게 재구성)",
  "options": null,
  "correct_answer": null,
  "bloom_level": null,
  "difficulty": null,
  "source_span": "원문 직접 발췌 (120자 이내)",
  "explanation": "카드의 학습 포인트 (0~80자) 또는 ''"
}}

[flashcard 카드 유형 5종 — 세트 내 다양성 확보]

1. 정의형 : "X 란 무엇인가?"        → 핵심 정의
2. 개념형 : "X 의 핵심 특징은?"     → 속성 나열
3. 비교형 : "X 와 Y 의 차이는?"     → 대비 구조 (A vs B)
4. 절차형 : "X 의 단계는?"          → 순서형 (A → B → C)
5. 적용형 : "X 가 Y 에 쓰이는 이유는?" → 인과 관계

count >= 5 일 때 각 유형 최소 1개 포함.

[flashcard 작성 절차 — 각 카드마다 이 4 Step 을 순서대로 실행]

Step 1 (front 설계) :
  원문에서 개념 C 를 선택. front 를 15~40자 질문으로. 9~14자 단답형은 수식어 추가, 복합 주제는 압축.
    ❌ "ACID 의 A 는?" (9자)    ✅ "ACID 중 Atomicity 가 뜻하는 바는?" (20자)
    ❌ "프로세스와 스레드의 메모리 자원 관리 방식은 어떻게 다른가?" (31자, 축약 가능)
    ✅ "프로세스와 스레드의 자원 소유 차이는?" (19자)

Step 2 (mental close) :
  원문에서 C 의 설명을 1회 읽고, 원문을 의식에서 내려놓는다고 생각한다.
  그 후 기억에 의존해 C 의 핵심을 자기 언어로 30~150자 back 으로 재구성한다.
  "원문 인용" 이 아니라 "원문 이해를 요약한 설명" 을 작성한다.

Step 3 (12자 연속 일치 점검 — 글자 대조 절차) :
  (a) 작성한 back 을 1글자씩 원문과 슬라이딩 윈도우로 대조한다 ("띄어쓰기만 차이" 도 일치로 간주).
  (b) 연속 12자 이상 일치 구간 [L, R] 을 모두 식별.
  (c) 각 일치 구간에 다음 중 하나를 적용:
    - 동의어 치환       — "의미한다"→"뜻한다"·"가리킨다", "포함한다"→"담는다",
                          "중단시키다"→"멈추다", "재할당"→"재배분"
    - 구조 변환 (A → B) — "X 는 Y 이다" → "X : Y" 또는 "X = Y"
    - 순서 재배치       — "A 가 B 한다" → "B 의 수행 주체는 A"
    - 요약 압축         — 해당 구간을 원래 길이의 50% 이하로 단축
  (d) 교체 후 (a) 로 돌아가 재검증. 2회 반복해도 해소 안 되면 카드 폐기.

Step 4 (유형 다양화 점검) :
  세트 내 앞서 작성한 카드들과 front 핵심 명사가 중복되지 않는지 확인. 중복 시 유형 (M1 5종)
  을 다른 것으로 바꾼다.

[flashcard 예시 — 3개 ✅ + 1개 ❌]

원문:
  S1 "프로세스는 실행 중인 프로그램으로, 각자 독립된 코드·데이터·힙·스택을 가진다."
  S2 "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다."
  S3 "컨텍스트 스위칭은 CPU 가 현재 프로세스의 상태를 PCB 에 저장하고 다음 프로세스의 상태를 PCB 에서 복원하는 과정이다."

✅ 예시 1 (정의형, S1 근거, Step 3(d) 요약 압축 적용):
{{
  "item_type": "flashcard",
  "front": "프로세스를 구성하는 독립 자원 4가지는?",
  "back": "각 프로세스는 코드·데이터·힙·스택을 독립적으로 소유한다. 이 네 영역이 한 실행 단위의 자원 경계를 이룬다.",
  "options": null, "correct_answer": null, "bloom_level": null, "difficulty": null,
  "source_span": "프로세스는 실행 중인 프로그램으로, 각자 독립된 코드·데이터·힙·스택을 가진다.",
  "explanation": "프로세스 자원 경계의 네 구성 요소를 기억하는 정의형 카드."
}}

✅ 예시 2 (비교형, S2 근거, Step 3(b) 구조 변환 A vs B):
{{
  "item_type": "flashcard",
  "front": "스레드의 공유 자원과 독립 자원의 경계는?",
  "back": "공유 : 코드·데이터·힙. 독립 : 스택·레지스터. 공유가 동기화 비용을 만들고, 독립이 스위칭 가속을 만든다.",
  "options": null, "correct_answer": null, "bloom_level": null, "difficulty": null,
  "source_span": "스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다.",
  "explanation": "공유/독립 경계를 A vs B 구조로 재배치한 비교형 카드."
}}

✅ 예시 3 (절차형, S3 근거, Step 3(c) 순서 재배치 + (d) 요약):
{{
  "item_type": "flashcard",
  "front": "컨텍스트 스위칭의 두 단계는 어떤 순서인가?",
  "back": "1단계 저장 → 현재 상태를 PCB 에 기록. 2단계 복원 → 다음 상태를 PCB 에서 읽어옴. 두 단계가 한 쌍.",
  "options": null, "correct_answer": null, "bloom_level": null, "difficulty": null,
  "source_span": "컨텍스트 스위칭은 CPU 가 현재 프로세스의 상태를 PCB 에 저장하고 다음 프로세스의 상태를 PCB 에서 복원하는 과정이다.",
  "explanation": "저장·복원이 한 쌍으로 이루어지는 절차를 단계형으로 표현."
}}

❌ 금지 예시 (원문 12자 이상 연속 발췌 — Step 3 위반):
{{
  "front": "컨텍스트 스위칭은?",   // 8자 — Step 1 위반 (15자 미달)
  "back": "컨텍스트 스위칭은 CPU 가 현재 프로세스의 상태를 PCB 에 저장하고 다음 프로세스의 상태를 PCB 에서 복원하는 과정이다."
         // 원문 100% 복사 — Step 2 (mental close) 와 Step 3 (12자 연속 점검) 모두 위반
}}

[flashcard 최종 자기 점검 — 각 카드 생성 직후]

각 카드 작성 후 아래 4개를 모두 확인. 실패 항목이 1개라도 있으면 해당 카드를 재작성한다.
  (1) front 가 15~40자 물음표 종결문인가
  (2) back 이 30~150자, 1~2문장인가
  (3) back 에 원문 12자 이상 연속 일치 구간이 없는가
  (4) 세트 내 다른 카드와 front 핵심 명사가 중복되지 않는가
"""


STUDY_MCQ_EASY_PROMPT = _SHARED_BASE + _MCQ_EASY + _SHARED_TAIL
STUDY_MCQ_MEDIUM_PROMPT = _SHARED_BASE + _MCQ_MEDIUM + _SHARED_TAIL
STUDY_MCQ_HARD_PROMPT = _SHARED_BASE + _MCQ_HARD + _SHARED_TAIL
STUDY_MCQ_MIXED_PROMPT = _SHARED_BASE + _MCQ_MIXED + _SHARED_TAIL

STUDY_OX_EASY_PROMPT = _SHARED_BASE + _OX_EASY + _SHARED_TAIL
STUDY_OX_MEDIUM_PROMPT = _SHARED_BASE + _OX_MEDIUM + _SHARED_TAIL
STUDY_OX_HARD_PROMPT = _SHARED_BASE + _OX_HARD + _SHARED_TAIL
STUDY_OX_MIXED_PROMPT = _SHARED_BASE + _OX_MIXED + _SHARED_TAIL

STUDY_CLOZE_EASY_PROMPT = _SHARED_BASE + _CLOZE_EASY + _SHARED_TAIL
STUDY_CLOZE_MEDIUM_PROMPT = _SHARED_BASE + _CLOZE_MEDIUM + _SHARED_TAIL
STUDY_CLOZE_HARD_PROMPT = _SHARED_BASE + _CLOZE_HARD + _SHARED_TAIL
STUDY_CLOZE_MIXED_PROMPT = _SHARED_BASE + _CLOZE_MIXED + _SHARED_TAIL

STUDY_SHORT_ANSWER_EASY_PROMPT = _SHARED_BASE + _SA_EASY + _SHARED_TAIL
STUDY_SHORT_ANSWER_MEDIUM_PROMPT = _SHARED_BASE + _SA_MEDIUM + _SHARED_TAIL
STUDY_SHORT_ANSWER_HARD_PROMPT = _SHARED_BASE + _SA_HARD + _SHARED_TAIL
STUDY_SHORT_ANSWER_MIXED_PROMPT = _SHARED_BASE + _SA_MIXED + _SHARED_TAIL

STUDY_FLASHCARD_PROMPT = _SHARED_BASE + _FLASHCARD + _SHARED_TAIL


_ITEM_TYPE_DIFF_PROMPTS: dict[tuple[str, str], str] = {
    ("mcq", "easy"): STUDY_MCQ_EASY_PROMPT,
    ("mcq", "medium"): STUDY_MCQ_MEDIUM_PROMPT,
    ("mcq", "hard"): STUDY_MCQ_HARD_PROMPT,
    ("mcq", "mixed"): STUDY_MCQ_MIXED_PROMPT,
    ("ox", "easy"): STUDY_OX_EASY_PROMPT,
    ("ox", "medium"): STUDY_OX_MEDIUM_PROMPT,
    ("ox", "hard"): STUDY_OX_HARD_PROMPT,
    ("ox", "mixed"): STUDY_OX_MIXED_PROMPT,
    ("cloze", "easy"): STUDY_CLOZE_EASY_PROMPT,
    ("cloze", "medium"): STUDY_CLOZE_MEDIUM_PROMPT,
    ("cloze", "hard"): STUDY_CLOZE_HARD_PROMPT,
    ("cloze", "mixed"): STUDY_CLOZE_MIXED_PROMPT,
    ("short_answer", "easy"): STUDY_SHORT_ANSWER_EASY_PROMPT,
    ("short_answer", "medium"): STUDY_SHORT_ANSWER_MEDIUM_PROMPT,
    ("short_answer", "hard"): STUDY_SHORT_ANSWER_HARD_PROMPT,
    ("short_answer", "mixed"): STUDY_SHORT_ANSWER_MIXED_PROMPT,
    ("flashcard", "easy"): STUDY_FLASHCARD_PROMPT,
    ("flashcard", "medium"): STUDY_FLASHCARD_PROMPT,
    ("flashcard", "hard"): STUDY_FLASHCARD_PROMPT,
    ("flashcard", "mixed"): STUDY_FLASHCARD_PROMPT,
}


def get_study_prompt(item_type: str, difficulty: str = "medium") -> str:
    return _ITEM_TYPE_DIFF_PROMPTS.get(
        (item_type, difficulty),
        STUDY_MCQ_MEDIUM_PROMPT,
    )


def build_study_prompt(
    document_text: str,
    item_type: str = "mcq",
    difficulty: str = "medium",
    count: int = 5,
    language: str = "auto",
) -> str:
    """Render the (item_type, difficulty) prompt with runtime inputs.

    Valid ranges: document_text 100~100,000 chars, count 1~30.
    Out-of-range values handled by the prompt's 공통 분기 처리 table.
    Unknown (item_type, difficulty) pairs fall back to MCQ medium.
    """
    template = get_study_prompt(item_type, difficulty)
    return template.format(
        document_text=document_text,
        difficulty=difficulty,
        count=count,
        language=language,
    )
