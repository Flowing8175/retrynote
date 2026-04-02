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
- Docker Compose
- Alembic (DB migrations)

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

## Quick Start (Docker Compose)

```bash
# 1. Repository 복제
git clone <repository-url>
cd quiz-manager

# 2. 환경 변수 파일 복사
cp .env.example .env

# 3. .env 파일에서 필수 값 수정
# - OPENAI_API_KEY 설정 필수
# - 기타 필요한 환경 변수 값 확인 후 수정

# 4. Docker Compose로 실행
docker-compose up --build

# 5. 서비스 접속
# Frontend: http://localhost:5173
# API: http://localhost:8000
# API Docs (Swagger): http://localhost:8000/docs
# API Docs (ReDoc): http://localhost:8000/redoc
```

## Local Development Setup

### Backend

```bash
cd backend

# 가상 환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 환경 변수 설정 (프로젝트 루트의 .env 사용)
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# 마이그레이션 실행
alembic upgrade head

# API 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Celery worker 실행 (별도 터미널)
celery -A app.workers.celery_app worker --loglevel=info
```

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

### Redis Setup (Local)

```bash
# Docker로 Redis 실행
docker run -d -p 6379:6379 redis:7-alpine
```

## Environment Variables

| 변수 | 설명 | 기본값 |
|------|------|--------|
| **Database** | | |
| `DATABASE_URL` | PostgreSQL async 연결 URL | `postgresql+asyncpg://quiz:quiz@localhost:5432/quizmanager` |
| `DATABASE_URL_SYNC` | PostgreSQL sync 연결 URL | `postgresql://quiz:quiz@localhost:5432/quizmanager` |
| **Redis** | | |
| `REDIS_URL` | Redis 연결 URL | `redis://localhost:6379/0` |
| **JWT** | | |
| `JWT_SECRET_KEY` | JWT 서명 키 (반드시 변경 필요) | `change-me-to-a-secure-random-string` |
| `JWT_ALGORITHM` | JWT 알고리즘 | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access Token 만료 시간 (분) | `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh Token 만료 시간 (일) | `7` |
| `ADMIN_SESSION_EXPIRE_MINUTES` | 관리자 세션 만료 시간 (분) | `30` |
| `ADMIN_MASTER_PASSWORD_HASH` | 관리자 마스터 비밀번호 해시 (최초 사용 시 생성됨) | |
| **AI** | | |
| `OPENAI_API_KEY` | OpenAI API Key | (필수) |
| `OPENAI_GENERATION_MODEL` | 문제 생성 모델 | `gpt-4o` |
| `OPENAI_GRADING_MODEL` | 채점 모델 | `gpt-4o-mini` |
| `OPENAI_FALLBACK_GENERATION_MODEL` | 문제 생성 fallback 모델 | `gpt-4o-mini` |
| `OPENAI_FALLBACK_GRADING_MODEL` | 채점 fallback 모델 | `gpt-3.5-turbo` |
| **File Storage** | | |
| `UPLOAD_DIR` | 파일 업로드 경로 | `./storage/uploads` |
| `MAX_UPLOAD_SIZE_MB` | 최대 업로드 크기 (MB) | `100` |
| `ALLOWED_FILE_TYPES` | 허용 파일 확장자 | `pdf,docx,pptx,txt,md,png,jpg,jpeg` |
| **App** | | |
| `APP_ENV` | 환경 (development/production) | `development` |
| `APP_URL` | Frontend URL | `http://localhost:5173` |
| `API_URL` | Backend API URL | `http://localhost:8000` |
| `CORS_ORIGINS` | 허용 CORS origins | `http://localhost:5173` |
| **SMTP** | | |
| `SMTP_HOST` | SMTP 호스트 | `smtp.example.com` |
| `SMTP_PORT` | SMTP 포트 | `587` |
| `SMTP_USER` | SMTP 사용자 | |
| `SMTP_PASSWORD` | SMTP 비밀번호 | |
| `SMTP_FROM` | 발신자 이메일 | `noreply@example.com` |
| **Job Timeouts** | | |
| `GENERATION_TIMEOUT` | 문제 생성 타임아웃 (초) | `120` |
| `GRADING_TIMEOUT` | 채점 타임아웃 (초) | `60` |
| `OBJECTION_REVIEW_TIMEOUT` | 이의제기 검토 타임아웃 (초) | `90` |
| `FILE_PROCESSING_TIMEOUT` | 파일 처리 타임아웃 (초) | `300` |
| **Rate Limits** | | |
| `MAX_RETRY_COUNT` | 최대 재시도 횟수 | `3` |
| `DAILY_QUIZ_GENERATION_LIMIT` | 일일 문제 생성 제한 | `50` |
| `DAILY_OCR_PAGE_LIMIT` | 일일 OCR 페이지 제한 | `100` |

