import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';

// ─── Scroll Reveal Hook ──────────────────────────────────────────────────────

function useScrollReveal(
  threshold = 0.15,
): [React.RefCallback<HTMLElement>, boolean] {
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useRef<React.RefCallback<HTMLElement>>((el: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observerRef.current?.disconnect();
        }
      },
      { threshold },
    );
    observerRef.current.observe(el);
  }).current;

  return [ref, visible];
}

// ─── Public Header ───────────────────────────────────────────────────────────

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-surface/80 border-b border-white/[0.08] animate-fade-in-down">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 group cursor-default">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center group-hover:rotate-12 transition-transform duration-300">
            <span className="text-brand-900 font-bold text-lg">R</span>
          </div>
          <span className="text-xl font-bold text-brand-300 tracking-tight">RetryNote</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-content-secondary hover:text-content-primary transition-colors text-sm font-medium px-3 py-1.5"
          >
            로그인
          </Link>
          <Link
            to="/signup"
            className="bg-brand-500 text-brand-900 text-sm font-bold px-5 py-2.5 rounded-xl hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-500/20 transition-all active:scale-95 inline-block"
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
      <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-2xl pointer-events-none animate-fade-in" style={{ animationDelay: '0.6s' }} />
      <div className="absolute inset-0 rounded-2xl shadow-2xl shadow-black/60 pointer-events-none animate-fade-in" style={{ animationDelay: '0.4s' }} />
      <div className="relative rounded-2xl border border-white/[0.12] bg-surface p-6 w-full max-w-sm animate-scale-in will-change-transform">
        <div className="flex items-center justify-between mb-5 animate-fade-in-down stagger-2">
          <span className="text-xs font-medium text-brand-400 uppercase tracking-widest">AI 생성 문제</span>
          <span className="text-xs text-content-muted bg-surface-raised px-2 py-1 rounded-full">3 / 5</span>
        </div>
        <p className="text-content-primary font-semibold text-base leading-snug mb-5 animate-fade-in-up stagger-3">
          프랑스 대혁명이 일어난 주요 원인으로 가장 적절한 것은?
        </p>
        <div className="flex flex-col gap-2">
          {QUIZ_OPTIONS.map((opt, i) => (
            <div
              key={opt.label}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.03] animate-fade-in-up stagger-${i + 4} ${
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
        <p className="mt-4 text-xs text-content-muted border-t border-white/[0.06] pt-3 animate-fade-in stagger-8">
          오답 노트에 자동 저장됩니다
        </p>
      </div>
      <div className="absolute -bottom-4 -right-4 bg-surface-raised border border-white/[0.10] rounded-xl px-4 py-2.5 shadow-lg shadow-black/40 flex items-center gap-2 animate-scale-in stagger-6">
        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse flex-shrink-0" />
        <span className="text-xs text-content-secondary font-medium">문제 생성 중...</span>
      </div>
    </div>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="bg-surface-deep py-16 sm:py-24 lg:py-28 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="relative z-10">
            <p className="animate-fade-in-down text-brand-400 text-sm font-semibold uppercase tracking-widest mb-4">
              AI 퀴즈 학습 도구
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-content-primary leading-tight sm:tracking-tight mb-6">
              <span className="block animate-fade-in-up stagger-1">공부한 내용을</span>
              <span className="text-brand-300 animate-reveal-right stagger-2 inline-block">AI 퀴즈로 검증</span>
              <span className="animate-fade-in-up stagger-3 inline-block">하세요</span>
            </h1>
            <p className="animate-fade-in-up stagger-4 text-lg text-content-secondary max-w-lg mb-8 leading-relaxed">
              자료를 올리면 AI가 자동으로 문제를 만들고,
              틀린 부분만 집중해서 복습할 수 있습니다.
            </p>
            <div className="animate-fade-in-up stagger-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link
                to="/try"
                className="bg-brand-500 text-brand-900 px-8 py-4 rounded-2xl font-bold text-base hover:-translate-y-1 hover:shadow-brand-500/20 hover:shadow-2xl transition-all duration-300 shadow-xl shadow-black/50 inline-block active:scale-95"
              >
                지금 바로 무료로 문제 만들기
              </Link>
              <div className="flex flex-col">
                <p className="text-sm text-content-muted">
                  회원가입 없이 체험 가능
                </p>
                <p className="text-xs text-content-muted/60">
                  카드 정보 불필요
                </p>
              </div>
            </div>
          </div>
          <div className="animate-fade-in stagger-6 flex justify-center lg:justify-end">
            <QuizMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features Section ─────────────────────────────────────────────────────────

function FeaturesSection() {
  const [ref, visible] = useScrollReveal();

  return (
    <section ref={ref} className="py-16 sm:py-24 bg-surface relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-brand-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-20">
          <p className={`text-brand-400 text-xs font-semibold uppercase tracking-widest mb-3 transition-all duration-700 ${visible ? 'animate-fade-in-down' : 'opacity-0'}`}>
            핵심 기능
          </p>
          <h2 className={`font-display text-3xl sm:text-4xl font-bold text-content-primary mb-4 transition-all duration-700 ${visible ? 'animate-fade-in-up stagger-1' : 'opacity-0'}`}>
            AI 퀴즈 생성
          </h2>
          <p className={`text-content-secondary text-lg max-w-xl leading-relaxed mb-12 transition-all duration-700 ${visible ? 'animate-fade-in-up stagger-2' : 'opacity-0'}`}>
            자료를 업로드하면 AI가 핵심 개념을 분석해 자동으로 문제를 만들어줍니다.
            PDF, Word, 이미지, 텍스트를 모두 지원합니다.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-y-4 sm:gap-0">
            {[
              { step: '01', title: '자료 업로드', desc: 'PDF, 이미지, 텍스트' },
              { step: '02', title: 'AI 분석', desc: '핵심 개념 추출' },
              { step: '03', title: '문제 생성', desc: '4지선다 + 해설' },
            ].flatMap((item, i) => {
              const els = [
                <div key={item.step} className={`flex items-center gap-4 py-3 sm:py-0 sm:px-8 first:pl-0 transition-all duration-700 ${visible ? `animate-fade-in-up stagger-${i + 3}` : 'opacity-0'}`}>
                  <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 group hover:bg-brand-500/20 transition-colors">
                    <span className="text-brand-400 text-sm font-bold">{item.step}</span>
                  </div>
                  <div>
                    <p className="text-content-primary font-semibold text-base">{item.title}</p>
                    <p className="text-content-muted text-sm mt-0.5">{item.desc}</p>
                  </div>
                </div>,
              ];
              if (i < 2) {
                els.push(
                  <div key={`arrow-${i}`} className={`flex-shrink-0 pl-[60px] py-1 sm:pl-0 sm:py-0 sm:self-center transition-all duration-700 ${visible ? `animate-fade-in stagger-${i + 3}` : 'opacity-0'}`}>
                    <span className="hidden sm:block text-content-muted/30 text-xl px-2">→</span>
                    <span className="sm:hidden text-content-muted/30 text-sm">↓</span>
                  </div>
                );
              }
              return els;
            })}
          </div>
        </div>

        <div className={`border-t border-white/[0.06] mb-16 transition-all duration-1000 ${visible ? 'opacity-100' : 'opacity-0'}`} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
          {[
            { icon: '#', title: '오답 추적', desc: '틀린 문제를 자동으로 저장하고 약점 패턴을 분석해 효율적인 학습을 도와줍니다.' },
            { icon: '↺', title: '재도전 퀴즈', desc: '틀린 문제만 모아 다시 퀴즈로 생성해 취약한 부분을 집중적으로 학습할 수 있습니다.' },
          ].map((feat, i) => (
            <div key={feat.title} className={`flex items-start gap-5 p-4 rounded-3xl transition-all duration-300 hover:bg-white/[0.02] group ${visible ? `animate-fade-in-up stagger-${i + 6}` : 'opacity-0'}`}>
              <div className="w-11 h-11 rounded-xl bg-surface-raised border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:border-brand-500/40 transition-colors">
                <span className="text-brand-400 text-base font-bold">{feat.icon}</span>
              </div>
              <div>
                <h3 className="text-content-primary font-semibold text-lg mb-1.5">{feat.title}</h3>
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
    answer: '무료 플랜으로 매달 5 크레딧의 AI 퀴즈 생성이 가능합니다.',
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
  const [ref, visible] = useScrollReveal();

  return (
    <section ref={ref} className="py-20 sm:py-28 bg-surface-deep">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className={`font-display text-3xl sm:text-4xl font-bold text-content-primary text-center mb-16 transition-all duration-700 ${visible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          자주 묻는 질문
        </h2>
        <div className="flex flex-col gap-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className={`border rounded-2xl bg-surface transition-all duration-300 ${visible ? `animate-fade-in-up stagger-${Math.min(index + 1, 6)}` : 'opacity-0'} ${
                  isOpen
                    ? 'border-brand-500/30 ring-1 ring-brand-500/10'
                    : 'border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.01]'
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  className="w-full flex items-center justify-between px-6 py-5 text-left transition-colors"
                >
                  <span className={`font-medium pr-4 transition-colors ${isOpen ? 'text-brand-300' : 'text-content-primary'}`}>
                    {item.question}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-full border border-white/[0.08] flex items-center justify-center transition-all duration-300 ${
                      isOpen ? 'rotate-180 border-brand-500/30 bg-brand-500/10 text-brand-400' : 'text-content-muted'
                    }`}
                  >
                    <span className="text-lg">↓</span>
                  </div>
                </button>
                <div
                  id={`faq-answer-${index}`}
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-6 pt-0">
                      <p className="text-content-secondary text-sm leading-relaxed">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
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
    storage: '50MB',
    credits: '5 크레딧',
    fileSize: '5MB',
    highlighted: false,
    ctaLabel: '지금 무료로 시작하기',
    ctaTo: '/try',
  },
  {
    name: 'Lite',
    price: '₩6,900',
    period: '/월',
    storage: '2GB',
    credits: '60 크레딧',
    fileSize: '50MB',
    highlighted: false,
    ctaLabel: '플랜 보기',
    ctaTo: '/pricing',
  },
  {
    name: 'Standard',
    price: '₩14,900',
    period: '/월',
    storage: '10GB',
    credits: '200 크레딧',
    fileSize: '100MB',
    highlighted: true,
    ctaLabel: '플랜 보기',
    ctaTo: '/pricing',
  },
  {
    name: 'Pro',
    price: '₩26,900',
    period: '/월',
    storage: '20GB',
    credits: '700 크레딧',
    fileSize: '200MB',
    highlighted: false,
    ctaLabel: '플랜 보기',
    ctaTo: '/pricing',
  },
];

function PricingSection() {
  const [ref, visible] = useScrollReveal();

  return (
    <section ref={ref} className="py-24 sm:py-32 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className={`font-display text-3xl sm:text-4xl font-bold text-content-primary text-center mb-6 transition-all duration-700 ${visible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          합리적인 가격
        </h2>
        <p className={`text-content-secondary text-center mb-16 max-w-xl mx-auto text-lg transition-all duration-700 ${visible ? 'animate-fade-in-up stagger-1' : 'opacity-0'}`}>
          무료로 시작하고 필요에 따라 업그레이드하세요.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRICING_TIERS.map((tier, i) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-[2rem] border p-8 transition-all duration-500 hover:translate-y-[-8px] ${visible ? `animate-fade-in-up stagger-${Math.min(i + 2, 7)}` : 'opacity-0'} ${
                tier.highlighted
                  ? 'border-brand-500/60 bg-brand-500/10 shadow-2xl shadow-brand-500/10 hover:shadow-brand-500/20'
                  : 'border-white/[0.08] bg-surface-deep hover:bg-white/[0.01] hover:border-white/[0.15]'
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-500 text-brand-900 text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg shadow-brand-500/20">
                  추천 플랜
                </span>
              )}
              <div className="mb-8">
                <h3 className="text-content-primary font-bold text-xl mb-2">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-content-primary">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-content-muted text-sm font-medium">{tier.period}</span>
                  )}
                </div>
              </div>
              <ul className="flex flex-col gap-4 mb-10 flex-1 text-sm">
                <li className="flex justify-between items-center text-content-secondary group-hover:text-content-primary transition-colors">
                  <span className="text-content-muted">저장 공간</span>
                  <span className="font-semibold text-content-primary">{tier.storage}</span>
                </li>
                <li className="flex justify-between items-center text-content-secondary group-hover:text-content-primary transition-colors">
                  <span className="text-content-muted">크레딧 (30일)</span>
                  <span className="font-semibold text-content-primary">{tier.credits}</span>
                </li>
                <li className="flex justify-between items-center text-content-secondary group-hover:text-content-primary transition-colors">
                  <span className="text-content-muted">파일 크기</span>
                  <span className="font-semibold text-content-primary">{tier.fileSize}</span>
                </li>
              </ul>
              <Link
                to={tier.ctaTo}
                className={`text-center py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
                  tier.highlighted
                    ? 'bg-brand-500 text-brand-900 shadow-xl shadow-brand-500/20 hover:shadow-brand-500/30'
                    : 'bg-white/[0.08] text-content-primary hover:bg-white/[0.12] border border-white/[0.10]'
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
  const [ref, visible] = useScrollReveal();

  return (
    <section ref={ref} className="py-24 sm:py-32 bg-surface-deep border-t border-white/[0.06] relative overflow-hidden">
      {/* Cinematic gradient decoration */}
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-500/5 blur-[100px] rounded-full pointer-events-none translate-x-1/2 translate-y-1/2" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-16 lg:gap-20">
          <div className="flex flex-col sm:flex-row lg:flex-col gap-8 sm:gap-14 lg:gap-10">
            {[
              { value: '10,000+', label: 'AI 문제 생성됨' },
              { value: '98%', label: '정확한 문제 품질' },
              { value: '30초', label: '평균 문제 생성 시간' },
            ].map((stat, i) => (
              <div key={stat.label} className={`transition-all duration-700 ${visible ? `animate-fade-in-up stagger-${i + 1}` : 'opacity-0'}`}>
                <p className="font-display text-4xl sm:text-5xl font-bold text-content-primary tabular-nums tracking-tight">
                  {stat.value}
                </p>
                <p className="text-content-muted text-[15px] font-medium mt-2">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className={`lg:max-w-md transition-all duration-700 ${visible ? 'animate-fade-in-up stagger-4' : 'opacity-0'}`}>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-content-primary mb-6 leading-tight">
              지금 바로<br />시작하세요
            </h2>
            <p className="text-content-secondary mb-10 text-lg leading-relaxed max-w-sm">
              가입 없이도 AI 퀴즈를 체험할 수 있습니다.
              공부한 내용을 직접 문제로 만들어 보세요.
            </p>
            <div className="flex flex-col gap-4">
              <Link
                to="/try"
                className="bg-brand-500 text-brand-900 px-10 py-5 rounded-[1.25rem] font-black text-lg hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-500/30 transition-all duration-300 shadow-xl shadow-black/50 inline-block text-center active:scale-95"
              >
                지금 무료로 문제 만들기
              </Link>
              <div className="flex items-center gap-3 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-semantic-success animate-pulse" />
                <p className="text-sm text-content-muted font-medium">
                  회원가입 없이 체험 가능 · 카드 정보 불필요
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  const [ref, visible] = useScrollReveal();
  return (
    <footer ref={ref} className={`bg-surface-deep border-t border-white/[0.08] py-12 transition-all duration-1000 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 text-sm font-medium text-content-muted">
          <p>© 2025 RetryNote. All rights reserved.</p>
        </div>
        <nav className="flex items-center gap-8 text-sm font-medium text-content-secondary">
          <Link to="/terms" className="hover:text-brand-300 transition-colors py-2">
            이용약관
          </Link>
          <Link to="/privacy" className="hover:text-brand-300 transition-colors py-2">
            개인정보처리방침
          </Link>
          <Link to="/refund" className="hover:text-brand-300 transition-colors py-2">
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
