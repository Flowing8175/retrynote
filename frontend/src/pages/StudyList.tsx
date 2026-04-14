import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { filesApi } from '@/api';
import { StatusBadge, SkeletonTransition } from '@/components';
import { Upload } from 'lucide-react';

function StudyListSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-10 animate-pulse" aria-hidden="true">
      <div className="space-y-2 mb-8">
        <div className="skeleton h-9 w-32 rounded-md" />
        <div className="skeleton h-4 w-64 rounded-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-white/[0.05] rounded-2xl p-5 space-y-3">
            <div className="skeleton h-6 w-40 rounded-md" />
            <div className="skeleton h-4 w-32 rounded-md" />
            <div className="skeleton h-5 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudyList() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['files', 'ready'],
    queryFn: () => filesApi.listFiles(1, 100, null, 'ready'),
  });

  const files = data?.files ?? [];

  return (
    <SkeletonTransition loading={isLoading} skeleton={<StudyListSkeleton />}>
      {isLoading ? null : (
        <div className="max-w-4xl mx-auto space-y-8 py-10 animate-fade-in">
          {/* Header */}
          <section className="animate-fade-in-up space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">학습</h1>
            <p className="text-base text-content-secondary">
              준비된 학습 자료를 선택하여 학습을 시작하세요.
            </p>
          </section>

          {/* Files Grid */}
          {files.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center bg-surface border border-white/[0.05] rounded-3xl">
              <div className="w-16 h-16 rounded-full bg-surface-deep border border-white/[0.05] flex items-center justify-center text-content-muted">
                <Upload size={24} />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-white">학습할 자료가 없습니다.</p>
                <p className="text-sm text-content-secondary">파일을 업로드해주세요.</p>
              </div>
              <button
                onClick={() => navigate('/files')}
                className="inline-flex bg-brand-500 text-brand-900 rounded-xl px-6 py-2.5 text-sm font-semibold hover:-translate-y-0.5 transition-transform mt-4"
              >
                파일 업로드하기
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-in-up stagger-1">
              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => navigate(`/study/${file.id}`)}
                  className="group relative text-left bg-surface border border-white/[0.05] rounded-2xl p-5 hover:bg-surface-hover hover:border-brand-500/30 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg font-medium text-white group-hover:text-brand-300 transition-colors truncate flex-1">
                        {file.original_filename || '제목 없는 자료'}
                      </h2>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-content-muted">
                        {new Intl.DateTimeFormat('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(file.created_at || ''))}
                      </span>
                      <StatusBadge status={file.status} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </SkeletonTransition>
  );
}
