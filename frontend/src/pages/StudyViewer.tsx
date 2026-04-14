import { useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, X } from 'lucide-react';
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

type Tab = '요약' | '플래시카드' | '마인드맵' | 'AI Tutor';

const TABS: Tab[] = ['요약', '플래시카드', '마인드맵', 'AI Tutor'];

const STATUS_LABEL: Record<ContentStatus, string> = {
  not_generated: '생성 전',
  generating: '생성 중',
  completed: '완료',
  failed: '실패',
};

const STATUS_COLOR: Record<ContentStatus, string> = {
  not_generated: 'bg-gray-700 text-gray-400',
  generating: 'bg-blue-900 text-blue-300',
  completed: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-400',
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
    <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">로딩 중...</div>}>
      {tab === '요약' && <SummaryTab fileId={fileId} />}
      {tab === '플래시카드' && <FlashcardTab fileId={fileId} />}
      {tab === '마인드맵' && <MindmapTab fileId={fileId} />}
      {tab === 'AI Tutor' && <TutorTab fileId={fileId} />}
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

  const { data: status } = useStudyStatus(fileId ?? '');

  const isPdf = status?.file_type?.toLowerCase() === 'pdf';
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <button
          onClick={() => navigate('/study')}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ChevronLeft size={18} />
          <span>학습 목록</span>
        </button>
        <div className="w-px h-4 bg-gray-700" />
        <h1 className="text-sm font-medium text-white truncate flex-1">{filename}</h1>
      </header>

      <div
        id="study-split-container"
        className="flex flex-1 min-h-0"
        style={{ cursor: isDragging ? 'col-resize' : 'default' }}
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
              className="hidden lg:block w-1 bg-gray-700 hover:bg-blue-500 transition-colors shrink-0 cursor-col-resize"
              onMouseDown={handleDividerMouseDown}
            />
          </>
        )}

        <div className="flex flex-col min-h-0 flex-1">
          <div className="bg-gray-800 border-b border-gray-700 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1 px-3 pt-3 pb-0 whitespace-nowrap">
              {TABS.map((tab) => {
                const s = tabStatus(tab, status);
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t transition-colors shrink-0 ${
                      isActive
                        ? 'bg-gray-900 text-white border-t border-l border-r border-gray-700'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {tab}
                    {tab !== 'AI Tutor' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLOR[s]}`}>
                        {STATUS_LABEL[s]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto bg-gray-900 p-4">
            <TabContent tab={activeTab} fileId={fileId ?? ''} />
          </div>
        </div>
      </div>

      {showPdfOverlay && isPdf && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
            <button
              onClick={() => setShowPdfOverlay(false)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <X size={18} />
              <span>닫기</span>
            </button>
            <div className="w-px h-4 bg-gray-700" />
            <span className="text-sm font-medium text-white truncate flex-1">PDF 뷰어</span>
          </div>
          <div className="flex-1 min-h-0">
            <PdfViewer url={pdfUrl} />
          </div>
        </div>
      )}

      {isPdf && (
        <button
          onClick={() => setShowPdfOverlay(true)}
          className="fixed bottom-6 right-4 z-40 lg:hidden flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg transition-colors text-sm font-medium"
        >
          <FileText size={16} />
          PDF 보기
        </button>
      )}
    </div>
  );
}
