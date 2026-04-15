import asyncio, json, traceback, sys, os, resource


async def test():
    rss = lambda: resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(f"PID={os.getpid()}, RSS={rss()}KB", flush=True)

    from app.config import settings

    model = settings.balanced_generation_model
    print(f"Config: model={model}, eco={settings.eco_generation_model}", flush=True)
    print(f"RSS after config: {rss()}KB", flush=True)

    from app.utils.ai_client import call_ai_structured, GENERATION_SCHEMA

    print(f"ai_client imported. RSS={rss()}KB", flush=True)

    from app.prompts import get_generation_system_prompt
    from app.prompts.generation import build_generation_prompt

    prompt = build_generation_prompt(
        source_context="No source material provided.",
        question_count=3,
        difficulty="easy",
        question_types=["multiple_choice", "ox"],
        concept_counts={},
        is_no_source=True,
        topic="Python basics",
    )
    print(f"Prompt built ({len(prompt)} chars). Calling Gemini...", flush=True)
    print(f"RSS before call: {rss()}KB", flush=True)

    try:
        result, tokens = await call_ai_structured(
            prompt,
            GENERATION_SCHEMA,
            system_message=get_generation_system_prompt("easy"),
            model=model,
            max_tokens=7500,
        )
        qs = result.get("questions", [])
        print(f"SUCCESS! tokens={tokens}, questions={len(qs)}", flush=True)
        print(f"RSS after call: {rss()}KB", flush=True)
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {str(e)[:500]}", flush=True)
        traceback.print_exc()
        print(f"RSS after error: {rss()}KB", flush=True)


asyncio.run(test())
