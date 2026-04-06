import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import Modal from '@/components/Modal';
import type { UpgradePromptPayload } from '@/types/billing';

const LIMIT_MESSAGES: Record<string, string> = {
  quiz: '퀴즈 생성 횟수를 모두 사용했습니다.',
  storage: '저장 공간이 가득 찼습니다.',
  ocr: 'OCR 처리 한도를 초과했습니다.',
  model_access: '이 AI 모델은 현재 요금제에서 사용할 수 없습니다.',
};

export default function UpgradeModal() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [payload, setPayload] = useState<UpgradePromptPayload | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<UpgradePromptPayload>;
      setPayload(customEvent.detail);
      setIsOpen(true);
    };
    window.addEventListener('upgrade-required', handler);
    return () => window.removeEventListener('upgrade-required', handler);
  }, []);

  const handleClose = () => setIsOpen(false);

  const handleUpgrade = () => {
    setIsOpen(false);
    navigate('/pricing');
  };

  const message = payload
    ? (LIMIT_MESSAGES[payload.limitType] ?? payload.detail)
    : '';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="사용 한도 초과">
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-content-secondary">{message}</p>

        {payload && payload.limit > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-surface-raised px-4 py-3 text-sm text-content-muted">
            현재: {payload.currentUsage} / {payload.limit}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleUpgrade}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500/15 px-4 py-2.5 text-sm font-semibold text-brand-300 ring-1 ring-brand-500/30 transition-colors hover:bg-brand-500/25 hover:text-brand-200 focus:outline-none"
          >
            <TrendingUp className="h-4 w-4 shrink-0" />
            요금제 업그레이드
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-hover hover:text-content-secondary focus:outline-none"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
