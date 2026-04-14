import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isAxiosError } from 'axios';
import MermaidDiagram from '@/components/MermaidDiagram';
import { OptionGroup } from '@/components/ui';
import { diagramApi, type DiagramResponse, DIAGRAM_TYPES, type DiagramTypeValue } from '@/api/diagram';

type PageState = 'loading' | 'success' | 'error' | 'not-found' | 'quota_exceeded';

export default function DiagramPage() {
  const { conceptKey } = useParams<{ conceptKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const decodedKey = decodeURIComponent(conceptKey ?? '');

  const initialType = (searchParams.get('type') as DiagramTypeValue | null) ?? 'flowchart';
  const [selectedType, setSelectedType] = useState<DiagramTypeValue>(initialType);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [diagram, setDiagram] = useState<DiagramResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDiagram = async (force: boolean = false, type: DiagramTypeValue = selectedType) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPageState('loading');

    try {
      let data: DiagramResponse;
      if (force) {
        data = await diagramApi.generateDiagram(decodedKey, true, controller.signal, type);
      } else {
        try {
          data = await diagramApi.getCachedDiagram(decodedKey, controller.signal, type);
        } catch (err) {
          if (isAxiosError(err) && err.response?.status === 404) {
            data = await diagramApi.generateDiagram(decodedKey, false, controller.signal, type);
          } else {
            throw err;
          }
        }
      }
      setDiagram(data);
      setPageState('success');
    } catch (err) {
      if ((err as Error).name === 'CanceledError' || (err as Error).name === 'AbortError') return;
      if (isAxiosError(err) && err.response?.status === 402) {
        setPageState('quota_exceeded');
      } else {
        setPageState('error');
      }
    }
  };

  useEffect(() => {
    if (decodedKey) {
      fetchDiagram(false, selectedType);
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedKey]);

  const handleTypeChange = (type: DiagramTypeValue) => {
    setSelectedType(type);
    setSearchParams({ type });
    fetchDiagram(false, type);
  };

  const handleRegenerate = () => fetchDiagram(true, selectedType);
  const handleBack = () => navigate(-1);

  if (pageState === 'loading') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-content-muted">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (pageState === 'not-found') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-content-muted">다이어그램을 찾을 수 없습니다</p>
          <button
            onClick={handleBack}
            className="rounded-lg bg-surface-hover px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover/80 transition-colors"
          >
            ← 돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (pageState === 'quota_exceeded') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-content-secondary">
          다이어그램 생성을 위한 크레딧이 부족합니다.{' '}
          <Link to="/pricing" className="underline underline-offset-2 hover:text-white transition-colors">
            플랜 업그레이드
          </Link>
        </p>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-content-muted">불러오기 실패</p>
          <button
            onClick={() => fetchDiagram(false)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            재시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="rounded-lg p-1.5 text-content-muted hover:text-white hover:bg-surface-hover transition-colors"
            aria-label="돌아가기"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-content-primary">
            {diagram?.concept_label} — {diagram?.title}
          </h1>
        </div>
        <button
          onClick={handleRegenerate}
          className="rounded-lg bg-surface-hover px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-hover/80 transition-colors"
        >
          재생성
        </button>
      </div>

      <OptionGroup
        options={DIAGRAM_TYPES.map(({ value, label }) => ({ value, label }))}
        value={selectedType}
        onChange={(v) => handleTypeChange(v as DiagramTypeValue)}
        size="sm"
        layout="wrap"
      />

      <div className="min-h-[60vh] max-h-[80vh] overflow-y-auto overflow-x-auto rounded-2xl border border-white/[0.05] bg-[oklch(0.155_0.015_235)] p-6 sm:p-8">
        {diagram && <MermaidDiagram code={diagram.mermaid_code} className="w-full" />}
      </div>
    </div>
  );
}
