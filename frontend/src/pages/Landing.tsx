import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '⚡',
    title: '즉시 문제 생성',
    body: '주제만 입력하면 AI가 핵심 개념 문제 4개를 바로 만들어줍니다.',
  },
  {
    icon: '🎯',
    title: '오답 자동 추적',
    body: '틀린 문제는 오답노트에 자동 저장되어 약점을 집중 공략합니다.',
  },
  {
    icon: '🔁',
    title: '재도전 추천',
    body: '취약한 개념을 AI가 분석해 최적의 재도전 문제를 추천합니다.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[oklch(0.15_0.01_250)] text-[oklch(0.92_0.01_250)] flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[oklch(0.28_0.01_250)]">
        <span className="text-xl font-semibold tracking-tight text-[oklch(0.65_0.15_175)]">
          RetryNote
        </span>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-sm text-[oklch(0.70_0.01_250)] hover:text-[oklch(0.92_0.01_250)] transition-colors"
          >
            로그인
          </Link>
          <Link
            to="/signup"
            className="text-sm px-4 py-2 rounded-xl border border-[oklch(0.65_0.15_175)] text-[oklch(0.65_0.15_175)] hover:bg-[oklch(0.65_0.15_175)]/10 transition-colors"
          >
            회원가입
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-sm font-medium tracking-widest uppercase text-[oklch(0.65_0.15_175)] mb-6">
          AI 퀴즈 생성 · 오답 분석
        </p>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight max-w-2xl mb-6 text-[oklch(0.95_0.01_250)]">
          공부한 내용을
          <br />
          <span className="text-[oklch(0.65_0.15_175)]">문제로 검증</span>하세요
        </h1>

        <p className="text-base text-[oklch(0.60_0.01_250)] max-w-md mb-12 leading-relaxed">
          주제를 입력하면 AI가 즉시 퀴즈를 만들어줍니다.
          <br />
          회원가입 없이 지금 바로 체험해보세요.
        </p>

        <Link
          to="/try"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[oklch(0.65_0.15_175)] text-[oklch(0.12_0.01_250)] font-semibold text-base hover:bg-[oklch(0.70_0.15_175)] active:scale-[0.98] transition-all"
        >
          지금 바로 문제 만들기
          <span aria-hidden>→</span>
        </Link>

        <p className="mt-4 text-xs text-[oklch(0.45_0.01_250)]">
          회원가입 없이 무료 체험 · 결과 저장은 가입 후 가능
        </p>
      </main>

      <section className="border-t border-[oklch(0.28_0.01_250)] px-6 py-16">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-semibold text-[oklch(0.88_0.01_250)]">{f.title}</h3>
              <p className="text-sm text-[oklch(0.55_0.01_250)] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-[oklch(0.28_0.01_250)] flex items-center justify-between text-xs text-[oklch(0.40_0.01_250)]">
        <span>© 2026 RetryNote</span>
        <div className="flex gap-4">
          <Link to="/terms" className="hover:text-[oklch(0.60_0.01_250)] transition-colors">이용약관</Link>
          <Link to="/privacy" className="hover:text-[oklch(0.60_0.01_250)] transition-colors">개인정보처리방침</Link>
        </div>
      </footer>
    </div>
  );
}
