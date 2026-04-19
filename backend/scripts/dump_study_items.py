"""Dump full JSON outputs of study_items prompts against gpt-5.4-nano.

No validation, no rubric checks — just raw pretty-printed JSON per case so a
human can read each item end-to-end against the rubric in study_items.py.

Usage:
    /home/oh/dev/retrynote/backend/.venv/bin/python3 \
        /home/oh/dev/retrynote/backend/scripts/dump_study_items.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

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
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

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
class Case:
    doc_name: str
    doc_text: str
    item_type: str
    difficulty: str
    count: int
    language: str = "ko"


CASES: list[Case] = [
    Case("OS", DOC_OS, "mcq", "medium", 2),
    Case("OS", DOC_OS, "ox", "medium", 2),
    Case("OS", DOC_OS, "cloze", "medium", 2),
    Case("OS", DOC_OS, "short_answer", "medium", 2),
    Case("OS", DOC_OS, "flashcard", "medium", 3),
    Case("DB", DOC_DB, "mcq", "hard", 1),
    Case("DB", DOC_DB, "ox", "hard", 1),
    Case("DB", DOC_DB, "cloze", "easy", 1),
    Case("DB", DOC_DB, "short_answer", "medium", 1),
    Case("DB", DOC_DB, "flashcard", "medium", 2),
]


async def run_case(client: AsyncOpenAI, c: Case) -> dict:
    prompt = build_study_prompt(
        document_text=c.doc_text,
        item_type=c.item_type,
        difficulty=c.difficulty,
        count=c.count,
        language=c.language,
    )
    t0 = time.perf_counter()
    # gpt-5 family SDK quirk: max_completion_tokens (not max_tokens), and no
    # custom temperature. response_format=json_object forces valid JSON.
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
    content = resp.choices[0].message.content or ""
    usage = resp.usage
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        data = {"__parse_error__": True, "__raw__": content}
    return {
        "case": c,
        "dt": dt,
        "data": data,
        "usage": {
            "prompt": usage.prompt_tokens if usage else None,
            "completion": usage.completion_tokens if usage else None,
            "total": usage.total_tokens if usage else None,
        },
    }


async def main() -> int:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        return 2
    client = AsyncOpenAI(api_key=api_key)
    sem = asyncio.Semaphore(3)

    async def guarded(c: Case) -> dict:
        async with sem:
            return await run_case(client, c)

    results = await asyncio.gather(*(guarded(c) for c in CASES))
    results.sort(key=lambda r: CASES.index(r["case"]))

    for i, r in enumerate(results):
        c = r["case"]
        u = r["usage"]
        print(f"\n{'=' * 90}")
        print(f"[{i:02d}] doc={c.doc_name}  type={c.item_type}  diff={c.difficulty}  count={c.count}  dt={r['dt']:.1f}s")
        print(f"    tokens: prompt={u['prompt']} completion={u['completion']} total={u['total']}")
        print(f"{'-' * 90}")
        print(json.dumps(r["data"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
