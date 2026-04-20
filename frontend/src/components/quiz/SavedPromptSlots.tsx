import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, CornerDownLeft, Save, Trash2 } from 'lucide-react';
import { savedPromptsApi } from '@/api';
import type { SavedPrompt } from '@/types';
import { getDetailMessage } from '@/utils/errorMessages';

const QUERY_KEY = ['saved-prompts'] as const;
const MAX_SLOTS = 3;
const SLOT_NUMBERS = [1, 2, 3] as const;

interface SavedPromptSlotsProps {
  currentValue: string;
  onLoad: (content: string) => void;
}

export function SavedPromptSlots({ currentValue, onLoad }: SavedPromptSlotsProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [openSlot, setOpenSlot] = useState<number | null>(null);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => savedPromptsApi.list(),
  });

  const promptsBySlot = new Map<number, SavedPrompt>(prompts.map((p) => [p.slot, p]));

  const writeToCache = (saved: SavedPrompt) => {
    queryClient.setQueryData<SavedPrompt[]>(QUERY_KEY, (old = []) => {
      const others = old.filter((p) => p.slot !== saved.slot);
      return [...others, saved].sort((a, b) => a.slot - b.slot);
    });
  };

  const removeFromCache = (slot: number) => {
    queryClient.setQueryData<SavedPrompt[]>(QUERY_KEY, (old = []) =>
      old.filter((p) => p.slot !== slot),
    );
  };

  const upsertMutation = useMutation({
    mutationFn: ({ slot, content }: { slot: number; content: string }) =>
      savedPromptsApi.upsert(slot, { content }),
    onSuccess: (saved) => {
      writeToCache(saved);
      setMessage({ kind: 'info', text: '저장했어요.' });
    },
    onError: (err) => {
      setMessage({ kind: 'error', text: getDetailMessage(err, '저장에 실패했습니다.') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slot: number) => savedPromptsApi.remove(slot),
    onSuccess: (_data, slot) => {
      removeFromCache(slot);
      setMessage({ kind: 'info', text: '삭제했어요.' });
    },
    onError: (err) => {
      setMessage({ kind: 'error', text: getDetailMessage(err, '삭제에 실패했습니다.') });
    },
  });

  const flashMessageTimeout = (ms = 1800) => {
    window.setTimeout(() => setMessage(null), ms);
  };

  useEffect(() => {
    if (openSlot === null) return;
    const handleDocPointerDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpenSlot(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenSlot(null);
    };
    document.addEventListener('mousedown', handleDocPointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocPointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openSlot]);

  const handleSlotClick = (slot: number) => {
    const saved = promptsBySlot.get(slot);
    if (saved) {
      setOpenSlot((prev) => (prev === slot ? null : slot));
      return;
    }
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
  };

  const handleLoad = (slot: number) => {
    const saved = promptsBySlot.get(slot);
    if (!saved) return;
    onLoad(saved.content);
    setOpenSlot(null);
    setMessage({ kind: 'info', text: `슬롯 ${slot}번을 불러왔어요.` });
    flashMessageTimeout();
  };

  const handleOverwrite = (slot: number) => {
    const trimmed = currentValue.trim();
    if (!trimmed) {
      setMessage({ kind: 'error', text: '덮어쓸 내용을 먼저 입력해주세요.' });
      flashMessageTimeout();
      return;
    }
    upsertMutation.mutate(
      { slot, content: trimmed },
      {
        onSettled: () => {
          setOpenSlot(null);
          flashMessageTimeout();
        },
      },
    );
  };

  const handleDelete = (slot: number) => {
    deleteMutation.mutate(slot, {
      onSettled: () => {
        setOpenSlot(null);
        flashMessageTimeout();
      },
    });
  };

  const pending = upsertMutation.isPending || deleteMutation.isPending;
  const filledCount = prompts.length;
  const canOverwrite = currentValue.trim().length > 0;

  return (
    <div className="space-y-2" ref={containerRef}>
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

      <div className="flex flex-wrap items-center gap-2">
        {SLOT_NUMBERS.map((slot) => {
          const saved = promptsBySlot.get(slot);
          const isFilled = !!saved;
          const isOpen = openSlot === slot;

          return (
            <div key={slot} className="relative">
              <button
                type="button"
                onClick={() => handleSlotClick(slot)}
                disabled={pending || isLoading}
                aria-label={
                  isFilled
                    ? `슬롯 ${slot}번 작업 열기`
                    : `현재 입력을 슬롯 ${slot}번에 저장`
                }
                aria-haspopup={isFilled ? 'menu' : undefined}
                aria-expanded={isFilled ? isOpen : undefined}
                title={
                  isFilled
                    ? undefined
                    : `슬롯 ${slot}번 · 비어있음 — 클릭하면 현재 입력을 저장합니다`
                }
                className={[
                  'h-10 w-10 rounded-xl border text-base font-semibold tabular-nums',
                  'transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-brand-500',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  isFilled
                    ? [
                        'border-brand-500/30 bg-brand-500/10 text-brand-200',
                        'ring-1 ring-inset ring-brand-500/20',
                        'hover:bg-brand-500/20 hover:border-brand-500/45',
                        isOpen ? 'bg-brand-500/25 border-brand-500/60 ring-brand-500/40' : '',
                      ].join(' ')
                    : 'bg-surface-deep text-content-muted border-white/[0.08] hover:border-white/[0.18] hover:text-content-secondary',
                ].join(' ')}
              >
                {slot}
              </button>

              {isFilled && isOpen && (
                <div
                  role="menu"
                  aria-label={`슬롯 ${slot}번 작업`}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-60 z-20 animate-fade-in-up"
                >
                  <div className="relative rounded-xl border border-white/[0.08] bg-surface-elevated shadow-xl shadow-black/60 p-1.5">
                    <div className="px-2.5 py-1.5 text-[11px] leading-snug text-content-muted border-b border-white/[0.05] mb-1 max-h-20 overflow-hidden">
                      <span className="line-clamp-3 whitespace-pre-wrap">{saved.content}</span>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleLoad(slot)}
                      disabled={pending}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-content-primary hover:bg-brand-500/10 hover:text-brand-100 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CornerDownLeft size={13} className="opacity-70" />
                      <span>입력창에 불러오기</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleOverwrite(slot)}
                      disabled={pending || !canOverwrite}
                      title={!canOverwrite ? '먼저 입력 내용을 작성하세요' : undefined}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-content-primary hover:bg-brand-500/10 hover:text-brand-100 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-content-primary"
                    >
                      <Save size={13} className="opacity-70" />
                      <span>현재 입력으로 덮어쓰기</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleDelete(slot)}
                      disabled={pending}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-semantic-error/90 hover:bg-semantic-error/10 hover:text-semantic-error transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={13} className="opacity-70" />
                      <span>삭제</span>
                    </button>
                  </div>

                  <div
                    aria-hidden="true"
                    className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rotate-45 bg-surface-elevated border-r border-b border-white/[0.08]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
