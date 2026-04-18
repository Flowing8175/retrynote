너는 시니어 풀스택 구현 에이전트다. 지금부터 "오답DB 기반 AI 퀴즈 웹앱"의 P0 범위를 실제로 구현하라. 임의 추정은 금지하며, 아래 명세만을 기준으로 설계/구현/수정한다. 명세에 없는 동작은 추가하지 말고, 모호한 항목은 다음 우선순위로 해석하라: 동일 파트 내 규칙 > 공통 원칙 > 보안 우선. 자유형 AI 출력은 저장/집계 대상으로 사용하지 말고, 상태 전이를 우회하는 직접 수정은 허용하지 마라. 관리자 예외 권한은 반드시 감사 가능해야 하며, 사용자에게 보이는 결과와 내부 통계는 항상 동일한 active result 기준으로 계산하라.

# 0. 최종 목표
개인 1인 사용자를 기본으로 하는 웹앱을 구현한다.
사용자는 자료를 업로드하거나 텍스트를 입력해 AI 퀴즈를 만들고, 일반 모드 또는 시험 모드로 풀고, 채점 결과와 오답DB를 누적하며, 재도전 문제와 대시보드를 통해 약점을 학습한다.
관리자는 관리자 페이지와 가장 모드로 운영/디버깅을 수행하되, 모든 조회/수정은 감사 로그에 남아야 한다.

# 1. 이번 버전(P0) 구현 범위
반드시 구현:
- 회원가입 / 로그인 / 비밀번호 재설정
- 자료 업로드 및 관리
- 자료 기반 퀴즈 생성
- 자료 없이 퀴즈 생성
- 일반 모드 퀴즈 풀이
- 시험 모드 퀴즈 풀이
- 객관식 / OX / 단답형 / 빈칸형 / 서술형 채점
- 오답DB 저장
- 오답노트 조회
- 재도전 문제 생성
- 기본 대시보드
- 관리자 페이지
- 관리자 가장 모드
- 통합 검색 기본형
- 파일 처리, 생성, 채점 상태 표시

이번 버전에서 제외:
- 모바일 UI 최적화
- 음성 입력
- 유튜브 입력
- 일정 기반 시험 대비 계획
- 알림 기능
- 모델별 품질 비교 모드
- 사용자별 저장공간 요금제

# 2. 핵심 원칙
- 기본 사용자는 개인 1인 사용자다.
- 자료 기반 생성이 기본이며, 자료 없는 생성은 저신뢰 모드로 구분한다.
- 정답/부분정답/오답/건너뜀을 모두 저장한다.
- 문제 생성, 채점, 이의제기 판단은 AI를 사용하되 반드시 구조화된 JSON 출력만 허용한다.
- 사용자 데이터는 기본적으로 사용자 본인만 접근 가능하다.
- 관리자 가장 모드는 예외적 운영 수단이며 모든 조회/수정은 감사 로그에 남긴다.
- 동일 개념 반복 출제는 제한하고, 재도전은 같은 문장을 다시 보여주지 말고 같은 개념을 다른 표현으로 재구성한다.

# 3. 자료 없이 생성(no_source) 정책
- 생성 시작 전 경고 모달 표시 필수
- 경고 문구: "자료 없이 생성된 문제는 정확도와 근거 신뢰도가 낮을 수 있습니다."
- 사용자 확인 체크박스 필수
- 동의하지 않으면 생성 시작 금지
- 저장 시 source_mode = no_source
- no_source 문제는 대시보드/통계에서 자료 기반 문제와 구분 가능해야 함

# 4. 역할과 권한
## user
- 자신의 자료 업로드/삭제
- 자신의 퀴즈 생성/풀이/이의제기
- 자신의 오답노트/대시보드 조회
- 자신의 오답 분류 일부 수정 가능

## admin
- 관리자 페이지 접근
- 사용자 목록 조회
- 시스템 로그 조회
- 모델 사용량 조회
- 공지/배너 조회
- 가장 모드 진입
- 잘못 채점된 문항 재판정 요청
- 사용자 원본 데이터 임의 직접 변경 권한 없음

## super_admin
- admin 권한 포함
- 모델 설정 변경
- 공지/배너 발행
- 관리자 설정 변경
- 가장 모드에서 제한된 수정 액션 가능
- 운영 복구 목적 메타데이터 수정 가능

## 권한 원칙
- 일반 사용자는 자기 데이터만 접근 가능
- 관리자는 가장 모드에서만 타 사용자 데이터 예외 접근 가능
- 가장 모드 접근은 최소 권한 원칙
- 민감한 관리 작업은 일반 로그인 외 재인증 필요

