import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Megaphone } from 'lucide-react';
import { announcementsApi } from '@/api';

export default function AnnouncementBanner() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => announcementsApi.listActive(),
    staleTime: 5 * 60 * 1000,
  });

  const visible = (announcements ?? []).filter((a) => !dismissedIds.has(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-1">
      {visible.map((ann) => (
        <div
          key={ann.id}
          className="flex items-start gap-3 bg-brand-500/10 border-b border-brand-500/20 px-4 py-2.5 sm:px-6"
        >
          <Megaphone size={15} className="mt-0.5 shrink-0 text-brand-400" />
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-brand-300">{ann.title}</span>
            {ann.body && (
              <span className="ml-2 text-sm text-content-secondary">{ann.body}</span>
            )}
          </div>
          <button
            onClick={() => setDismissedIds((prev) => new Set(prev).add(ann.id))}
            className="ml-2 shrink-0 text-content-muted transition-colors hover:text-content-primary"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
