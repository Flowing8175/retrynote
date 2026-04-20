# RetryNote

개인 학습자를 위한 AI 기반 퀴즈 생성 및 오답 관리 시스템입니다. 자료를 업로드하면 AI가 자동으로 퀴즈를 생성하고, 오답을 분석하여 재도전 문제를 추천합니다.

## Architecture Overview

**Backend:**
- FastAPI (async)
- SQLAlchemy + asyncpg
- PostgreSQL with pgvector extension
- Redis (Celery broker)
- Celery (background jobs)

**Frontend:**
- React 18
- TypeScript
- Vite
- Tailwind CSS

**DevOps:**
- Docker Compose (로컬 인프라: DB + Redis)
- Alembic (DB migrations)
- GitHub Actions (CI/CD)
- Doppler (secrets 관리)

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)
- uv (Python 패키지 매니저)

## Quick Start (Docker Compose)

```bash
# 1. Repository 복제
git clone <repository-url>
cd retrynote

# 2. 환경 변수 파일 복사
cp .env.example .env

# 3. .env 파일에서 필수 값 수정
# - OPENAI_API_KEY 또는 GEMINI_API_KEY 중 하나 이상 설정
# - POSTGRES_PASSWORD, REDIS_PASSWORD 설정 필수
# - 기타 필요한 환경 변수 값 확인 후 수정

# 4. Docker Compose로 실행
docker-compose up --build

# 5. 서비스 접속
# Frontend: http://localhost:5173
# API: http://localhost:8001
# API Docs (Swagger): http://localhost:8001/docs
# API Docs (ReDoc): http://localhost:8001/redoc
```

## Local Development Setup

### Backend

```bash
cd backend

# 의존성 설치 (uv 사용)
uv sync

# 마이그레이션 실행
.venv/bin/alembic upgrade head

# API 서버 실행
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Celery worker 실행 (별도 터미널)
.venv/bin/celery -A app.workers.celery_app worker --loglevel=info
```

> **Doppler 사용 시**: `start_local_dev.sh` 참조 — tmux 세션으로 API, worker, frontend를 한 번에 실행합니다.