# 5. 관리자 가장 모드 정책
## 허용 액션
- 사용자 자료 목록 조회
- 사용자 퀴즈 세션 조회
- 사용자 오답노트 조회
- 사용자 화면과 유사한 디버깅 UI 조회
- 잘못 채점된 문항의 재판정 트리거

## 금지 액션
- 사용자 비밀번호 변경
- 사용자 대신 문제 제출
- 사용자 데이터 일괄 삭제
- 원본 로그 삭제
- 감사 로그 우회

## 제한 액션
다음은 super_admin만 가능하며 사유 입력 필수:
- 특정 문항 판정 보정
- 파일 메타데이터 복구 수정
- 잘못된 분류 태그 수정

## UI 규칙
- 화면 상단에 항상 "관리자 가장 모드" 배너 표시
- 현재 가장 대상 사용자 식별값 + 종료 버튼 표시

## 감사 로그
가장 모드 진입/조회/수정/종료를 모두 admin_audit_logs에 남긴다.
필수 필드:
- admin_user_id
- target_user_id
- action_type
- target_type
- target_id
- reason
- created_at
- ip_address

## 관리자 추가 인증
- 관리자 페이지 진입 시 일반 로그인 외 마스터 비밀번호 요구
- 마스터 비밀번호는 해시 저장
- 다음 작업 전 관리자 재인증 필요:
  - 모델 변경
  - 가장 모드 제한 액션
  - 공지 발행
  - 운영 설정 변경
- 관리자 세션 만료 시간은 일반 사용자보다 짧아야 함

# 6. 핵심 사용자 흐름
1. 회원가입
2. 로그인
3. 자료 업로드 또는 텍스트 입력
4. 자료 처리 상태 확인
5. 퀴즈 생성 조건 설정
6. 퀴즈 풀이
7. 채점 결과 확인
8. 오답노트 저장 및 조회
9. 재도전 문제 풀이
10. 대시보드에서 학습 현황 확인

# 7. 빈 상태 / 로딩 / 실패 / 모드 규칙
## 빈 상태
대시보드:
- "아직 학습 기록이 없습니다. 자료를 업로드하고 첫 퀴즈를 만들어 보세요."
- 버튼: "자료 업로드", "바로 퀴즈 만들기"

자료함:
- "업로드한 자료가 없습니다."
- 버튼: "파일 업로드", "웹페이지 링크 추가"

오답노트:
- "아직 오답노트가 없습니다."
- 버튼: "첫 퀴즈 풀기"

검색:
- "검색할 자료나 기록이 없습니다."

## 파일 처리 단계 표시
- 업로드 완료
- 파싱 중
- OCR 중
- 임베딩 중
- 준비 완료
- 부분 실패
- 실패

## 퀴즈 생성 로딩
- 원통형 로딩 애니메이션
- 순환 가능 문구:
  - 자료 분석 중
  - 개념 추출 중
  - 문제 생성 중
  - 형식 검증 중

## 채점 로딩
- 일반 모드: 문제 단건 단위 로딩
- 시험 모드: 전체 채점 진행률 표시

## 실패 상태
파일 처리 실패:
- 실패 단계와 사유 표시
- 재시도 버튼
- 예시: "문서 처리에 실패했습니다. 파일 형식을 확인하거나 다시 시도해 주세요."

문제 생성 실패:
- 전체 실패와 부분 성공 구분
- 전체 실패 시 세션 상태 generation_failed 저장
- 예시: "문제 생성에 실패했습니다. 잠시 후 다시 시도해 주세요."

채점 실패:
- 실패 범위를 문항 단위로 표시 가능
- 시험 모드 일부 실패 문항은 grading_pending 유지

## 일반 모드
- 제출 즉시 채점
- 정답/해설 즉시 표시
- 다음 문제로 이동 가능
- 답안 저장 즉시 기록 반영

## 시험 모드
- 최종 제출 전까지 정답/해설 숨김
- 최종 제출 전까지 답안 수정 가능
- 자동 임시저장 지원
- 최종 제출 후 전체 채점 시작
- 제출 후 문항 읽기 전용

## 임시저장/복귀
- 시험 모드는 자동 임시저장
- 브라우저 이탈 후 마지막 저장 상태 복귀 가능
- 일반 모드는 문항 단위 제출 즉시 저장이므로 별도 임시저장 없음

