import { useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, FileX2, X } from 'lucide-react';
import { PdfViewer } from '@/components/study/PdfViewer';
import { useStudyStatus } from '@/api/study';
import { API_BASE_URL } from '@/api/createApiClient';
import type { ContentStatus } from '@/types/study';

const SummaryTab = lazy(() =>
  import('@/components/study/SummaryTab').then((m) => ({ default: m.SummaryTab }))
);
const FlashcardTab = lazy(() =>
  import('@/components/study/FlashcardTab').then((m) => ({ default: m.FlashcardTab }))
);
const MindmapTab = lazy(() =>
  import('@/components/study/MindmapTab').then((m) => ({ default: m.MindmapTab }))
);
const TutorTab = lazy(() =>
  import('@/components/study/TutorTab').then((m) => ({ default: m.TutorTab }))
);

type Tab = '요약' | '플래시카드' | '마인드맵' | 'Repla AI';

const TABS: Tab[] = ['요약', '플래시카드', '마인드맵', 'Repla AI'];

const STATUS_LABEL: Record<ContentStatus, string> = {
  not_generated: '생성 전',
  generating: '생성 중',
  completed: '완료',
  failed: '실패',
};

const STATUS_COLOR: Record<ContentStatus, string> = {
  not_generated: 'bg-surface-raised text-content-muted',
  generating: 'bg-brand-500/10 text-brand-300',
  completed: 'bg-semantic-success-bg text-semantic-success',
  failed: 'bg-semantic-error-bg text-semantic-error',
};

function tabStatus(tab: Tab, status: ReturnType<typeof useStudyStatus>['data']): ContentStatus {
  if (!status) return 'not_generated';
  switch (tab) {
    case '요약': return status.summary_status;
    case '플래시카드': return status.flashcards_status;
    case '마인드맵': return status.mindmap_status;
    default: return 'not_generated';
  }
}

function TabContent({ tab, fileId }: { tab: Tab; fileId: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-content-muted">로딩 중...</div>}>
      {tab === '요약' && <SummaryTab fileId={fileId} />}
      {tab === '플래시카드' && <FlashcardTab fileId={fileId} />}
      {tab === '마인드맵' && <MindmapTab fileId={fileId} />}
      {tab === 'Repla AI' && <TutorTab fileId={fileId} />}
    </Suspense>
  );
}

