import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Save, X } from 'lucide-react';
import { savedPromptsApi } from '@/api';
import type { SavedPrompt } from '@/types';
import { getDetailMessage } from '@/utils/errorMessages';

const MAX_SLOTS = 3;
const SLOT_NUMBERS = [1, 2, 3] as const;

interface SavedPromptSlotsProps {
  currentValue: string;
  onLoad: (content: string) => void;
}

export function SavedPromptSlots({ currentValue, onLoad }: SavedPromptSlotsProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['saved-prompts'],
    queryFn: () => savedPromptsApi.list(),
    staleTime: 30_000,
  });

  const promptsBySlot = new Map<number, SavedPrompt>(prompts.map((p) => [p.slot, p]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['saved-prompts'] });

  const upsertMutation = useMutation({
    mutationFn: ({ slot, content }: { slot: number; content: string }) =>
      savedPromptsApi.upsert(slot, { content }),
    onSuccess: () => {
      invalidate();
      setMessage({ kind: 'info', text: '저장했어요.' });
    },
    onError: (err) => {
      setMessage({ kind: 'error', text: getDetailMessage(err, '저장에 실패했습니다.') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slot: number) => savedPromptsApi.remove(slot),
    onSuccess: () => {
      invalidate();
      setMessage({ kind: 'info', text: '삭제했어요.' });
    },
    onError: (err) => {
      setMessage({ kind: 'error', text: getDetailMessage(err, '삭제에 실패했습니다.') });
    },
  });

  const flashMessageTimeout = (ms = 1800) => {
    window.setTimeout(() => setMessage(null), ms);
  };

  const handleSlotClick = (slot: number) => {
    const existing = promptsBySlot.get(slot);
    if (existing) {
      onLoad(existing.content);
      setMessage({ kind: 'info', text: `슬롯 ${slot}번을 불러왔어요.` });
      flashMessageTimeout();
    } else {
      const trimmed = currentValue.trim();
      if (!trimmed) {
        setMessage({ kind: 'error', text: '저장할 내용을 먼저 입력해주세요.' });
        flashMessageTimeout();
        return;
      }
      upsertMutation.mutate(
        { slot, content: trimmed },
        { onSettled: () => flashMessageTimeout() },
      );
    }
  };

  const handleDelete = (e: React.MouseEvent, slot: number) => {
    e.stopPropagation();
    if (!window.confirm(`슬롯 ${slot}번에 저장된 프롬프트를 삭제할까요?`)) return;
    deleteMutation.mutate(slot, { onSettled: () => flashMessageTimeout() });
  };

  const handleOverwrite = (e: React.MouseEvent, slot: number) => {
    e.stopPropagation();
    const trimmed = currentValue.trim();
    if (!trimmed) {
      setMessage({ kind: 'error', text: '덮어쓸 내용을 먼저 입력해주세요.' });
      flashMessageTimeout();
      return;
    }
    if (!window.confirm(`슬롯 ${slot}번을 현재 입력 내용으로 덮어쓸까요?`)) return;
    upsertMutation.mutate(
      { slot, content: trimmed },
      { onSettled: () => flashMessageTimeout() },
    );
  };

  const pending = upsertMutation.isPending || deleteMutation.isPending;
  const filledCount = prompts.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-content-muted">
          <Bookmark size={12} className="opacity-70" />
          <span>저장된 프롬프트</span>
          <span className="text-content-muted/60 tabular-nums">
            {filledCount}/{MAX_SLOTS}
          </span>
        </div>
        {message && (
          <span
            className={`text-[10px] ${
              message.kind === 'error' ? 'text-semantic-error' : 'text-content-muted'
            }`}
          >
            {message.text}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {SLOT_NUMBERS.map((slot) => {
          const saved = promptsBySlot.get(slot);
          const isFilled = !!saved;
          const preview = saved?.content ?? '';
          const title = isFilled
            ? `슬롯 ${slot}번 · 클릭하면 불러옵니다\n\n${preview}`
            : `슬롯 ${slot}번 · 비어있음 — 클릭하면 현재 입력을 저장합니다`;

          return (
            <div key={slot} className="relative group">
              <button
                type="button"
                onClick={() => handleSlotClick(slot)}
                disabled={pending || isLoading}
                aria-label={
                  isFilled
                    ? `슬롯 ${slot}번 불러오기`
                    : `현재 입력을 슬롯 ${slot}번에 저장`
                }
                title={title}
                className={`
                  relative h-9 w-9 rounded-xl border text-sm font-semibold tabular-nums
                  transition-all
                  focus:outline-none focus:ring-1 focus:ring-brand-500
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${
                    isFilled
                      ? 'bg-brand-500/15 text-brand-200 border-brand-500/30 ring-1 ring-inset ring-brand-500/30 hover:bg-brand-500/25'
                      : 'bg-surface-deep text-content-muted border-white/[0.08] hover:border-white/[0.18] hover:text-content-secondary'
                  }
                `}
              >
                {slot}
              </button>

              {isFilled && (
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => handleOverwrite(e, slot)}
                    disabled={pending}
                    aria-label={`슬롯 ${slot}번 덮어쓰기`}
                    title="현재 입력으로 덮어쓰기"
                    className="h-4 w-4 rounded-full bg-surface-elevated border border-white/[0.12] flex items-center justify-center text-content-secondary hover:text-brand-200 hover:border-brand-500/40 transition-colors"
                  >
                    <Save size={9} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, slot)}
                    disabled={pending}
                    aria-label={`슬롯 ${slot}번 삭제`}
                    title="삭제"
                    className="h-4 w-4 rounded-full bg-surface-elevated border border-white/[0.12] flex items-center justify-center text-content-secondary hover:text-semantic-error hover:border-semantic-error/40 transition-colors"
                  >
                    <X size={9} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <p className="ml-1 text-[10px] leading-tight text-content-muted/70">
          숫자를 눌러 불러오거나, 빈 슬롯에 현재 입력을 저장하세요.
        </p>
      </div>
    </div>
  );
}
