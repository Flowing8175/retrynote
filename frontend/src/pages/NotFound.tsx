import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="text-brand-300 font-bold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const messages = useMemo(
    () => [
      '??: 없어요  ???: 아 있었는데?',
      '뭘 찾는 거죠?',
      '저희 가게는 그런 거 취급 안해요.',
      `'${path}' 기능 추가해달라고요? 대신 해주세요. 응애`,
      '키키 404래요',
      'wdym',
      '무슨 뜻인지 이해하지 못했어요. **핵심**만 말씀해 주세요.',
      '너 정말 우리 사이트의 **핵심**을 찌를 뻔했어.',
      '여기엔 아무것도 없어요. 진짜로요.',
      '혹시 주소를 잘못 치신 건 아닌가요…?',
    ],
    [path],
  );

  const randomMessage = useMemo(
    () => messages[Math.floor(Math.random() * messages.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center text-center max-w-md w-full">

        <p className="animate-fade-in-up stagger-1 text-[clamp(6rem,18vw,12rem)] font-black leading-none tracking-tighter bg-gradient-to-b from-brand-300 to-brand-600 bg-clip-text text-transparent select-none">
          404
        </p>

        <div className="animate-fade-in-up stagger-2 mt-2 rounded-3xl bg-surface-raised border border-surface-border p-6 shadow-xl shadow-black/40">
          <img
            src="/404.svg"
            alt="당황한 마스코트"
            className="w-40 h-40 object-contain"
            draggable={false}
          />
        </div>

        <h1 className="animate-fade-in-up stagger-3 mt-7 text-xl font-semibold text-content-primary">
          요청하신 페이지를 찾을 수 없습니다.
        </h1>

        <p className="animate-fade-in-up stagger-4 mt-3 text-[0.97rem] leading-relaxed text-content-secondary">
          <RichText text={randomMessage} />
        </p>

        <button
          onClick={() => navigate('/')}
          className="animate-fade-in-up stagger-5 mt-8 inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-7 py-[0.9rem] text-[0.98rem] font-bold text-content-inverse transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          대시보드로 돌아가기
        </button>
      </div>
    </div>
  );
}
