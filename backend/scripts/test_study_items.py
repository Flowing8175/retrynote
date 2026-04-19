"""Throwaway test harness for backend/app/prompts/study_items.py against gpt-5.4-nano.

Runs locally (NOT on server — AGENTS.md constrains the 1GB prod box).
Loads OPENAI_API_KEY from the project-root .env, calls the ECO model with each
of the 5 item-type prompts against 2 sample documents, validates JSON shape and
spot-checks per-type rubric adherence, then prints a per-run PASS/FAIL report.

Usage:
    /home/oh/dev/retrynote/backend/.venv/bin/python3 \
        /home/oh/dev/retrynote/backend/scripts/test_study_items.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Make backend/app importable so we can reuse study_items.build_study_prompt.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

PROJECT_ROOT = BACKEND_DIR.parent
_env_path = PROJECT_ROOT / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)

from openai import AsyncOpenAI  # noqa: E402
from app.prompts.study_items import build_study_prompt  # noqa: E402

MODEL = "gpt-5.4-mini"

DOC_OS = """프로세스는 실행 중인 프로그램으로, 각자 독립된 코드·데이터·힙·스택을 가진다.
스레드는 한 프로세스 내에서 코드·데이터·힙을 공유하며 스택과 레지스터만 독립적으로 유지한다.
덕분에 컨텍스트 스위칭 시 공유 자원의 메모리 맵 전환이 불필요하다. 반면 프로세스 간
컨텍스트 스위칭은 가상 메모리 정보 전체를 교체해야 한다.

CPU 가 프로세스에 할당되어 준비 상태에서 실행 상태로 전이되는 동작을 디스패치라 한다.
컨텍스트 스위칭은 CPU 가 현재 프로세스의 상태를 PCB 에 저장하고 다음 프로세스의 상태를
PCB 에서 복원하는 과정이다. PCB 에는 프로세스 ID, 레지스터 값, 메모리 정보, 스케줄링
정보가 저장된다.

선점형 스케줄링은 운영체제가 실행 중인 프로세스를 강제로 중단시키고 CPU 를 재할당할 수
있다. 비선점형은 프로세스가 자발적으로 CPU 를 반환할 때까지 기다린다. 선점형은 응답성이
좋지만 컨텍스트 스위칭 비용이 증가하고, 비선점형은 처리량이 좋지만 긴 작업이 다른 작업을
지연시킨다. 실시간 시스템은 마감 시간 준수가 필수이므로 선점형을 주로 사용한다."""

DOC_DB = """관계형 데이터베이스의 트랜잭션은 ACID 성질을 만족해야 한다. Atomicity(원자성)는
트랜잭션 내 연산이 전부 반영되거나 전부 취소되어야 함을 의미한다. Consistency(일관성)는
트랜잭션 전후로 데이터베이스의 무결성 제약 조건이 유지됨을 의미한다. Isolation(고립성)은
동시에 실행되는 트랜잭션들이 서로 영향을 주지 않는 것처럼 보여야 함을 의미한다.
Durability(지속성)는 커밋된 트랜잭션의 결과가 시스템 장애에도 영구적으로 유지됨을 의미한다.