export default function StudyViewer() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('요약');
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showPdfOverlay, setShowPdfOverlay] = useState(false);

  const { data: status, isError, error } = useStudyStatus(fileId ?? '');

  const is404 = isError && (error as { response?: { status?: number } })?.response?.status === 404;
  const isPdf = status?.file_type?.toLowerCase() === 'pdf';
  const isShortDocument = status?.is_short_document === true;
  const filename = status?.filename ?? '문서';
  const pdfUrl = `${API_BASE_URL}/files/${fileId}/view`;

  function handleDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsDragging(true);

    function onMouseMove(ev: MouseEvent) {
      const container = document.getElementById('study-split-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(20, Math.min(80, pct)));
    }

    function onMouseUp() {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  if (is404) {
    return (
      <div className="fixed inset-0 top-16 z-30 flex flex-col bg-background overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
          <button
            onClick={() => navigate('/study')}
            className="flex items-center gap-1.5 text-content-secondary hover:text-white transition-colors text-sm"
          >
            <ChevronLeft size={18} />
            <span>학습 목록</span>
          </button>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-4">
          <span className="text-5xl">🗑️</span>
          <p className="text-content-secondary text-lg font-medium">이 자료는 더 이상 존재하지 않습니다</p>
          <p className="text-content-muted text-sm">삭제되었거나 접근할 수 없는 자료입니다.</p>
          <button
            onClick={() => navigate('/study')}
            className="mt-2 px-5 py-2 bg-brand-500 hover:bg-brand-400 text-content-inverse text-sm font-medium rounded-xl transition-colors"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-16 z-30 flex flex-col bg-background overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
        <button
          onClick={() => navigate('/study')}
          className="flex items-center gap-1.5 text-content-secondary hover:text-white transition-colors text-sm"
        >
          <ChevronLeft size={18} />
          <span>학습 목록</span>
        </button>
        <div className="w-px h-4 bg-white/[0.05]" />
        <h1 className="text-sm font-medium text-content-primary truncate flex-1">{filename}</h1>
      </header>

      {isShortDocument && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-semantic-warning-bg border-b border-semantic-warning-border text-semantic-warning text-sm shrink-0">
          <span>⚠️</span>
          <span>이 문서는 내용이 부족하여 학습 콘텐츠를 생성할 수 없습니다</span>
        </div>
      )}

      <div
        id="study-split-container"
        className="flex flex-1 min-h-0"
        style={{ cursor: isDragging ? 'col-resize' : 'default', userSelect: isDragging ? 'none' : 'auto' }}
      >
        {isPdf && (
          <>
            <div
              className="hidden lg:block min-h-0 overflow-hidden shrink-0"
              style={{ width: `${leftWidth}%` }}
            >
              <PdfViewer url={pdfUrl} />
            </div>

            <div
              className="hidden lg:flex items-center justify-center w-2 bg-white/[0.03] hover:bg-brand-500/30 active:bg-brand-500/50 transition-colors shrink-0 cursor-col-resize group"
              onMouseDown={handleDividerMouseDown}
            >
              <div className="w-1 h-8 rounded-full bg-white/[0.15] group-hover:bg-brand-400/60 transition-colors" />
            </div>
          </>
        )}

        <div className="flex flex-col min-h-0 flex-1">
          <div className="bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0 overflow-x-auto">
            <div className="flex items-center gap-2 px-3 py-2 whitespace-nowrap">
              {TABS.map((tab) => {
                const s = tabStatus(tab, status);
                const isActive = activeTab === tab;
                const isTabDisabled = isShortDocument && tab !== 'Repla AI';
                return (
                  <button
                    key={tab}
                    onClick={() => { if (!isTabDisabled) setActiveTab(tab); }}
                    disabled={isTabDisabled}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all shrink-0 ${
                      isActive
                        ? 'bg-brand-500/5 text-brand-300 border border-brand-500/10'
                        : 'text-content-secondary hover:text-white border border-transparent hover:bg-surface-hover'
                    } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-content-secondary`}
                  >
                    {tab}
                    {tab !== 'Repla AI' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLOR[s]}`}>
                        {STATUS_LABEL[s]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto bg-background p-4">
            {isShortDocument && activeTab !== 'Repla AI' ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <span className="text-4xl">📄</span>
                <p className="text-content-muted text-sm">
                  이 문서는 내용이 부족하여 학습 콘텐츠를 생성할 수 없습니다
                </p>
              </div>
            ) : (
              <TabContent tab={activeTab} fileId={fileId ?? ''} />
            )}
          </div>
        </div>
      </div>

      {showPdfOverlay && isPdf && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-surface/80 backdrop-blur-sm border-b border-white/[0.05] shrink-0">
            <button
              onClick={() => setShowPdfOverlay(false)}
              className="flex items-center gap-1.5 text-content-secondary hover:text-white transition-colors text-sm"
            >
              <X size={18} />
              <span>닫기</span>
            </button>
            <div className="w-px h-4 bg-white/[0.05]" />
            <span className="text-sm font-medium text-content-primary truncate flex-1">PDF 뷰어</span>
          </div>
          <div className="flex-1 min-h-0">
            <PdfViewer url={pdfUrl} />
          </div>
        </div>
      )}

      {isPdf && (
        <button
          onClick={() => setShowPdfOverlay((v) => !v)}
          className={`fixed bottom-6 right-4 lg:hidden flex items-center gap-2 rounded-full shadow-lg transition-colors text-sm font-medium ${
            showPdfOverlay
              ? 'z-[60] bg-surface-raised hover:bg-surface-hover text-content-secondary p-3 border border-white/[0.1]'
              : 'z-40 bg-brand-500 hover:bg-brand-400 active:bg-brand-600 text-content-inverse px-4 py-3'
          }`}
        >
          {showPdfOverlay ? (
            <FileX2 size={20} />
          ) : (
            <>
              <FileText size={16} />
              PDF 보기
            </>
          )}
        </button>
      )}
    </div>
  );
}