## 화면 성능
- 화면 밖 요소는 가상화 또는 지연 렌더링
- 긴 오답노트/자료 목록/검색 결과/로그 목록은 무한 스크롤 또는 페이지네이션
- 퀴즈 풀이 화면은 현재 문항과 인접 문항 우선 렌더링 가능

# 8. 상태 전이 명세
## files.status
- uploaded
- parsing
- parsed
- ocr_pending
- ocr_processing
- embedding_pending
- embedding_processing
- ready
- failed_partial
- failed_terminal
- deleted

전이 규칙:
- 업로드 성공 -> uploaded
- 파싱 시작 -> parsing
- 파싱 성공 -> parsed
- OCR 필요 -> ocr_pending, 필요 없으면 embedding_pending
- OCR 시작 -> ocr_processing
- 임베딩 시작 -> embedding_processing
- 전체 처리 성공 -> ready
- 일부 실패지만 제한적 사용 가능 -> failed_partial
- 핵심 단계 실패로 사용 불가 -> failed_terminal
- 삭제 요청 처리 후 -> deleted

재시도:
- failed_partial, failed_terminal 재시도 가능
- retry_count 저장
- 최대 횟수 초과 시 관리자 확인 필요

## quiz_sessions.status
- draft
- generating
- ready
- in_progress
- submitted
- grading
- graded
- objection_pending
- regraded
- closed
- generation_failed

전이 규칙:
- 생성 요청 -> draft
- 생성 작업 시작 -> generating
- 문제 생성 완료 -> ready
- 풀이 시작 -> in_progress
- 시험 모드 최종 제출 또는 일반 모드 전체 완료 -> submitted
- 채점 시작 -> grading
- 채점 완료 -> graded
- 이의제기 등록 -> objection_pending
- 재판정 적용 완료 -> regraded
- 세션 종료 -> closed
- 생성 실패 -> generation_failed

## quiz_items.user_status
- unseen
- viewed
- answered
- skipped
- graded
- objection_pending
- regraded

## objections.status
- submitted
- under_review
- upheld
- rejected
- partially_upheld
- applied

## 제출 중복 방지
- 시험 모드 최종 제출 API는 idempotency key 필수
- 동일 세션의 최종 제출은 1회만 성공
- 중복 제출 요청 시 기존 결과 반환

# 9. 데이터 모델
적용 가능한 엔티티 공통 필드:
- id
- created_at
- updated_at
- deleted_at
- status
- version
- created_by
- updated_by

## users
- id
- username (unique)
- email (unique)
- password_hash
- role: user | admin | super_admin
- storage_used_bytes
- storage_quota_bytes
- is_active
- last_login_at

## admin_settings
- id
- active_generation_model
- active_grading_model
- fallback_generation_model
- fallback_grading_model
- max_upload_total_mb
- daily_quiz_generation_limit
- daily_ocr_page_limit
- banner_enabled
- banner_message
- updated_at
- updated_by

## folders
- id
- user_id
- name
- parent_folder_id
- sort_order
- auto_classified

## files
- id
- user_id
- folder_id
- original_filename
- stored_path
- file_type
- file_size_bytes
- source_type: upload | url | manual_text
- source_url
- status
- parse_error_code
- ocr_required
- retry_count
- content_hash
- is_searchable
- is_quiz_eligible
- processing_started_at
- processing_finished_at

삭제 정책:
- 사용자 삭제 요청 시 soft delete 후 비동기 정리 가능
- 최종 삭제 시 parsed_documents, document_chunks, embeddings, 미리보기 캐시, 검색 인덱스 메타데이터 삭제

## parsed_documents
- id
- file_id
- raw_text
- normalized_text
- language
- page_count
- parser_name
- parser_version
- ocr_applied
- parse_confidence

## document_chunks
- id
- file_id
- parsed_document_id
- chunk_index
- text
- token_count
- page_from
- page_to
- embedding_status
- embedding_model
- vector_id
- is_active

인덱스:
- (file_id, chunk_index)
- vector index
- full-text index

## quiz_sessions
- id
- user_id
- mode: normal | exam
- source_mode: document_based | no_source
- status
- difficulty
- question_count
- generation_priority
- generation_model_name
- grading_model_name
- started_at
- submitted_at
- graded_at
- total_score
- max_score
- idempotency_key

## quiz_session_files
- id
- quiz_session_id
- file_id

## quiz_items
- id
- quiz_session_id
- item_order
- question_type
- question_text
- options_json
- correct_answer_json
- explanation_text
- source_refs_json
- concept_key
- concept_label
- category_tag
- difficulty
- similarity_fingerprint
- generation_trace_id

