import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { guestApi } from '@/api/guestClient';
import { useGuestStore } from '@/stores/guestStore';

const INPUT_CLASS =
  'w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-secondary transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none';

type InputMode = 'topic' | 'text' | 'file';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: '쉬움' },
  { value: 'medium', label: '보통' },
  { value: 'hard', label: '어려움' },
];

const QUESTION_COUNT_OPTIONS = [3, 5] as const;

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg';
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function TryQuiz() {
  const navigate = useNavigate();
  const getOrCreateSessionId = useGuestStore((s) => s.getOrCreateSessionId);

  const [inputMode, setInputMode] = useState<InputMode>('topic');
  const [topic, setTopic] = useState('');
  const [manualText, setManualText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [questionCount, setQuestionCount] = useState<3 | 5>(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [turnstileToken, setTurnstileToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasInput =
    (inputMode === 'topic' && topic.trim().length > 0) ||
    (inputMode === 'text' && manualText.trim().length > 0) ||
    (inputMode === 'file' && files.length > 0);

  const canSubmit = hasInput && turnstileToken.length > 0 && !loading;

  const addFiles = useCallback((incoming: File[]) => {
    setFileError('');
    const combined = [...files];
    for (const f of incoming) {
      if (combined.length >= MAX_FILES) {
        setFileError(`최대 ${MAX_FILES}개의 파일만 업로드할 수 있습니다.`);
        break;
      }
      if (f.size > MAX_FILE_SIZE) {
        setFileError(`각 파일은 10MB 이하여야 합니다. (${f.name})`);
        break;
      }
      combined.push(f);
    }
    setFiles(combined);
  }, [files]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError('');
  };

  const pollUntilReady = async (sessionId: string): Promise<void> => {
    const POLL_INTERVAL = 2000;
    const TIMEOUT = 60_000;
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const tick = async () => {
        if (Date.now() - start > TIMEOUT) {
          reject(new Error('timeout'));
          return;
        }
        try {
          const session = await guestApi.getQuizSession(sessionId);
          if (session.status === 'ready') {
            resolve();
          } else if (session.status === 'generation_failed') {
            reject(new Error('generation_failed'));
          } else {
            setTimeout(tick, POLL_INTERVAL);
          }
        } catch {
          reject(new Error('network'));
        }
      };
      setTimeout(tick, POLL_INTERVAL);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    // Ensure guest session exists so the interceptor can attach the header
    getOrCreateSessionId();

    try {
      let selectedFileIds: string[] | undefined;

      if (inputMode === 'file' && files.length > 0) {
        const uploads = await Promise.all(
          files.map((f) => {
            const fd = new FormData();
            fd.append('file', f);
            return guestApi.uploadFile(fd);
          })
        );
        selectedFileIds = uploads.map((u) => u.file_id);
      }

      const payload: Parameters<typeof guestApi.createQuizSession>[0] = {
        question_count: questionCount,
        difficulty,
      };

      if (inputMode === 'topic') {
        payload.topic = topic.trim();
      } else if (inputMode === 'text') {
        payload.manual_text = manualText.trim();
      } else if (inputMode === 'file') {
        payload.selected_file_ids = selectedFileIds;
      }

      const { session_id } = await guestApi.createQuizSession(payload);

      await pollUntilReady(session_id);

      navigate(`/try/quiz/${session_id}`);
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } };
      const status = axiosError?.response?.status;
      const msg = (err as Error)?.message;

      if (status === 429) {
        setError(
          '오늘 무료 체험 횟수를 초과했습니다. 가입하면 더 많은 퀴즈를 만들 수 있습니다.'
        );
      } else if (msg === 'timeout') {
        setError('문제 생성 시간이 초과되었습니다. 다시 시도해주세요.');
      } else if (msg === 'generation_failed') {
        setError('문제 생성에 실패했습니다. 다시 시도해주세요.');
      } else if (msg === 'network' || status === undefined) {
        setError('요청에 실패했습니다. 다시 시도해주세요.');
      } else {
        setError('요청에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
        <Link to="/" className="text-xl font-bold tracking-tight text-content-primary">
          RetryNote
        </Link>
        <Link
          to="/login"
          className="text-sm font-semibold text-brand-300 hover:text-brand-400 transition-colors"
        >
          로그인
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-content-primary">
              무료로 퀴즈 만들기
            </h1>
            <p className="mt-2 text-base text-content-secondary">
              AI가 학습 자료를 분석해 맞춤형 문제를 만들어드립니다.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-white/[0.08] bg-surface p-6 md:p-8 space-y-6"
          >
            {/* Error box */}
            {error && (
              <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm leading-relaxed text-semantic-error">
                {error}
                {error.includes('초과했습니다') && (
                  <>
                    {' '}
                    <Link
                      to="/signup"
                      className="font-semibold underline underline-offset-2 hover:text-brand-300"
                    >
                      지금 가입하기
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* Input mode tabs */}
            <div className="flex gap-1 rounded-2xl border border-white/[0.08] bg-surface-deep p-1">
              {(
                [
                  { key: 'topic', label: '주제 입력' },
                  { key: 'text', label: '텍스트 붙여넣기' },
                  { key: 'file', label: '파일 업로드' },
                ] as { key: InputMode; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setInputMode(tab.key)}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                    inputMode === tab.key
                      ? 'bg-brand-500 text-brand-900'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {inputMode === 'topic' && (
              <div className="grid gap-2">
                <label htmlFor="topic-input" className="text-sm font-semibold text-content-primary">
                  학습 주제
                </label>
                <input
                  id="topic-input"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: Python 기초, 한국사 근대사"
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {inputMode === 'text' && (
              <div className="grid gap-2">
                <label htmlFor="text-input" className="text-sm font-semibold text-content-primary">
                  학습 자료
                </label>
                <textarea
                  id="text-input"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="학습 자료를 붙여넣으세요..."
                  rows={6}
                  className={`${INPUT_CLASS} min-h-40 resize-y`}
                />
              </div>
            )}

            {inputMode === 'file' && (
              <div className="grid gap-3">
                {/* Drop zone */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                    isDragging
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-white/[0.15] hover:border-white/[0.25] hover:bg-white/[0.02]'
                  }`}
                >
                  <p className="text-sm text-content-secondary">
                    파일을 드래그하거나 클릭하여 선택
                  </p>
                  <p className="mt-1 text-xs text-content-secondary/60">
                    PDF, DOCX, TXT, MD, PNG, JPG · 최대 3개 · 각 10MB 이하
                  </p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {/* File badges */}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-surface-deep px-3 py-1.5 text-xs font-medium text-content-primary"
                      >
                        {f.name}
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="ml-1 text-content-secondary hover:text-content-primary transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {fileError && (
                  <p className="text-sm text-semantic-error">{fileError}</p>
                )}
              </div>
            )}

            {/* Options row */}
            <div className="flex flex-wrap gap-6">
              {/* Question count */}
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-content-primary">문제 수</span>
                <div className="flex gap-2">
                  {QUESTION_COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuestionCount(n)}
                      className={`w-12 h-10 rounded-xl text-sm font-semibold border transition-colors ${
                        questionCount === n
                          ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
                          : 'bg-surface-deep text-content-secondary border-white/[0.08] hover:bg-white/[0.05]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-content-primary">난이도</span>
                <div className="flex gap-2">
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDifficulty(opt.value)}
                      className={`px-3 h-10 rounded-xl text-sm font-semibold border transition-colors ${
                        difficulty === opt.value
                          ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
                          : 'bg-surface-deep text-content-secondary border-white/[0.08] hover:bg-white/[0.05]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Turnstile */}
            <Turnstile
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken('')}
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading}
              aria-label={loading ? 'AI가 문제를 만들고 있습니다' : '문제 만들기'}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-content-inverse transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  AI가 문제를 만들고 있습니다...
                </>
              ) : (
                '문제 만들기'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
