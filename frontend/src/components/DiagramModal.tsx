import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import Modal from './Modal';
import MermaidDiagram from './MermaidDiagram';
import { diagramApi, type DiagramResponse } from '@/api/diagram';

interface DiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  conceptKey: string;
  conceptLabel: string;
}

type FetchState = 'loading' | 'success' | 'error';

export default function DiagramModal({
  isOpen,
  onClose,
  conceptKey,
  conceptLabel,
}: DiagramModalProps) {
  const navigate = useNavigate();
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [diagram, setDiagram] = useState<DiagramResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDiagram = async (force: boolean = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setFetchState('loading');
    setDiagram(null);

    try {
      let data: DiagramResponse;
      if (force) {
        data = await diagramApi.generateDiagram(conceptKey, true, signal);
      } else {
        try {
          data = await diagramApi.getCachedDiagram(conceptKey, signal);
        } catch (err) {
          if (isAxiosError(err) && err.response?.status === 404) {
            data = await diagramApi.generateDiagram(conceptKey, false, signal);
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
      setFetchState('error');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      return;
    }
    fetchDiagram(false);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conceptKey]);

  const handleRegenerate = () => {
    fetchDiagram(true);
  };

  const handleExpand = () => {
    navigate(`/diagram/${encodeURIComponent(conceptKey)}`);
  };

  const handleRetry = () => {
    fetchDiagram(false);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={conceptLabel} size="4xl">
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
          <MermaidDiagram code={diagram.mermaid_code} />
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