## answer_logs
- id
- quiz_item_id
- quiz_session_id
- user_id
- user_answer_raw
- user_answer_normalized
- judgement: correct | partial | incorrect | skipped
- score_awarded
- max_score
- grading_confidence
- grading_rationale
- missing_points_json
- error_type
- is_active_result
- graded_at
- regraded_from_answer_log_id

## objections
- id
- user_id
- quiz_session_id
- quiz_item_id
- answer_log_id
- objection_reason
- objection_payload_json
- status
- review_result_json
- decided_at
- decided_by: ai | admin

## weak_points
- id
- user_id
- concept_key
- concept_label
- category_tag
- wrong_count
- partial_count
- skip_count
- last_wrong_at
- streak_wrong_count
- recommended_action

## dashboard_snapshots
- id
- user_id
- snapshot_date
- range_type: 7d | 30d | all
- payload_json
- generated_at

## system_logs
- id
- level
- service_name
- event_type
- message
- meta_json
- trace_id
- created_at

## admin_audit_logs
- id
- admin_user_id
- target_user_id
- action_type
- target_type
- target_id
- reason
- payload_json
- ip_address
- created_at

## announcements
- id
- title
- body
- is_active
- starts_at
- ends_at
- created_by

## 정규화 필드 정책
concept_key:
- 내부 집계용 canonical key
- 공백/대소문자/표기 차이에 영향받지 않는 정규화 문자열
- 예: 사회복지실천기술_면담기법

concept_label:
- 사용자 표시용 라벨
- 예: 사회복지실천기술 - 면담기법

category_tag:
- 상위 분류용 태그
- 자유 문자열 금지, 제한된 taxonomy 사용

error_type enum:
- concept_confusion
- missing_keyword
- expression_mismatch
- careless_mistake
- ambiguous_question
- insufficient_source
- reasoning_error
- no_response

# 10. API 계약
모든 API는 인증 필요. 관리자 API는 role 검사 필요.
장기 작업은 동기 처리하지 말고 job 기반 비동기 처리.
장기 작업 응답은 job_id, status, polling_url 포함.
생성/제출 관련 API는 idempotency key 지원.

## 인증 API
POST /auth/signup
입력: username, email, password
출력: user_id, username, created_at

POST /auth/login
입력: username_or_email, password
출력: access_token 또는 session 정보, user profile

POST /auth/password/reset/request
입력: email
출력: accepted

POST /auth/password/reset/confirm
입력: token, new_password
출력: success

## 파일 API
POST /files
입력: file binary 또는 manual_text 또는 source_url, folder_id nullable
출력: file_id, status, job_id nullable

GET /files
출력: 파일 목록, status, folder 정보

GET /files/{file_id}
출력: 파일 메타데이터, 처리 상태, 오류 정보

POST /files/{file_id}/retry
출력: job_id, status

DELETE /files/{file_id}
출력: success

## 퀴즈 생성 API
POST /quiz-sessions
입력:
- mode: normal | exam
- selected_file_ids: array
- manual_text: nullable
- question_count
- difficulty
- question_types: array
- generation_priority
- source_mode: document_based | no_source
- idempotency_key
출력:
- quiz_session_id
- status: draft or generating
- job_id

GET /quiz-sessions/{session_id}
출력:
- session metadata
- items summary
- current status

GET /quiz-sessions/{session_id}/items
출력:
- quiz items array

## 답안 제출 API
POST /quiz-sessions/{session_id}/items/{item_id}/answer
일반 모드용
입력: user_answer
출력: answer_log, grading result, next_item_hint

POST /quiz-sessions/{session_id}/draft-answer
시험 모드 임시저장용
입력: item_id, user_answer
출력: saved_at

POST /quiz-sessions/{session_id}/submit
시험 모드 최종 제출용
입력: idempotency_key
출력: status(submitted 또는 grading), job_id

## 이의제기 API
POST /quiz-sessions/{session_id}/items/{item_id}/objections
입력: answer_log_id, objection_reason
출력: objection_id, status

GET /objections/{objection_id}
출력: objection detail, review result if available

## 오답노트 API
GET /wrong-notes
쿼리:
- sort: concept | date | question
- judgement filter
- error_type filter
- file_id filter
- category_tag filter
- page
- size
출력: wrong note list, pagination

## 재도전 API
POST /retry-sets
입력:
- source: wrong_notes | dashboard_recommendation | concept_manual
- concept_keys array nullable
- size
출력: quiz_session_id, job_id

