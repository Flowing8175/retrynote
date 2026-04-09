from fastapi import HTTPException, Request

from app.utils.turnstile import verify_turnstile_token


async def verify_turnstile(request: Request) -> None:
    token = request.headers.get("X-Turnstile-Token", "")
    if not token:
        raise HTTPException(status_code=403, detail="보안 인증 토큰이 필요합니다.")

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    if not await verify_turnstile_token(token, client_ip):
        raise HTTPException(
            status_code=403,
            detail="보안 인증에 실패했습니다. 다시 시도해주세요.",
        )