## API Documentation

FastAPI는 자동으로 API 문서를 생성합니다. 다음 URL에서 확인 가능합니다:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

주요 API 카테고리:
- `/auth/` - 인증 (회원가입, 로그인, 비밀번호 재설정)
- `/files/` - 파일 업로드 및 관리
- `/quiz-sessions/` - 퀴즈 세션 관리
- `/wrong-notes/` - 오답노트 조회
- `/retry-sets/` - 재도전 문제 생성
- `/dashboard/` - 대시보드 통계
- `/search/` - 통합 검색
- `/admin/` - 관리자 기능

## Database Migrations

Alembic을 사용하여 DB 마이그레이션을 관리합니다.

```bash
cd backend

# 새로운 마이그레이션 생성
alembic revision --autogenerate -m "migration message"

# 마이그레이션 적용
alembic upgrade head

# 마이그레이션 롤백
alembic downgrade -1

# 마이그레이션 히스토리 확인
alembic history

# 현재 버전 확인
alembic current
```

## Testing

```bash
cd backend

# 전체 테스트 실행
pytest

# 특정 테스트 파일 실행
pytest tests/test_auth.py

# 커버리지 확인
pytest --cov=app --cov-report=html

# 상세 출력
pytest -v
```

## Project Structure

```
quiz-manager/
├── backend/
│   ├── alembic/              # Alembic 마이그레이션
│   │   └── versions/         # 마이그레이션 스크립트
│   ├── app/
│   │   ├── api/              # API 라우터
│   │   ├── core/             # 핵심 기능 (보안, 인증 등)
│   │   ├── models/           # SQLAlchemy 모델
│   │   ├── schemas/          # Pydantic 스키마
│   │   ├── services/         # 비즈니스 로직
│   │   ├── workers/          # Celery workers
│   │   ├── main.py           # FastAPI app 엔트리 포인트
│   │   └── config.py         # 설정 관리
│   ├── storage/              # 파일 저장소
│   │   └── uploads/          # 업로드된 파일
│   ├── tests/                # 테스트 코드
│   ├── requirements.txt      # Python 의존성
│   └── pyproject.toml        # 프로젝트 설정
├── frontend/
│   ├── public/               # 정적 리소스
│   ├── src/
│   │   ├── components/       # React 컴포넌트
│   │   ├── pages/            # 페이지 컴포넌트
│   │   ├── services/        # API 클라이언트
│   │   ├── types/            # TypeScript 타입
│   │   └── main.tsx          # React 엔트리 포인트
│   ├── package.json          # Node.js 의존성
│   └── vite.config.ts        # Vite 설정
├── docker-compose.yml        # Docker Compose 설정
├── .env.example              # 환경 변수 예시
└── README.md                 # 이 파일
```

## Risks and Remaining TODOs

### 현재 알려진 리스크 및 제한사항

1. **AI 모델 의존성**
   - OpenAI API Key가 필수로 필요합니다
   - API 호출 실패 시 fallback 모델이 사용되지만 완전한 대응은 아님

2. **OCR 품질**
   - 이미지 품질에 따라 OCR 정확도가 달라질 수 있음
   - 낮은 confidence 결과에 대해 경고 표시하지만 퀴즈 품질에 영향 가능

3. **Vector Search 의존성**
    - PostgreSQL pgvector extension은 마이그레이션 시 자동 설치됨
    - pgvector extension이 설치되지 않은 환경에서는 자료 기반 검색/생성 기능이 동작하지 않음

4. **백업 시스템**
   - 수동 백업 기능만 구현되어 있음
   - 자동 백업은 기본 비활성 상태 (P0 범위 제외)

5. **이메일 발송**
   - 비밀번호 재설정 기능에 SMTP 설정 필요
   - SMTP 미설정 시 이메일 발송 기능 동작하지 않음

6. **프로덕션 배포**
   - 실제 배포 시 환경 변수 보안 관리 필수
   - 관리자 마스터 비밀번호는 안전하게 관리 필요
   - 파일 스토리지, DB 백업 전략 별도 수립 필요

7. **성능 제한**
   - 대용량 파일 처리 시간이 길 수 있음
   - 동시 생성 작업 수 제한으로 인해 대기 가능

### 향후 개선 방향 (P0 범위 외)

- 모바일 UI 최적화
- 자동 백업 시스템 구현
- 모델별 품질 비교 모드
- 유튜브 링크 입력 지원
- 알림 기능
- 일정 기반 시험 대비 계획