## 대시보드 API
GET /dashboard
쿼리:
- range: 7d | 30d | all
- file_id nullable
- category_tag nullable
출력:
- overall_accuracy
- score_rate
- learning_volume
- weak_concepts
- accuracy_by_type
- accuracy_by_subject
- accuracy_by_file
- retry_recommendations
- recent_wrong_notes
- coaching_summary

## 검색 API
GET /search
쿼리:
- q
- scope: all | files | wrong_notes | quiz_history
- file_id nullable
- folder_id nullable
- page
- size
출력:
- results array
- result_type
- highlights
- source metadata

## 관리자 API
POST /admin/login/verify-master
입력: master_password
출력: verified

GET /admin/users
출력: user list, storage usage

GET /admin/logs
출력: system log list

GET /admin/model-usage
출력: token usage, request count, provider stats

POST /admin/impersonation/start
입력: target_user_id, reason
출력: impersonation session info

POST /admin/quiz-items/{item_id}/regrade
입력: reason
출력: regrade job id

POST /admin/settings/models
입력:
- active_generation_model
- active_grading_model
- fallback_generation_model
- fallback_grading_model
출력: updated settings

# 11. 파일 처리 / OCR / 검색 / RAG 정책
## 지원 입력
- PDF
- DOCX
- PPTX
- TXT
- Markdown
- PNG
- JPG
- 웹페이지 링크
- 직접 입력 텍스트

## 제외 입력
- 유튜브 링크
- 음성 파일
- 암호화된 문서
- 로그인 필요 페이지 전체 크롤링

## 파일별 처리
PDF:
- 텍스트 추출 우선
- 텍스트 추출이 불충분한 페이지에만 OCR
- 스캔 PDF는 OCR 대상

DOCX / PPTX:
- 본문 텍스트 우선 추출
- 표/노트/슬라이드 텍스트는 가능한 범위에서 추출
- 시각 배치 정보는 보존 대상 아님

TXT / Markdown:
- 원문 그대로 저장
- Markdown은 마크업 제거한 normalized_text 추가 저장

PNG / JPG:
- OCR 기반 텍스트 추출
- low confidence 결과는 정확도 낮음 플래그 부여

웹페이지 링크:
- 단일 URL 본문 텍스트 추출만 지원
- 사이트 전체 크롤링 금지
- 로그인/403/robots 차단 페이지는 실패 처리
- 동적 렌더링 기본 비지원

## OCR 정책
- OCR 대상: 이미지 파일 + 텍스트 추출이 불충분한 PDF 페이지
- confidence 기준치 미만이면 failed_partial 가능
- OCR 실패 시 원본은 유지하고 사용자에게 정확도 경고 표시

## 청크 분할
- 의미 단위 우선, 길이 기준 보조
- 너무 짧거나 너무 길지 않은 고정 길이 범위
- overlap 유지
- 각 청크는 원본 파일과 페이지 범위 추적 가능해야 함

## 임베딩 / 검색
- vector + keyword hybrid 검색
- 검색 결과에는 반드시 source reference 포함
- 삭제/비활성 파일 청크는 검색 제외
- 재업로드/수정 시 새 버전 ready 전까지 기존 active index 유지
- 새 버전 ready 후 이전 active chunk 비활성화, 새 chunk 활성화

## 생성/RAG 검색 조건
문제 생성 시 검색 결과는:
- 같은 사용자 소유 자료만 검색
- ready 또는 제한적으로 failed_partial 상태이면서 quiz eligible 자료만 사용
- 문제마다 source_refs 저장
- 근거 부족 시 문제 생성 금지 또는 저신뢰 표기

## 파일 삭제/수정
- 파일 삭제 시 원본 파일, 파싱 텍스트, 청크, 임베딩, 검색 인덱스 메타데이터, 미리보기 캐시 모두 삭제 대상으로 표시
- 실제 물리 삭제는 비동기 정리 작업 가능
- 삭제된 파일은 검색 결과와 문제 생성 대상에서 즉시 제외

# 12. AI 생성 / 채점 / 이의제기 정책
## 공통
- AI 출력은 자유 텍스트 금지, 구조화된 JSON만 허용
- 생성 / 채점 / 이의제기 판단은 서로 다른 작업 타입
- 작업별 timeout, retry, fallback 기준 유지
- 세션 생성 시 사용 모델명은 quiz_sessions에 고정 저장
- 관리자 설정 변경은 이후 신규 세션부터 적용

## 문제 생성 입력
- selected sources
- question count
- difficulty
- question types
- generation priority
- recent attempt history
- similarity avoidance rules