### Frontend

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드 (프로덕션)
npm run build
```

### Redis & DB Setup (Local)

```bash
# Docker로 Redis + PostgreSQL 실행 (docker-compose.yml 활용)
docker-compose up db redis
```

## Environment Variables

| 변수 | 설명 | 기본값 |
|------|------|--------|
| **Database** | | |
| `DATABASE_URL` | PostgreSQL async 연결 URL | `postgresql+asyncpg://quiz:quiz@localhost:5432/quizmanager` |
| `DATABASE_URL_SYNC` | PostgreSQL sync 연결 URL (Alembic용) | `postgresql://quiz:quiz@localhost:5432/quizmanager` |
| `POSTGRES_PASSWORD` | PostgreSQL 비밀번호 (Docker Compose) | (필수) |
| **Redis** | | |
| `REDIS_URL` | Redis 연결 URL | `redis://localhost:6379/0` |
| `REDIS_PASSWORD` | Redis 비밀번호 (Docker Compose) | (필수) |
| **JWT** | | |
| `JWT_SECRET_KEY` | JWT 서명 키 (반드시 변경 필요) | `change-me-to-a-secure-random-string` |
| `JWT_ALGORITHM` | JWT 알고리즘 | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access Token 만료 시간 (분) | `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh Token 만료 시간 (일) | `7` |
| `ADMIN_SESSION_EXPIRE_MINUTES` | 관리자 세션 만료 시간 (분) | `30` |
| `ADMIN_MASTER_PASSWORD` | 관리자 마스터 비밀번호 (최초 사용 시 해시되어 DB에 저장) | |
| **AI — OpenAI** | | |
| `OPENAI_API_KEY` | OpenAI API Key | |
| **AI — Gemini** | | |
| `GEMINI_API_KEY` | Gemini API Key | |
| `GEMINI_CONTEXT_CACHE_ENABLED` | Gemini Context Cache 활성화 | `true` |
| `GEMINI_CONTEXT_CACHE_TTL_SECONDS` | Gemini Context Cache TTL (초) | `3600` |
| **AI — Anthropic** | | |
| `ANTHROPIC_API_KEY` | Anthropic Claude API Key | |
| **AI — 모델 티어 (공통)** | | |
| `ECO_GENERATION_MODEL` | 절약형 티어 모델 (모델명으로 provider 자동 감지) | `gpt-5.4-nano` |
| `BALANCED_GENERATION_MODEL` | 균형형 티어 모델 (모델명으로 provider 자동 감지) | `gpt-5.4-mini` |
| `PERFORMANCE_GENERATION_MODEL` | 고성능 티어 모델 (모델명으로 provider 자동 감지) | `gemini-3-flash` |
| `MAX_GENERATION_MODEL` | 최상위 티어 모델 (모델명으로 provider 자동 감지) | `claude-sonnet-4-6` |
| **File Storage** | | |
| `UPLOAD_DIR` | 파일 업로드 경로 | `storage/uploads` |
| `MAX_UPLOAD_SIZE_MB` | 최대 업로드 크기 (MB) | `5` |
| `ALLOWED_FILE_TYPES` | 허용 파일 확장자 | `pdf,docx,pptx,txt,md,png,jpg,jpeg` |
| **Backblaze B2** | | |
| `B2_KEY_ID` | Backblaze B2 Key ID | |
| `B2_APPLICATION_KEY` | Backblaze B2 Application Key | |
| `B2_BUCKET_NAME` | Backblaze B2 Bucket 이름 | |
| `B2_ENDPOINT_URL` | Backblaze B2 Endpoint URL | |
| **Google Cloud Vision** | | |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision OCR API Key | |
| **App** | | |
| `APP_ENV` | 환경 (development/production) | `development` |
| `APP_URL` | Frontend URL | `http://localhost:5173` |
| `API_URL` | Backend API URL | `http://localhost:8000` |
| `CORS_ORIGINS` | 허용 CORS origins (쉼표 구분) | `http://localhost:5173` |
| `GUEST_SESSION_TTL_HOURS` | 게스트 세션 유효 시간 (시간) | `24` |
| **SMTP** | | |
| `SMTP_HOST` | SMTP 호스트 | |
| `SMTP_PORT` | SMTP 포트 | `587` |
| `SMTP_USER` | SMTP 사용자 | |
| `SMTP_PASSWORD` | SMTP 비밀번호 | |
| `SMTP_FROM` | 발신자 이메일 | `noreply@example.com` |
| **Paddle (결제)** | | |
| `PADDLE_API_KEY` | Paddle API Key | |
| `PADDLE_CLIENT_TOKEN` | Paddle Client Token (Frontend용) | |
| `PADDLE_ENVIRONMENT` | Paddle 환경 | `sandbox` |
| `PADDLE_WEBHOOK_SECRET` | Paddle Webhook 서명 검증 키 | (production 필수) |
| `PADDLE_LITE_MONTHLY_PRICE_ID` | Lite 월정액 Price ID | |
| `PADDLE_LITE_QUARTERLY_PRICE_ID` | Lite 분기 Price ID | |
| `PADDLE_STANDARD_MONTHLY_PRICE_ID` | Standard 월정액 Price ID | |
| `PADDLE_STANDARD_QUARTERLY_PRICE_ID` | Standard 분기 Price ID | |
| `PADDLE_PRO_MONTHLY_PRICE_ID` | Pro 월정액 Price ID | |
| `PADDLE_PRO_QUARTERLY_PRICE_ID` | Pro 분기 Price ID | |
| **Cloudflare** | | |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY` | Cloudflare Turnstile Secret Key | |
| **Job Timeouts** | | |
| `GENERATION_TIMEOUT` | 문제 생성 타임아웃 (초) | `120` |
| `GRADING_TIMEOUT` | 채점 타임아웃 (초) | `60` |
| `OBJECTION_REVIEW_TIMEOUT` | 이의제기 검토 타임아웃 (초) | `90` |
| `FILE_PROCESSING_TIMEOUT` | 파일 처리 타임아웃 (초) | `300` |
| **Rate Limits** | | |
| `MAX_RETRY_COUNT` | 최대 재시도 횟수 | `3` |
| `DAILY_QUIZ_GENERATION_LIMIT` | 일일 문제 생성 제한 | `50` |
| `DAILY_OCR_PAGE_LIMIT` | 일일 OCR 페이지 제한 | `100` |

> **AI 모델 티어**: 모델명의 prefix로 provider를 자동 감지합니다 (예: `gemini-` → Gemini API, `claude-` → Anthropic API, 그 외 → OpenAI API). OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY 중 사용할 모델에 맞는 키를 설정하면 됩니다.

## API Documentation

FastAPI는 자동으로 API 문서를 생성합니다. 다음 URL에서 확인 가능합니다:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

주요 API 카테고리:
- `/auth/` - 인증 (회원가입, 로그인, 비밀번호 재설정)
- `/files/` - 파일 업로드 및 관리
- `/quiz-sessions/` - 퀴즈 세션 관리
- `/objections/` - 문제 이의제기
- `/saved-prompts/` - 저장된 프롬프트
- `/wrong-notes/` - 오답노트 조회
- `/retry-sets/` - 재도전 문제 생성
- `/study/` - 학습 관련 기능
- `/dashboard/` - 대시보드 통계
- `/search/` - 통합 검색
- `/billing/` - 결제 및 구독 관리
- `/guest/` - 비로그인 게스트 기능
- `/public/` - 공개 엔드포인트
- `/admin/` - 관리자 기능

## Database Migrations

Alembic을 사용하여 DB 마이그레이션을 관리합니다.

```bash
cd backend

