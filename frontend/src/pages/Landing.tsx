import { useState } from 'react';
import { Link } from 'react-router-dom';

// ─── Public Header ───────────────────────────────────────────────────────────

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-surface/80 border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <span className="text-xl font-bold text-brand-300">RetryNote</span>
        <nav className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-content-secondary hover:text-content-primary transition-colors text-sm font-medium px-3 py-1.5"
          >
            로그인
          </Link>
          <Link
            to="/signup"
            className="bg-brand-500 text-brand-900 text-sm font-semibold px-4 py-2 rounded-xl hover:-translate-y-0.5 transition-transform inline-block"
          >
            회원가입
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ─── Quiz Mockup Visual ───────────────────────────────────────────────────────

const QUIZ_OPTIONS = [
  { label: 'A', text: '계몽주의 사상의 확산', correct: false },
  { label: 'B', text: '재정 위기와 사회 불평등', correct: true },
  { label: 'C', text: '나폴레옹의 군사 쿠데타', correct: false },
  { label: 'D', text: '영국과의 전쟁 패배', correct: false },
];

function QuizMockup() {
  return (
    <div className="relative select-none">
      <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-2xl pointer-events-none" />
      <div className="relative rounded-2xl border border-white/[0.12] bg-surface p-6 shadow-2xl shadow-black/60 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-medium text-brand-400 uppercase tracking-widest">AI 생성 문제</span>
          <span className="text-xs text-content-muted bg-surface-raised px-2 py-1 rounded-full">3 / 5</span>
        </div>
        <p className="text-content-primary font-semibold text-base leading-snug mb-5">
          프랑스 대혁명이 일어난 주요 원인으로 가장 적절한 것은?
        </p>
        <div className="flex flex-col gap-2">
          {QUIZ_OPTIONS.map((opt) => (
            <div
              key={opt.label}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-colors ${
                opt.correct
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-300'
                  : 'border-white/[0.06] bg-surface-raised text-content-secondary'
              }`}
            >
              <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                opt.correct ? 'bg-brand-500 text-brand-900' : 'bg-white/[0.08] text-content-muted'
              }`}>
                {opt.label}
              </span>
              {opt.text}
              {opt.correct && (
                <span className="ml-auto text-brand-400 text-xs font-semibold">정답</span>
              )}
            </div>
          ))}
        </div>
        {/* Footer hint */}
        <p className="mt-4 text-xs text-content-muted border-t border-white/[0.06] pt-3">
          오답 노트에 자동 저장됩니다
        </p>
      </div>
      {/* Floating "new quiz" hint card */}
      <div className="absolute -bottom-4 -right-4 bg-surface-raised border border-white/[0.10] rounded-xl px-4 py-2.5 shadow-lg shadow-black/40 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse flex-shrink-0" />
        <span className="text-xs text-content-secondary font-medium">문제 생성 중...</span>
      </div>
    </div>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="bg-surface-deep py-16 sm:py-24 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: text */}
          <div>
            <p className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-4">
              AI 퀴즈 학습 도구
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-5xl font-bold text-content-primary leading-tight mb-6">
              공부한 내용을
              <br />
              <span className="text-brand-300">AI 퀴즈로 검증</span>하세요
            </h1>
            <p className="text-lg text-content-secondary max-w-lg mb-8 leading-relaxed">
              자료를 올리면 AI가 자동으로 문제를 만들고,
              틀린 부분만 집중해서 복습할 수 있습니다.
            </p>
            <Link
              to="/try"
              className="bg-brand-500 text-brand-900 px-8 py-4 rounded-2xl font-bold text-base hover:-translate-y-0.5 transition-transform shadow-2xl shadow-black/50 inline-block"
            >
              지금 바로 무료로 문제 만들기
            </Link>
            <p className="mt-4 text-sm text-content-muted">
              회원가입 없이 체험 가능 · 카드 정보 불필요
            </p>
          </div>
          {/* Right: mockup */}
          <div className="flex justify-center lg:justify-end">
            <QuizMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features Section ─────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section className="py-16 sm:py-20 bg-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Primary feature: AI quiz generation */}
        <div className="mb-14">
          <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-3">
            핵심 기능
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-content-primary mb-4">
            AI 퀴즈 생성
          </h2>
          <p className="text-content-secondary text-lg max-w-xl leading-relaxed mb-10">
            자료를 업로드하면 AI가 핵심 개념을 분석해 자동으로 문제를 만들어줍니다.
            PDF, Word, 이미지, 텍스트를 모두 지원합니다.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center">
            {[
              { step: '01', title: '자료 업로드', desc: 'PDF, 이미지, 텍스트' },
              { step: '02', title: 'AI 분석', desc: '핵심 개념 추출' },
              { step: '03', title: '문제 생성', desc: '4지선다 + 해설' },
            ].map((item, i) => (
              <div key={item.step} className="flex items-center">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-4 sm:py-0 sm:px-6 first:pl-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-400 text-xs font-bold">{item.step}</span>
                  </div>
                  <div>
                    <p className="text-content-primary font-semibold text-sm">{item.title}</p>
                    <p className="text-content-muted text-xs mt-0.5">{item.desc}</p>
                  </div>
                </div>
                {i < 2 && (
                  <div className="flex-shrink-0">
                    <span className="hidden sm:block text-content-muted/40 text-lg px-1">→</span>
                    <span className="sm:hidden text-content-muted/40 text-sm pl-4 pb-1 block">↓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.06] mb-10" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8">
          {[
            { icon: '#', title: '오답 추적', desc: '틀린 문제를 자동으로 저장하고 약점 패턴을 분석해 효율적인 학습을 도와줍니다.' },
            { icon: '↺', title: '재도전 퀴즈', desc: '틀린 문제만 모아 다시 퀴즈로 생성해 취약한 부분을 집중적으로 학습할 수 있습니다.' },
          ].map((feat) => (
            <div key={feat.title} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-surface-raised border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-400 text-sm font-bold">{feat.icon}</span>
              </div>
              <div>
                <h3 className="text-content-primary font-semibold mb-1">{feat.title}</h3>
                <p className="text-content-secondary text-sm leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ Section ──────────────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: '무료로 얼마나 사용할 수 있나요?',
    answer: '무료 플랜으로 매달 20회의 AI 퀴즈 생성이 가능합니다.',
  },
  {
    question: '어떤 파일을 업로드할 수 있나요?',
    answer:
      'PDF, Word, PowerPoint, 텍스트 파일, 이미지(PNG, JPG) 등을 지원합니다.',
  },
  {
    question: 'AI가 만든 문제의 품질은 어떤가요?',
    answer:
      '최신 AI 모델을 활용해 내용을 분석하고 핵심 개념 기반 문제를 생성합니다.',
  },
  {
    question: '오답 추적은 어떻게 되나요?',
    answer:
      '틀린 문제는 자동으로 저장되고, 약점 패턴을 분석해 복습 퀴즈를 생성합니다.',
  },
  {
    question: '데이터는 안전한가요?',
    answer:
      '모든 데이터는 암호화되어 저장되며, 개인정보는 외부에 공유되지 않습니다.',
  },
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 sm:py-24 bg-surface-deep">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-content-primary text-center mb-12">
          자주 묻는 질문
        </h2>
        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className={`border rounded-2xl overflow-hidden bg-surface transition-colors duration-200 ${
                  isOpen
                    ? 'border-l-2 border-l-[oklch(0.65_0.15_175)] border-white/[0.08]'
                    : 'border-white/[0.08]'
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-content-primary font-medium pr-4">
                    {item.question}
                  </span>
                  <span
                    className={`text-brand-400 text-xl flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  >
                    ↓
                  </span>
                </button>
                {isOpen && (
                  <div id={`faq-answer-${index}`} className="px-6 py-4">
                    <p className="text-content-secondary text-sm leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing Section ──────────────────────────────────────────────────────────

interface PricingTier {
  name: string;
  price: string;
  period?: string;
  storage: string;
  credits: string;
  fileSize: string;
  highlighted: boolean;
  ctaLabel: string;
  ctaTo: string;
}

const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Free',
    price: '무료',
    storage: '150MB',
    credits: '20회',
    fileSize: '5MB',
    highlighted: false,
    ctaLabel: '지금 무료로 시작하기',
    ctaTo: '/try',
  },
  {
    name: 'Lite',
    price: '₩6,900',
    period: '/월',
    storage: '3GB',
    credits: '200회',
    fileSize: '50MB',
    highlighted: false,
    ctaLabel: '플랜 보기',
    ctaTo: '/pricing',
  },
  {
    name: 'Standard',
    price: '₩14,900',
    period: '/월',
    storage: '15GB',
    credits: '1,000회',
    fileSize: '100MB',
    highlighted: true,
    ctaLabel: '플랜 보기',
    ctaTo: '/pricing',
  },
  {
    name: 'Pro',
    price: '₩26,900',
    period: '/월',
    storage: '50GB',
    credits: '3,000회',
    fileSize: '200MB',
    highlighted: false,
    ctaLabel: '플랜 보기',
    ctaTo: '/pricing',
  },
];

function PricingSection() {
  return (
    <section className="py-20 sm:py-24 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-content-primary text-center mb-4">
          합리적인 가격
        </h2>
        <p className="text-content-secondary text-center mb-12 max-w-xl mx-auto">
          무료로 시작하고 필요에 따라 업그레이드하세요.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-3xl border p-6 transition-transform duration-200 ${
                tier.highlighted
                  ? 'border-brand-500/60 bg-brand-500/10 shadow-2xl shadow-black/50 hover:scale-105'
                  : 'border-white/[0.08] bg-surface-deep'
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-brand-900 text-xs font-bold px-3 py-1 rounded-full">
                  추천
                </span>
              )}
              <div className="mb-4">
                <h3 className="text-content-primary font-bold text-xl mb-1">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-content-primary">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-content-muted text-sm">{tier.period}</span>
                  )}
                </div>
              </div>
              <ul className="flex flex-col gap-3 mb-6 flex-1 text-sm">
                <li className="flex justify-between text-content-secondary">
                  <span className="text-content-muted">저장 공간</span>
                  <span className="font-medium text-content-primary">{tier.storage}</span>
                </li>
                <li className="flex justify-between text-content-secondary">
                  <span className="text-content-muted">크레딧 (30일)</span>
                  <span className="font-medium text-content-primary">{tier.credits}</span>
                </li>
                <li className="flex justify-between text-content-secondary">
                  <span className="text-content-muted">파일 크기</span>
                  <span className="font-medium text-content-primary">{tier.fileSize}</span>
                </li>
              </ul>
              <Link
                to={tier.ctaTo}
                className={`text-center py-3 rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5 ${
                  tier.highlighted
                    ? 'bg-brand-500 text-brand-900 shadow-lg shadow-brand-500/20'
                    : 'bg-white/[0.06] text-content-primary hover:bg-white/[0.10] border border-white/[0.08]'
                }`}
              >
                {tier.ctaLabel}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="py-20 sm:py-28 bg-surface-deep border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10">
          <div className="flex flex-col sm:flex-row lg:flex-col gap-6 sm:gap-10 lg:gap-6">
            {[
              { value: '10,000+', label: 'AI 문제 생성됨' },
              { value: '98%', label: '정확한 문제 품질' },
              { value: '30초', label: '평균 문제 생성 시간' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-4xl font-bold text-content-primary tabular-nums">
                  {stat.value}
                </p>
                <p className="text-content-muted text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Right: CTA */}
          <div className="lg:max-w-md">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-content-primary mb-4">
              지금 바로 시작하세요
            </h2>
            <p className="text-content-secondary mb-8 text-base leading-relaxed">
              가입 없이도 AI 퀴즈를 체험할 수 있습니다.
              공부한 내용을 직접 문제로 만들어 보세요.
            </p>
            <Link
              to="/try"
              className="bg-brand-500 text-brand-900 px-8 py-4 rounded-2xl font-bold text-base hover:-translate-y-0.5 transition-transform shadow-2xl shadow-black/50 inline-block"
            >
              지금 바로 무료로 문제 만들기
            </Link>
            <p className="mt-3 text-sm text-content-muted">
              회원가입 없이 체험 가능 · 카드 정보 불필요
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-surface-deep border-t border-white/[0.08] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-content-muted text-sm">
          © 2025 RetryNote. All rights reserved.
        </p>
        <nav className="flex items-center gap-6 text-sm text-content-secondary">
          <Link to="/terms" className="hover:text-brand-500 transition-colors">
            이용약관
          </Link>
          <Link to="/privacy" className="hover:text-brand-500 transition-colors">
            개인정보처리방침
          </Link>
          <Link to="/refund" className="hover:text-brand-500 transition-colors">
            환불 정책
          </Link>
        </nav>
      </div>
    </footer>
  );
}

// ─── Page Assembly ────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <FAQSection />
        <PricingSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