## 문제 생성 제한
- 자료 기반 생성이면 반드시 자료 우선 사용
- 근거 부족 시 문제 생성 금지
- 동일 concept_key는 최근 3회까지만 허용
- 동일 concept_key가 최근 3회 내 이미 출제되었으면 다음 출제는 question_type 중복 금지
- 4회째부터 semantic similarity threshold 초과 문항 금지
- source_mode = no_source이면 source_refs를 빈 배열로 둔다

## 문제 생성 출력 스키마
각 문항 최소 필드:
- question_type
- question_text
- options
- correct_answer
- explanation
- concept_key
- concept_label
- category_tag
- difficulty
- source_refs

## 채점 우선순위
1. 규칙 기반 정규화
2. 허용답안 매칭
3. AI 보조 판단

## 유형별 채점
객관식 / OX:
- 규칙 기반 즉시 판단
- AI는 설명 생성 보조만 허용 가능

단답형 / 빈칸형:
- 정규화 후 허용답안 매칭
- 경계 사례만 AI 판단

서술형:
- AI 중심 평가
- 단, source_refs와 rubric 기반 평가를 우선

## 정규화 규칙
- 앞뒤 공백 제거
- 연속 공백 축소
- 대소문자 정규화
- 한글/영문 기호 표준화
- 불필요한 문장부호 제거
- 복수 정답인 경우 순서 민감 여부 문항별 명시

## 점수 정책
- 정답: 1.0
- 부분정답: 0.5
- 오답: 0.0
- 건너뜀: 0.0
- 기본 max_score: 1.0

## 채점 출력 스키마
각 채점 결과 최소 필드:
- judgement: correct | partial | incorrect | skipped
- score_awarded
- max_score
- normalized_user_answer
- accepted_answers
- grading_confidence
- grading_rationale
- missing_points
- error_type
- suggested_feedback

## 부분정답 규칙
- 핵심 개념은 맞았으나 필수 요소 일부 누락
- 방향성은 맞으나 표현이 불충분
- 서술형에서 핵심 포인트 일부만 충족
- 통계에서는 정답과 분리하여 별도 버킷 집계

## 이의제기
- 사용자는 각 채점 결과에 대해 이의제기 가능
- 원판정과 독립된 검토 작업으로 처리
- 보수적으로 판단
- 근거 부족 시 기존 판정 유지

이의제기 출력 스키마:
- decision: upheld | rejected | partially_upheld
- reasoning
- updated_judgement
- updated_score_awarded
- updated_error_type
- should_apply

## 재판정 적용
- 기존 answer_logs는 immutable log로 보존
- 승인 시 새 answer_logs 레코드 추가
- 이전 active result 비활성화
- 통계와 weak_points는 최신 active result 기준 재계산

## 실패 처리
- 생성/채점/이의제기 검토는 작업별 timeout 보유
- 일시 실패는 최대 2회 재시도
- 반복 실패 시 fallback 모델 사용 가능
- 사용자에게 재시도 가능 여부와 상태를 명확히 표시

# 13. 오답DB / 재도전 / 추천 정책
## 저장 대상
- 정답
- 부분정답
- 오답
- 건너뜀

## 저장 항목
- 문제 본문
- 문제 유형
- 보기
- 정답
- 사용자 답안
- 정규화 답안
- 판정 결과
- 점수
- 해설
- concept_key
- concept_label
- category_tag
- error_type
- 생성 시각
- 채점 시각
- 자료 출처 메타데이터
- 관련 자료 ID

## 오답노트 기본 정렬
- 기본: 개념 중심
- 변경 가능: 날짜 중심, 문제 중심

## 오답노트 표시 요소
- 문제
- 틀린 이유 한 줄
- 사용자 답
- 정답 또는 모범답안
- 빠진 핵심 요소
- 관련 개념 태그
- 재도전 버튼

## 오답 분류 수정 정책
사용자 수정 가능:
- error_type
- careless_mistake로 변경 가능
- no_response 수정 가능
- 기타 항목은 제한 또는 관리자 검토 필요

관리자 수정:
- 가장 모드에서 가능
- 수정 사유 기록 필수
- 원래 분류와 수정 분류 모두 로그 기록

## 재도전 문제 생성
- 동일 concept_key 기준
- 최근 3회 내 question_type 중복 회피
- 같은 문장 반복 금지
- semantic similarity threshold 초과 금지
- 반복 오답 concept는 힌트 강화 가능

