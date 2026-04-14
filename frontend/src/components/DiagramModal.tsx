import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import Modal from './Modal';
import MermaidDiagram from './MermaidDiagram';
import { OptionGroup } from '@/components/ui';
import { diagramApi, type DiagramResponse, DIAGRAM_TYPES, type DiagramTypeValue } from '@/api/diagram';

interface DiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  conceptKey: string;
  conceptLabel: string;
}

type FetchState = 'loading' | 'success' | 'error' | 'quota_exceeded';

export default function DiagramModal({
  isOpen,
  onClose,
  conceptKey,
  conceptLabel,
}: DiagramModalProps) {
  const navigate = useNavigate();
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [diagram, setDiagram] = useState<DiagramResponse | null>(null);
  const [selectedType, setSelectedType] = useState<DiagramTypeValue>('flowchart');
  const abortRef = useRef<AbortController | null>(null);

  const fetchDiagram = async (force: boolean = false, type: DiagramTypeValue = selectedType) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setFetchState('loading');
    setDiagram(null);

    try {
      let data: DiagramResponse;
      if (force) {
        data = await diagramApi.generateDiagram(conceptKey, true, signal, type);
      } else {
        try {
          data = await diagramApi.getCachedDiagram(conceptKey, signal, type);
        } catch (err) {
          if (isAxiosError(err) && err.response?.status === 404) {
            data = await diagramApi.generateDiagram(conceptKey, false, signal, type);
          } else {
            throw err;
          }
        }
      }
      setDiagram(data);
      setFetchState('success');
    } catch (err) {
      if ((err as Error).name === 'CanceledError' || (err as Error).name === 'AbortError') {
        return;
      }
      if (isAxiosError(err) && err.response?.status === 402) {
        setFetchState('quota_exceeded');
      } else {
        setFetchState('error');
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      return;
    }
    fetchDiagram(false, selectedType);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conceptKey]);

  const handleTypeChange = (type: DiagramTypeValue) => {
    setSelectedType(type);
    fetchDiagram(false, type);
  };

  const handleRegenerate = () => {
    fetchDiagram(true, selectedType);
  };

  const handleExpand = () => {
    navigate(`/diagram/${encodeURIComponent(conceptKey)}?type=${selectedType}`);
  };

  const handleRetry = () => {
    fetchDiagram(false, selectedType);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={conceptLabel} size="4xl">
      <div className="mb-3">
        <OptionGroup
          options={DIAGRAM_TYPES.map(({ value, label }) => ({
            value,
            label,
            disabled: fetchState === 'loading',
          }))}
          value={selectedType}
          onChange={(v) => handleTypeChange(v as DiagramTypeValue)}
          size="sm"
          layout="wrap"
        />
      </div>

      {fetchState === 'loading' && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-content-muted">다이어그램을 생성하는 중...</p>
        </div>
      )}

      {fetchState === 'success' && diagram && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-content-muted">{diagram.title}</h3>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                className="rounded-lg bg-surface-hover px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-hover/80 transition-colors"
              >
                재생성
              </button>
              <button
                onClick={handleExpand}
                className="rounded-lg bg-surface-hover px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-hover/80 transition-colors"
              >
                확대
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto overflow-x-auto rounded-xl border border-white/[0.04] bg-[oklch(0.145_0.015_235)] p-4">
            <MermaidDiagram code={diagram.mermaid_code} />
          </div>
        </div>
      )}

      {fetchState === 'quota_exceeded' && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-content-secondary">
            다이어그램 생성을 위한 크레딧이 부족합니다.{' '}
            <Link to="/pricing" className="underline underline-offset-2 hover:text-white transition-colors" onClick={handleClose}>
              플랜 업그레이드
            </Link>
          </p>
        </div>
      )}

      {fetchState === 'error' && (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-content-muted">다이어그램 생성에 실패했습니다</p>
          <button
            onClick={handleRetry}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            재시도
          </button>
        </div>
      )}
    </Modal>
  );
}