# 새로운 마이그레이션 생성
.venv/bin/alembic revision --autogenerate -m "migration message"

# 마이그레이션 적용
.venv/bin/alembic upgrade head

# 마이그레이션 롤백
.venv/bin/alembic downgrade -1

# 마이그레이션 히스토리 확인
.venv/bin/alembic history

# 현재 버전 확인
.venv/bin/alembic current
```

## Testing

```bash
cd backend

# 전체 테스트 실행
.venv/bin/pytest

# 특정 테스트 파일 실행
.venv/bin/pytest tests/test_auth.py

# 커버리지 확인
.venv/bin/pytest --cov=app --cov-report=html

# 상세 출력
.venv/bin/pytest -v
```

## Project Structure

```
retrynote/
├── backend/
│   ├── migrations/           # Alembic 마이그레이션
│   │   └── versions/         # 마이그레이션 스크립트
│   ├── app/
│   │   ├── api/              # API 라우터
│   │   ├── middleware/       # 미들웨어
│   │   ├── models/           # SQLAlchemy 모델
│   │   ├── prompts/          # AI 프롬프트 템플릿
│   │   ├── schemas/          # Pydantic 스키마
│   │   ├── services/         # 비즈니스 로직
│   │   ├── utils/            # 유틸리티
│   │   ├── workers/          # Celery workers
│   │   ├── main.py           # FastAPI app 엔트리 포인트
│   │   ├── config.py         # 설정 관리
│   │   └── tier_config.py    # 티어별 설정
│   ├── scripts/              # 관리 스크립트
│   ├── storage/              # 파일 저장소
│   │   └── uploads/          # 업로드된 파일
│   ├── tests/                # 테스트 코드
│   ├── pyproject.toml        # 프로젝트 설정 및 의존성
│   └── uv.lock               # uv 의존성 락 파일
├── frontend/
│   ├── public/               # 정적 리소스
│   ├── src/
│   │   ├── api/              # API 클라이언트
│   │   ├── components/       # React 컴포넌트
│   │   ├── hooks/            # Custom React Hooks
│   │   ├── lib/              # 라이브러리 유틸리티
│   │   ├── pages/            # 페이지 컴포넌트
│   │   ├── stores/           # Zustand 상태 저장소
│   │   ├── types/            # TypeScript 타입
│   │   ├── utils/            # 유틸리티 함수
│   │   └── main.tsx          # React 엔트리 포인트
│   ├── package.json          # Node.js 의존성
│   └── vite.config.ts        # Vite 설정
├── nginx/                    # nginx 설정
├── systemd/                  # systemd 서비스 파일
├── .github/                  # GitHub Actions CI/CD
├── docker-compose.yml        # Docker Compose 설정 (로컬 인프라)
├── deploy.sh                 # 배포 스크립트
├── start_local_dev.sh        # 로컬 개발 환경 시작 스크립트
├── .env.example              # 환경 변수 예시
└── README.md                 # 이 파일
```