## 재도전 추천 우선순위
1. 최근 틀린 개념
2. 누적 오답 많은 개념
3. 부분정답이 반복된 개념
4. 건너뜀이 많은 개념
5. 장기간 재도전하지 않은 취약 개념

# 14. 대시보드 / 통계 / 집계 정책
## 레이아웃
좌측:
- 오늘 할 일
- 재도전 추천
- 최근 오답 요약
- 빠른 시작

우측:
- 성과 지표
- 추이 그래프
- 필터
- 최근 활동

## 필수 지표
- 전체 정답률
- 점수율
- 최근 7일 / 30일 / 전체 학습량
- 취약 개념 TOP N
- 문제 유형별 정답률
- 과목별 정확도
- 자료별 정확도
- 재도전 추천 세트
- 최근 오답노트
- 코칭 문구 요약

## 지표 정의
정답률:
- correct / (correct + partial + incorrect + skipped)

점수율:
- 획득 점수 총합 / 최대 점수 총합

학습량:
- 제출된 문제 수 기준

취약 개념:
- wrong_count + partial_count + skip_count + streak_wrong_count의 가중 조합

## 필터
- 기간: 이번주 / 한달 / 전체
- 추가: 과목별 / 자료별
- 기간 계산은 사용자 로컬 타임존 기준 일 단위 집계

## 집계
- 핵심 KPI는 실시간 집계 가능해야 함
- 비용 큰 추천 요약/코칭 문구는 snapshot 또는 배치 계산 가능
- 재채점 적용 시 관련 범위 통계 재계산

## dashboard_snapshots
- 무거운 추천/요약 캐시 용도
- 정답률/점수율/최근 활동은 실시간 조회 가능해야 함

# 15. 통합 검색 정책
## 검색 범위
- 전체 자료
- 폴더
- 과목
- 오답노트
- 문제 기록

## 검색 대상
- 원본 파일 메타데이터
- 파싱 텍스트
- 청크 텍스트
- concept_key
- concept_label
- error_type
- 문제 본문
- 해설

## 검색 방식
- hybrid 검색(keyword + vector)
- 결과는 관련도 기준 정렬
- 결과 유형별 카드 UI 사용

## 검색 결과 규칙
각 결과 포함:
- result_type
- title
- snippet 또는 highlight
- source metadata
- 관련 파일/문항/오답 링크

## 권한 필터
- 사용자 검색은 자기 데이터만
- 관리자 검색은 가장 모드 또는 관리자 화면 정책에 따른 범위만

# 16. 관리자 기능
## 사용자 목록 조회 표시 항목
- user_id
- username
- email
- 가입일
- 저장 용량
- 최근 활동 시각
- 활성 상태

## 에러 로그 필터
- 기간
- level
- service_name
- event_type

## 모델 사용량 표시 항목
- 모델명
- 요청 수
- 입력 토큰
- 출력 토큰
- 실패율
- fallback 사용 횟수

## 공지/배너 관리
- 배너 노출 여부
- 제목
- 본문
- 시작 시각
- 종료 시각

## 잘못 채점된 문항 처리
- 직접 덮어쓰기보다 재판정 트리거 우선
- 직접 보정은 super_admin만 가능
- 보정 시 원판정과 보정값 모두 로그 기록

# 17. 보안 / 개인정보 / 세션 정책
- 비밀번호 해시 저장 필수, 평문 저장 금지
- 재설정 토큰은 단기 만료
- 일반 사용자 세션과 관리자 세션 분리
- 관리자 세션은 짧은 만료 시간 적용
- 민감 작업 전 재인증 필요
- 파일은 소유자만 다운로드 가능
- 관리자 다운로드는 가장 모드 정책 + 별도 권한 확인 필요
- 로그에는 최소한의 사용자 식별정보만 저장
- 민감한 본문은 운영 로그에 그대로 남기지 말 것

계정 삭제 시 삭제 대상:
- 원본 파일
- 파싱 텍스트
- 청크
- 임베딩
- 퀴즈 기록
- 답안 기록
- 오답노트 관련 데이터
- 대시보드 snapshot
- 사용자 관련 관리자 참조용 메타데이터

단, 감사 로그와 시스템 운영 로그는 법적/운영상 필요한 최소 범위만 보존 가능

# 18. 운영 / 로그 / 비용 / 성능 정책
## 로그 보관
- 에러 로그: 30~60일
- API 메타로그: 14~30일
- 관리자 작업 로그: 90일
- 학습 기록/오답DB: 장기 보관

## 로그 이벤트 필수 필드
- event_type
- actor_id
- actor_role
- target_type
- target_id
- status
- trace_id
- message
- meta_json
- created_at