고립성 수준은 네 단계로 나뉜다. READ UNCOMMITTED 는 다른 트랜잭션의 커밋되지 않은 변경도
읽을 수 있어 Dirty Read 가 발생한다. READ COMMITTED 는 커밋된 데이터만 읽지만 같은 쿼리의
결과가 달라지는 Non-repeatable Read 가 발생할 수 있다. REPEATABLE READ 는 같은 행의 반복
조회 결과를 보장하지만, 범위 쿼리에서 새 행이 추가되는 Phantom Read 는 여전히 발생할 수
있다. SERIALIZABLE 은 모든 이상 현상을 제거하지만 동시성이 크게 저하된다."""


@dataclass
class TestCase:
    doc_name: str
    doc_text: str
    item_type: str
    difficulty: str
    count: int
    language: str = "ko"


TEST_CASES: list[TestCase] = [
    TestCase("OS", DOC_OS, "mcq", "medium", 2),
    TestCase("OS", DOC_OS, "ox", "medium", 2),
    TestCase("OS", DOC_OS, "cloze", "medium", 2),
    TestCase("OS", DOC_OS, "short_answer", "medium", 2),
    TestCase("OS", DOC_OS, "flashcard", "medium", 3),
    TestCase("DB", DOC_DB, "mcq", "hard", 1),
    TestCase("DB", DOC_DB, "ox", "hard", 1),
    TestCase("DB", DOC_DB, "cloze", "easy", 1),
    TestCase("DB", DOC_DB, "short_answer", "medium", 1),
    TestCase("DB", DOC_DB, "flashcard", "medium", 2),
]


def _strip_json_fences(text: str) -> str:
    """Mirror study_service._strip_json_fences — remove ``` fences if present."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _check_top_level(data: Any) -> list[str]:
    v: list[str] = []
    if not isinstance(data, dict):
        v.append(f"root is not object (got {type(data).__name__})")
        return v
    if "items" not in data:
        v.append("missing key: items")
    elif not isinstance(data["items"], list):
        v.append("items is not array")
    if "error" not in data:
        v.append("missing key: error")
    if "message" not in data:
        v.append("missing key: message")
    return v


def _char_len(s: Any) -> int:
    return len(s) if isinstance(s, str) else 0


def validate_mcq(data: dict) -> list[str]:
    v: list[str] = _check_top_level(data)
    if v:
        return v
    for idx, it in enumerate(data.get("items", [])):
        tag = f"item[{idx}]"
        if it.get("item_type") != "mcq":
            v.append(f"{tag}.item_type != 'mcq'")
        front_len = _char_len(it.get("front"))
        if not (10 <= front_len <= 120):
            v.append(f"{tag}.front len={front_len} out of [10,120]")
        opts = it.get("options")
        if not isinstance(opts, list) or len(opts) != 4:
            v.append(f"{tag}.options must be length-4 array")
            continue
        labels = [o.get("label") for o in opts]
        if labels != ["A", "B", "C", "D"]:
            v.append(f"{tag}.options labels {labels} != [A,B,C,D]")
        correct = [o for o in opts if o.get("correct") is True]
        if len(correct) != 1:
            v.append(f"{tag} must have exactly 1 correct option (got {len(correct)})")
        ca = it.get("correct_answer")
        if ca not in {"A", "B", "C", "D"}:
            v.append(f"{tag}.correct_answer={ca!r} not in A..D")
        elif correct and correct[0].get("label") != ca:
            v.append(f"{tag}.correct_answer={ca} disagrees with options.correct flag")
        lens = [_char_len(o.get("text")) for o in opts]
        if any(not (10 <= L <= 80) for L in lens):
            v.append(f"{tag}.options text lengths {lens} — each must be [10,80]")
        if lens:
            longest = max(lens)
            tolerance = longest * 0.30
            if any(longest - L > tolerance for L in lens):
                v.append(
                    f"{tag}.options length spread {lens} exceeds 30% of max={longest} (M1-③)"
                )
        # Forbidden phrases (M4)
        banned = ["위의 모든", "모두 정답", "해당 없음", "None of the above"]
        for o in opts:
            t = o.get("text", "")
            for b in banned:
                if b in t:
                    v.append(f"{tag}.options has banned phrase '{b}' (M4)")
        expl = it.get("explanation", "")
        sents = [s for s in re.split(r"[.。\n]", expl) if s.strip()]
        if len(sents) < 3:
            v.append(f"{tag}.explanation has {len(sents)} sentences (<3, M3 3-part)")
        for o in opts:
            if o.get("correct") is False and not o.get("misconception_targeted"):
                v.append(f"{tag}.option {o.get('label')} missing misconception_targeted (M1-①)")
        if _char_len(it.get("source_span")) > 120:
            v.append(f"{tag}.source_span > 120 chars")
    return v


def validate_ox(data: dict) -> list[str]:
    v: list[str] = _check_top_level(data)
    if v:
        return v
    for idx, it in enumerate(data.get("items", [])):
        tag = f"item[{idx}]"
        if it.get("item_type") != "ox":
            v.append(f"{tag}.item_type != 'ox'")
        front_len = _char_len(it.get("front"))
        if not (10 <= front_len <= 120):
            v.append(f"{tag}.front len={front_len} out of [10,120]")
        # Double negation check (N3)
        front = it.get("front", "")
        if re.search(r"(하지 않는 것은 아니다|않지 않|없지 않)", front):
            v.append(f"{tag}.front is double negation (N3)")
        opts = it.get("options")
        if not isinstance(opts, list) or len(opts) != 2:
            v.append(f"{tag}.options must be length-2 array")
            continue
        labels = [o.get("label") for o in opts]
        if set(labels) != {"O", "X"}:
            v.append(f"{tag}.options labels {labels} != {{O,X}}")
        correct = [o for o in opts if o.get("correct") is True]
        if len(correct) != 1:
            v.append(f"{tag} must have exactly 1 correct option (got {len(correct)})")
        ca = it.get("correct_answer")
        if ca not in {"O", "X"}:
            v.append(f"{tag}.correct_answer={ca!r} not in {{O,X}}")
        elif correct and correct[0].get("label") != ca:
            v.append(f"{tag}.correct_answer={ca} disagrees with options.correct flag")
        if _char_len(it.get("source_span")) > 120:
            v.append(f"{tag}.source_span > 120 chars")
    return v


def validate_cloze(data: dict) -> list[str]:
    v: list[str] = _check_top_level(data)
    if v:
        return v
    for idx, it in enumerate(data.get("items", [])):
        tag = f"item[{idx}]"
        if it.get("item_type") != "cloze":
            v.append(f"{tag}.item_type != 'cloze'")
        front = it.get("front", "")
        n_blanks = front.count("[___]")
        if n_blanks < 1 or n_blanks > 2:
            v.append(f"{tag}.front has {n_blanks} [___] blanks (need 1–2, M6)")
        if it.get("options") not in (None, []):
            v.append(f"{tag}.options must be null/empty for cloze")
        ca = it.get("correct_answer", "")
        if not isinstance(ca, str) or not ca.strip():
            v.append(f"{tag}.correct_answer must be non-empty string")
        else:
            n_answers = ca.count("||") + 1
            if n_blanks != n_answers:
                v.append(
                    f"{tag} blank count {n_blanks} disagrees with answer parts {n_answers}"
                )
        if "acceptable_answers" not in it:
            v.append(f"{tag}.acceptable_answers missing")
        elif not isinstance(it["acceptable_answers"], list):
            v.append(f"{tag}.acceptable_answers must be array")
        if _char_len(it.get("source_span")) > 120:
            v.append(f"{tag}.source_span > 120 chars")
    return v


def validate_short_answer(data: dict) -> list[str]:
    v: list[str] = _check_top_level(data)
    if v:
        return v
    for idx, it in enumerate(data.get("items", [])):
        tag = f"item[{idx}]"
        if it.get("item_type") != "short_answer":
            v.append(f"{tag}.item_type != 'short_answer'")
        front_len = _char_len(it.get("front"))
        if not (10 <= front_len <= 120):
            v.append(f"{tag}.front len={front_len} out of [10,120]")
        if "[___]" in it.get("front", ""):
            v.append(f"{tag}.front has [___] blank (short_answer forbids blanks, M1)")
        ans_len = _char_len(it.get("correct_answer"))
        if not (20 <= ans_len <= 200):
            v.append(f"{tag}.correct_answer len={ans_len} out of [20,200] (M2)")
        kp = it.get("key_points")
        if not isinstance(kp, list) or not (2 <= len(kp) <= 5):
            n = len(kp) if isinstance(kp, list) else "N/A"
            v.append(f"{tag}.key_points must be array of 2-5 (got {n}, M3)")
        elif any(_char_len(p) > 20 for p in kp):
            v.append(f"{tag}.key_points has overlong phrases (M3 spec: 10자 이내, tolerated: 20)")
        if it.get("options") not in (None, []):
            v.append(f"{tag}.options must be null for short_answer")
        if _char_len(it.get("source_span")) > 120:
            v.append(f"{tag}.source_span > 120 chars")
    return v


def validate_flashcard(data: dict) -> list[str]:
    v: list[str] = _check_top_level(data)
    if v:
        return v
    fronts_seen: set[str] = set()
    for idx, it in enumerate(data.get("items", [])):
        tag = f"item[{idx}]"
        if it.get("item_type") != "flashcard":
            v.append(f"{tag}.item_type != 'flashcard'")
        front = it.get("front", "")
        if not (10 <= _char_len(front) <= 30):
            v.append(f"{tag}.front len={_char_len(front)} out of [10,30] (M2)")
        back_len = _char_len(it.get("back"))
        if not (20 <= back_len <= 200):
            v.append(f"{tag}.back len={back_len} out of [20,200] (M3)")
        if "(" in front and ")" in front:
            v.append(f"{tag}.front has '(..)' — likely leaks answer via 용어(약어) (M2)")
        canon = re.sub(r"\s+", "", front.lower())
        if canon and canon in fronts_seen:
            v.append(f"{tag}.front duplicates earlier card (M5)")
        fronts_seen.add(canon)
        if _char_len(it.get("source_span")) > 120:
            v.append(f"{tag}.source_span > 120 chars")
    return v


VALIDATORS = {
    "mcq": validate_mcq,
    "ox": validate_ox,
    "cloze": validate_cloze,
    "short_answer": validate_short_answer,
    "flashcard": validate_flashcard,
}


async def run_case(client: AsyncOpenAI, tc: TestCase) -> dict[str, Any]:
    prompt = build_study_prompt(
        document_text=tc.doc_text,
        item_type=tc.item_type,
        difficulty=tc.difficulty,
        count=tc.count,
        language=tc.language,
    )
    t0 = time.perf_counter()
    # gpt-5 family SDK quirk: uses max_completion_tokens and rejects non-default
    # temperature. response_format=json_object is belt-and-suspenders alongside
    # the prompt's own N1 fence-forbidding clause.
    try:
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": "생성 시작"},
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=4000,
            timeout=120,
        )
        dt = time.perf_counter() - t0
    except Exception as e:
        return {
            "case": tc,
            "ok": False,
            "error": f"API error: {type(e).__name__}: {e}",
            "dt": time.perf_counter() - t0,
        }

    content = resp.choices[0].message.content or ""
    usage = resp.usage
    raw = _strip_json_fences(content)

    try:
        data = json.loads(raw)
        parse_ok = True
        parse_err: str | None = None
    except json.JSONDecodeError as e:
        data = None
        parse_ok = False
        parse_err = str(e)

    violations: list[str] = []
    if parse_ok and isinstance(data, dict):
        validator = VALIDATORS[tc.item_type]
        violations = validator(data)
    elif parse_ok:
        violations = [f"root is not object (got {type(data).__name__})"]

    return {
        "case": tc,
        "ok": parse_ok and not violations,
        "dt": dt,
        "parse_ok": parse_ok,
        "parse_err": parse_err,
        "raw": content,
        "data": data,
        "violations": violations,
        "usage": {
            "prompt": usage.prompt_tokens if usage else None,
            "completion": usage.completion_tokens if usage else None,
            "total": usage.total_tokens if usage else None,
        },
    }


def short(s: str, n: int = 180) -> str:
    s = s.replace("\n", " ")
    return s if len(s) <= n else s[:n] + "…"


def print_result(idx: int, result: dict[str, Any]) -> None:
    tc: TestCase = result["case"]
    tag = (
        f"[{idx:02d}] {tc.doc_name}/{tc.item_type}/{tc.difficulty}×{tc.count}"
        f"  {result['dt']:.1f}s"
    )
    status = "PASS" if result["ok"] else "FAIL"
    print(f"\n{'=' * 78}\n{status} {tag}")
    if "error" in result:
        print(f"  ERROR: {result['error']}")
        return
    u = result["usage"]
    print(f"  tokens: prompt={u['prompt']} completion={u['completion']} total={u['total']}")
    if not result["parse_ok"]:
        print(f"  JSON parse error: {result['parse_err']}")
        print(f"  raw[:400]: {short(result['raw'], 400)}")
        return
    if result["violations"]:
        print(f"  {len(result['violations'])} rubric violation(s):")
        for v in result["violations"]:
            print(f"    - {v}")
    data = result["data"]
    items = data.get("items", []) if isinstance(data, dict) else []
    print(f"  items: {len(items)}  error={data.get('error')}  message={short(str(data.get('message')), 80)}")
    for i, it in enumerate(items):
        if tc.item_type == "flashcard":
            print(f"    #{i} front={short(str(it.get('front')), 60)!r}")
            print(f"       back ={short(str(it.get('back')), 80)!r}")
        else:
            print(f"    #{i} front={short(str(it.get('front')), 80)!r}")
            if tc.item_type in {"mcq", "ox"}:
                print(f"       answer={it.get('correct_answer')} bloom={it.get('bloom_level')} diff={it.get('difficulty')}")
            elif tc.item_type == "cloze":
                print(f"       answer={it.get('correct_answer')!r} accept={it.get('acceptable_answers')}")
            elif tc.item_type == "short_answer":
                print(f"       answer[:60]={short(str(it.get('correct_answer')), 60)!r}")
                print(f"       key_points={it.get('key_points')}")


async def main() -> int:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set (checked project-root .env and env)")
        return 2
    print(f"Model: {MODEL}")
    print(f"Cases: {len(TEST_CASES)}")
    client = AsyncOpenAI(api_key=api_key)

    sem = asyncio.Semaphore(3)

    async def guarded(tc: TestCase) -> dict[str, Any]:
        async with sem:
            return await run_case(client, tc)

    results = await asyncio.gather(*(guarded(tc) for tc in TEST_CASES))
    results_sorted = sorted(results, key=lambda r: TEST_CASES.index(r["case"]))
    for i, r in enumerate(results_sorted):
        print_result(i, r)

    total = len(results_sorted)
    passed = sum(1 for r in results_sorted if r.get("ok"))
    print(f"\n{'=' * 78}\nSUMMARY: {passed}/{total} PASS")
    print("\nPer-type breakdown:")
    by_type: dict[str, list[dict[str, Any]]] = {}
    for r in results_sorted:
        by_type.setdefault(r["case"].item_type, []).append(r)
    for t, rs in by_type.items():
        p = sum(1 for r in rs if r.get("ok"))
        vio = sum(len(r.get("violations", [])) for r in rs)
        print(f"  {t:13s} {p}/{len(rs)} pass  {vio} violation(s)  total_tokens={sum((r.get('usage') or {}).get('total') or 0 for r in rs)}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
