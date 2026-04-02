# 오답DB 기반 AI 퀴즈 웹앱 - Frontend

React + TypeScript + Vite로 구축된 퀴즈 웹앱 프론트엔드입니다.

## 기술 스택

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router v6
- Zustand (상태 관리)
- TanStack Query (서버 상태 관리)
- Axios (HTTP 클라이언트)

## 프로젝트 구조

```
frontend/
├── src/
│   ├── api/               # API 클라이언트 및 서비스
│   ├── components/         # 재사용 가능한 UI 컴포넌트
│   ├── pages/             # 페이지 컴포넌트
│   ├── stores/            # Zustand 상태 저장소
│   ├── types/             # TypeScript 타입 정의
│   ├── App.tsx            # 메인 앱 컴포넌트 (라우팅)
│   ├── main.tsx           # 엔트리 포인트
│   └── index.css          # Tailwind CSS 및 글로벌 스타일
├── public/                # 정적 파일
├── Dockerfile             # 멀티스테이지 빌드용 Dockerfile
├── package.json           # 의존성 및 스크립트
├── tsconfig.json          # TypeScript 설정
├── vite.config.ts         # Vite 설정
├── tailwind.config.js     # Tailwind CSS 설정
└── .env                  # 환경 변수
```

## 주요 기능

### 인증
- 회원가입 (`/signup`)
- 로그인 (`/login`)
- 비밀번호 재설정 (`/password-reset`)
- JWT 토큰 자동 갱신
- 관리자 가장 모드 지원

### 대시보드 (`/`)
- 학습 현황 요약
- 오늘 할 일
- 재도전 추천
- 취약 개념 TOP 5
- 문제 유형별 정답률
- 기간 필터 (7일/30일/전체)

### 자료 관리 (`/files`)
- 파일 업로드 (드래그 앤 드롭 지원)
- 파일 목록 및 상태 표시
- 상태 필터링
- 실패한 파일 재시도
- 파일 삭제
- 지원 형식: PDF, DOCX, PPTX, TXT, MD, PNG, JPG

### 퀴즈 관리
- 퀴즈 생성 (`/quiz/new`)
  - 자료 기반 생성 또는 자료 없이 생성
  - 일반 모드 또는 시험 모드
  - 문제 수, 난이도, 문제 유형 설정
  - no_source 경고 모달
- 퀴즈 풀이 (`/quiz/:sessionId`)
  - 객관식, OX, 단답형, 빈칸형, 서술형 지원
  - 일반 모드: 즉시 채점
  - 시험 모드: 전체 채점
  - 로딩 애니메이션 (순환 문구)
- 퀴즈 결과 (`/quiz/:sessionId/results`)
  - 점수 및 점수율
  - 세션 정보
  - 빠른 탐색 버튼

### 오답노트 (`/wrong-notes`)
- 정렬 옵션 (개념/날짜/문제)
- 필터링 (판정 결과, 오류 유형)
- 오답 상세 정보
- 재도전 버튼
- 페이지네이션

### 재도전 (`/retry`)
- 오답노트 기반 재도전
- 대시보드 추천 기반 재도전
- 문제 수 설정

### 검색 (`/search`)
- 하이브리드 검색 (키워드 + 벡터)
- 검색 범위 필터 (전체/자료/오답노트/퀴즈 기록)
- 결과 형식별 표시

### 관리자 (`/admin`)
- 마스터 비밀번호 인증
- 사용자 목록 조회
- 시스템 로그 조회
- 모델 사용량 조회
- 감사 로그 조회

## 설치 및 실행

### 로컬 개발

1. 의존성 설치:
```bash
cd frontend
npm install
```

2. 환경 변수 설정 (`.env`):
```env
VITE_API_URL=http://localhost:8000
```

3. 개발 서버 시작:
```bash
npm run dev
```

앱은 `http://localhost:5173`에서 실행됩니다.

### 빌드

```bash
npm run build
```

### Docker

```bash
# 빌드
docker build -t quiz-frontend .

# 실행
docker run -p 5173:80 quiz-frontend
```

## API 통합

모든 API 호출은 `src/api/`에 정의되어 있습니다:
- `auth.ts`: 인증 관련 API
- `files.ts`: 파일 관리 API
- `quiz.ts`: 퀴즈 관련 API
- `objections.ts`: 이의제기 API
- `wrongNotes.ts`: 오답노트 API
- `retry.ts`: 재도전 API
- `dashboard.ts`: 대시보드 API
- `search.ts`: 검색 API
- `admin.ts`: 관리자 API

JWT 토큰은 자동으로 요청 헤더에 포함되며, 만료 시 자동 갱신됩니다.

## 상태 관리

### Zustand Stores
- `authStore.ts`: 인증 상태 (사용자, 토큰, 가장 모드)
- `quizStore.ts`: 퀴즈 세션 상태 (현재 세션, 답안, 인덱스)

### TanStack Query
서버 상태는 TanStack Query로 관리하며 자동으로 캐싱 및 재요청을 처리합니다.

## 라우팅

### 공용 라우트 (로그인 필요 없음)
- `/login` - 로그인
- `/signup` - 회원가입
- `/password-reset` - 비밀번호 재설정

### 보호 라우트 (로그인 필요)
- `/` - 대시보드
- `/files` - 자료 관리
- `/quiz/new` - 퀴즈 생성
- `/quiz/:sessionId` - 퀴즈 풀이
- `/quiz/:sessionId/results` - 퀴즈 결과
- `/wrong-notes` - 오답노트
- `/retry` - 재도전
- `/search` - 검색

### 관리자 라우트
- `/admin` - 관리자 대시보드 (admin/super_admin만 접근 가능)

## 주요 컴포넌트

- `Layout`: 메인 레이아웃 (Navbar + Sidebar)
- `Navbar`: 네비게이션 바
- `Sidebar`: 사이드바 메뉴
- `Modal`: 재사용 가능한 모달
- `EmptyState`: 빈 상태 표시
- `StatusBadge`: 상태 뱃지
- `Pagination`: 페이지네이션
- `LoadingSpinner`: 로딩 스피너
- `AdminBanner`: 관리자 가장 모드 배너

## 규칙 및 정책

### No Source 경고
자료 없이 생성 시 경고 모달 표시:
- "자료 없이 생성된 문제는 정확도와 근거 신뢰도가 낮을 수 있습니다."
- 사용자 확인 체크박스 필수

### 관리자 가장 모드
- 화면 상단 "관리자 가장 모드" 배너 표시
- 대상 사용자 정보 및 종료 버튼
- 모든 작업은 감사 로그에 기록

### 파일 처리 상태
- uploaded → parsing → ocr_processing → embedding_processing → ready
- failed_partial, failed_terminal 시 재시도 가능

## 사용된 한국어 UI

모든 UI 텍스트는 한국어로 되어 있으며 PROMPT.md의 규격을 따릅니다.
