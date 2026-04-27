import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE } from './useSSE';
import type { StudyContentType, StudyStreamEvent, StudyStreamingState, StudyStreamStage } from '@/types/study';

const initialState: StudyStreamingState = {
  isStreaming: false,
  stage: null,
  thinkingText: '',
  thinkingActive: false,
  result: null,
  error: null,
};

export function useStudyStreaming(
  fileId: string,
  contentType: StudyContentType,
  options?: { onResult?: (data: Record<string, unknown>) => void },
) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StudyStreamingState>(initialState);
  const [sseUrl, setSseUrl] = useState('');
  const [sseEnabled, setSseEnabled] = useState(false);
  const onResultRef = useRef(options?.onResult);
  onResultRef.current = options?.onResult;

  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as StudyStreamEvent;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

    switch (msg.type) {
      case 'stage':
        setState((s) => ({ ...s, stage: msg.stage as StudyStreamStage }));
        break;
      case 'thinking_start':
        setState((s) => ({ ...s, thinkingActive: true, thinkingText: '' }));
        break;
      case 'thinking_chunk':
        setState((s) => ({ ...s, thinkingText: s.thinkingText + (msg.text ?? '') }));
        break;
      case 'thinking_end':
        setState((s) => ({ ...s, thinkingActive: false }));
        break;
      case 'result':
        setState((s) => ({ ...s, result: msg.data as Record<string, unknown> }));
        onResultRef.current?.(msg.data as Record<string, unknown>);
        break;
    }
  }, []);

  const handleDone = useCallback(() => {
    setSseEnabled(false);
    setState((s) => ({ ...s, isStreaming: false }));
    void queryClient.invalidateQueries({ queryKey: ['study', 'status', fileId] });
    void queryClient.invalidateQueries({ queryKey: ['study', contentType === 'concept-notes' ? 'concept-notes' : contentType, fileId] });
    void queryClient.invalidateQueries({ queryKey: ['study', 'versions', fileId, contentType] });
  }, [queryClient, fileId, contentType]);

  const handleError = useCallback((errMsg: string) => {
    setSseEnabled(false);
    setState((s) => ({ ...s, isStreaming: false, error: errMsg }));
    void queryClient.invalidateQueries({ queryKey: ['study', 'status', fileId] });
  }, [queryClient, fileId]);

  const { close } = useSSE(sseUrl, {
    enabled: sseEnabled,
    onMessage: handleMessage,
    onDone: handleDone,
    onError: handleError,
  });

  const startStreaming = useCallback(() => {
    setState({ ...initialState, isStreaming: true });
    setSseUrl(`/study/${fileId}/${contentType}/generate/stream`);
    setSseEnabled(true);
  }, [fileId, contentType]);

  const cancelStreaming = useCallback(() => {
    close();
    setSseEnabled(false);
    setState(initialState);
    void queryClient.invalidateQueries({ queryKey: ['study', 'status', fileId] });
  }, [close, queryClient, fileId]);

  return { startStreaming, cancelStreaming, state };
}
