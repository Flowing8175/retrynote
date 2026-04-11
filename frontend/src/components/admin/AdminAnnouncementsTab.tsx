import type { UseMutationResult } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { StatusBadge } from '@/components';
import type { AnnouncementCreate, AnnouncementResponse } from '@/types';
import { formatDateTime } from './adminUtils';

interface AdminAnnouncementsTabProps {
  announcementsData: AnnouncementResponse[] | undefined;
  announcementForm: AnnouncementCreate;
  setAnnouncementForm: React.Dispatch<React.SetStateAction<AnnouncementCreate>>;
  createAnnouncementMutation: UseMutationResult<AnnouncementResponse, unknown, AnnouncementCreate>;
  deleteAnnouncementMutation: UseMutationResult<void, unknown, string>;
}

export default function AdminAnnouncementsTab({
  announcementsData,
  announcementForm,
  setAnnouncementForm,
  createAnnouncementMutation,
  deleteAnnouncementMutation,
}: AdminAnnouncementsTabProps) {
  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/[0.07]">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">제목</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">내용</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">상태</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">시작일</th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">종료일</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07] bg-surface">
            {announcementsData?.map((ann) => (
              <tr key={ann.id} className="align-top transition-colors hover:bg-surface-deep/50">
                <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">{ann.title}</td>
                <td className="max-w-xs truncate px-6 py-5 text-sm text-content-secondary">
                  {ann.body.length > 50 ? `${ann.body.slice(0, 50)}…` : ann.body}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm">
                  <StatusBadge status={ann.is_active ? 'active' : 'inactive'} />
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                  {ann.starts_at ? formatDateTime(ann.starts_at) : '—'}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                  {ann.ends_at ? formatDateTime(ann.ends_at) : '—'}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-right">
                   <button
                     onClick={() => deleteAnnouncementMutation.mutate(ann.id)}
                     disabled={deleteAnnouncementMutation.isPending}
                     className="inline-flex h-10 w-10 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-semantic-error-bg hover:text-semantic-error disabled:opacity-40"
                     aria-label="삭제"
                   >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {(!announcementsData || announcementsData.length === 0) && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-content-muted">등록된 공지가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="rounded-3xl border border-white/[0.07] bg-surface p-6 md:p-7">
        <h2 className="text-xl font-semibold text-content-primary">새 공지 만들기</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">배너에 노출할 공지를 작성합니다.</p>

        <div className="mt-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-content-primary" htmlFor="ann-title">제목</label>
            <input
              id="ann-title"
              type="text"
              value={announcementForm.title}
              onChange={(e) => setAnnouncementForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="공지 제목"
              className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-primary" htmlFor="ann-body">내용</label>
            <textarea
              id="ann-body"
              rows={3}
              value={announcementForm.body}
              onChange={(e) => setAnnouncementForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="공지 내용을 입력하세요"
              className="mt-2 w-full resize-none rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary placeholder-content-muted"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="ann-active"
              type="checkbox"
              checked={announcementForm.is_active}
              onChange={(e) => setAnnouncementForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-white/[0.07] text-brand-500 focus:ring-brand-500"
            />
            <label className="text-sm font-medium text-content-primary" htmlFor="ann-active">활성 여부</label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ann-starts">시작일</label>
              <input
                id="ann-starts"
                type="datetime-local"
                value={announcementForm.starts_at ?? ''}
                onChange={(e) => setAnnouncementForm((f) => ({ ...f, starts_at: e.target.value || null }))}
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary" htmlFor="ann-ends">종료일</label>
              <input
                id="ann-ends"
                type="datetime-local"
                value={announcementForm.ends_at ?? ''}
                onChange={(e) => setAnnouncementForm((f) => ({ ...f, ends_at: e.target.value || null }))}
                className="mt-2 w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm text-content-primary"
              />
            </div>
          </div>

          <button
            onClick={() => createAnnouncementMutation.mutate(announcementForm)}
            disabled={createAnnouncementMutation.isPending || !announcementForm.title || !announcementForm.body}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {createAnnouncementMutation.isPending ? '저장 중…' : '공지 등록'}
          </button>
        </div>
      </div>
    </section>
  );
}