## 비용 통제
- 사용자별 일일 문제 생성 횟수 제한
- 사용자별 일일 OCR 페이지 수 제한
- 파일 크기 제한 적용
- 관리자에게 모델 실패율 및 사용량 경고 표시

## 성능
- 파싱, OCR, 임베딩, 문제 생성, 시험 모드 일괄 채점은 비동기 worker 처리
- 사용자당 동시 생성 작업 수 제한 가능
- 화면 밖 비가시 요소 렌더링 최소화
- 검색 결과, 로그 목록, 자료 목록은 페이지네이션 또는 가상화 적용

## 백업
- 수동 백업 버튼 제공
- 자동 풀백업은 기본 비활성
- DB와 파일 스토리지 백업 분리 가능
- 복구 테스트 가능한 형식 유지

# 19. 테스트 및 완료 기준
## 기능 완료 기준
각 기능은 다음을 만족해야 한다.
- API 명세에 맞는 request/response 반환
- 상태 전이가 명세와 일치
- 권한 검사 통과
- 오류 상태와 재시도 흐름 동작
- 로그가 남아야 하는 작업은 로그 기록

## 핵심 E2E 시나리오
- 회원가입 → 로그인 → 파일 업로드 → 처리 완료 → 퀴즈 생성 → 일반 모드 풀이 → 채점 → 오답노트 확인
- 시험 모드 생성 → 임시저장 → 복귀 → 최종 제출 → 일괄 채점 → 결과 확인
- 오답노트에서 재도전 생성 → 재도전 풀이 → 대시보드 반영
- 채점 결과 이의제기 → 재판정 → 통계 재반영
- 관리자 로그인 → 마스터 검증 → 가장 모드 진입 → 조회 → 재판정 트리거 → 감사 로그 확인

## AI 품질 기준
- 생성 결과는 구조화된 스키마 준수
- source 기반 문제는 source_refs 누락률 낮아야 함
- 중복 출제 제한 규칙 위반 금지
- 채점 결과의 judgement와 score_awarded는 스키마 일치
- 재도전 문제는 같은 문장 반복률 낮아야 함

## 회귀 테스트 우선 영역
- 세션 상태 전이
- 시험 모드 제출
- 재채점 후 active result 갱신
- 파일 삭제 후 검색 제외
- 관리자 가장 모드 감사 로그

# 20. 구현 지침
- 현재 저장소의 기술 스택과 구조를 먼저 파악하고, 가능한 한 기존 패턴을 유지해 구현하라.
- 저장소가 비어 있거나 핵심 구조가 없으면, 위 명세를 충족하는 최소한의 합리적 구조를 생성하되 사용자 기능은 명세 범위를 넘기지 마라.
- 프론트엔드, 백엔드, DB, 비동기 worker, 관리자 기능, 테스트를 한 번에 연결되는 형태로 구현하라.
- API, DB 스키마, 상태 전이, 권한, 감사 로그, 검색, AI structured output 검증 로직을 서로 일관되게 맞춰라.
- AI 출력은 반드시 JSON schema 검증을 거쳐 저장하라.
- answer_logs는 immutable하게 유지하고 active result 개념으로 재채점을 반영하라.
- 검색은 hybrid(keyword + vector) 구조를 적용하되, 삭제/비활성 자료는 검색과 생성에서 즉시 제외하라.
- 시험 모드 submit은 idempotency key 기반으로 중복 제출 방지하라.
- 가장 모드의 모든 행위는 admin_audit_logs에 남겨라.
- 사용자 데이터 접근 제어는 서버 측에서 강제하라. 프론트 UI 제한만으로 처리하지 마라.
- 장기 작업은 job 기반 비동기 처리로 구현하고 상태 polling이 가능해야 한다.

# 21. 산출물 요구사항
작업을 수행할 때 다음을 제공하라.
1. 구현한 파일 목록
2. DB 스키마/마이그레이션
3. API 구현
4. 프론트 UI 구현
5. worker / queue / background job 구현
6. AI prompt 및 structured output validator 구현
7. 권한/보안/감사 로그 구현
8. 테스트 코드(E2E + 핵심 회귀 테스트)
9. 실행 방법
10. 아직 남은 리스크나 TODO가 있다면 명세 기준으로만 짧게 정리

중요:
- 나에게 확인 질문을 남발하지 말고, 명세에 따라 바로 구현하라.
- 명세에 없는 기능을 멋대로 추가하지 마라.
- 설명보다 실제 동작하는 결과물을 우선하라.
