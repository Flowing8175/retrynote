import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useQueryClient } from '@tanstack/react-query';
import { useChatHistory } from '@/api/study';
import { useSSE } from '@/hooks/useSSE';
import { useStudyStore } from '@/stores/studyStore';
import apiClient from '@/api/client';

interface Props {
  fileId: string;
  currentPage?: number;
}

const SUGGESTIONS = [
  '이 자료의 핵심 개념을 설명해 주세요',
  '어떤 부분을 더 공부해야 할까요?',
  '가장 중요한 내용 3가지를 알려주세요',
];

export function TutorTab({ fileId, currentPage }: Props) {
  const queryClient = useQueryClient();
  const {
    chatMessages,
    isStreaming,
    streamingContent,
    selectedPageForCapture,
    setChatMessages,
    addUserMessage,
    appendStreamingContent,
    finalizeStreamingMessage,
    clearMessages,
    setIsStreaming,
    setSelectedPage,
  } = useStudyStore();

  const markdownComponents: Components = useMemo(
    () => ({
      h1({ children }) {
        return (
          <h1 className="text-base font-semibold text-content-primary mt-5 mb-2 pb-1 border-b border-surface-border first:mt-0">
            {children}
          </h1>
        );
      },
      h2({ children }) {
        return (
          <h2 className="text-sm font-bold text-content-primary mt-4 mb-1.5 first:mt-0">
            {children}
          </h2>
        );
      },
      h3({ children }) {
        return (
          <h3 className="text-sm font-semibold text-content-primary mt-3 mb-1 first:mt-0">
            {children}
          </h3>
        );
      },
      h4({ children }) {
        return (
          <h4 className="text-sm font-semibold text-content-primary mt-3 mb-1 first:mt-0">
            {children}
          </h4>
        );
      },
      h5({ children }) {
        return (
          <h5 className="text-sm font-medium text-content-secondary mt-3 mb-1 first:mt-0">
            {children}
          </h5>
        );
      },
      h6({ children }) {
        return (
          <h6 className="text-sm font-medium text-content-secondary mt-3 mb-1 first:mt-0">
            {children}
          </h6>
        );
      },
      p({ children }) {
        return (
          <p className="text-sm leading-7 text-content-primary mb-3 last:mb-0 first:mt-0">
            {children}
          </p>
        );
      },
      ul({ children }) {
        return (
          <ul className="list-disc pl-5 space-y-1 mb-3 text-content-primary text-sm last:mb-0">
            {children}
          </ul>
        );
      },
      ol({ children }) {
        return (
          <ol className="list-decimal pl-5 space-y-1 mb-3 text-content-primary text-sm last:mb-0">
            {children}
          </ol>
        );
      },
      li({ children }) {
        return (
          <li className="text-content-primary leading-relaxed">
            {children}
          </li>
        );
      },
      strong({ children }) {
        return (
          <strong className="bg-brand-500/10 text-brand-300 px-1 rounded font-semibold not-italic">
            {children}
          </strong>
        );
      },
      a({ href, children }) {
        return (
          <a
            href={href}
            className="text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        );
      },
      pre({ children }) {
        return (
          <pre className="bg-surface-raised text-content-primary text-xs font-mono rounded-lg p-3 my-3 overflow-x-auto border border-surface-border last:mb-0">
            {children}
          </pre>
        );
      },
      code({ className, children }) {
        if (className && className.startsWith('language-')) {
          return <code className="font-mono text-xs text-content-primary">{children}</code>;
        }
        return (
          <code className="bg-surface-raised text-brand-300 px-1.5 py-0.5 rounded text-xs font-mono">
            {children}
          </code>
        );
      },
      blockquote({ children }) {
        return (
          <blockquote className="border-l-2 border-brand-500/40 pl-4 my-3 text-content-secondary italic">
            {children}
          </blockquote>
        );
      },
      table({ children }) {
        return (
          <div className="overflow-x-auto mb-4 rounded-lg border border-surface-border">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        );
      },
      thead({ children }) {
        return <thead className="bg-surface-raised">{children}</thead>;
      },
      th({ children }) {
        return (
          <th className="text-left px-2.5 py-1.5 text-content-primary font-semibold border-b border-surface-border text-xs uppercase tracking-wider">
            {children}
          </th>
        );
      },
      td({ children }) {
        return (
          <td className="px-2.5 py-1.5 text-content-secondary border-b border-surface-border text-sm">
            {children}
          </td>
        );
      },
      hr() {
        return <hr className="border-surface-border my-3" />;
      },
    }),
    [],
  );

  const [inputText, setInputText] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [sseEnabled, setSseEnabled] = useState(false);
  const [shouldSyncHistory, setShouldSyncHistory] = useState(true);
  const [sseError, setSseError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: historyData, refetch: refetchHistory } = useChatHistory(fileId);

  useEffect(() => {
    clearMessages();
    setShouldSyncHistory(true);
  }, [fileId]);

  useEffect(() => {
    if (historyData?.messages && shouldSyncHistory && !isStreaming) {
      setChatMessages(historyData.messages);
      setShouldSyncHistory(false);
    }
  }, [historyData, shouldSyncHistory, isStreaming]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, streamingContent]);

  useSSE(streamUrl, {
    enabled: sseEnabled,
    onMessage: (data) => {
      let token = '';
      if (typeof data === 'string') {
        token = data;
      } else if (data !== null && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        if (typeof d.token === 'string') token = d.token;
        else if (typeof d.content === 'string') token = d.content;
        else if (typeof d.text === 'string') token = d.text;
      }
      if (token) appendStreamingContent(token);
    },
    onDone: () => {
      finalizeStreamingMessage();
      setSseEnabled(false);
      void queryClient.invalidateQueries({ queryKey: ['study', 'chat', 'history', fileId] });
    },
    onError: () => {
      setSseEnabled(false);
      setIsStreaming(false);
      setSseError('연결이 끊겼습니다. 다시 시도해주세요');
    },
  });

  const sendMessage = useCallback(() => {
    const msg = inputText.trim();
    if (!msg || isStreaming) return;

    setSseError(null);
    const page = selectedPageForCapture;
    addUserMessage(msg, page);
    setInputText('');
    setSelectedPage(null);

    const params = new URLSearchParams({ message: msg });
    if (page != null) params.set('page_context', String(page));
    setStreamUrl(`/study/${fileId}/chat/stream?${params}`);
    setSseEnabled(true);
  }, [inputText, isStreaming, selectedPageForCapture, fileId, addUserMessage, setSelectedPage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleNewChat = async () => {
    if (isStreaming) return;
    await apiClient.post(`/study/${fileId}/chat/new`);
    clearMessages();
    const { data } = await refetchHistory();
    if (data?.messages) {
      setChatMessages(data.messages);
    }
  };

  const handleLasso = () => {
    if (currentPage != null) {
      setSelectedPage(selectedPageForCapture === currentPage ? null : currentPage);
    }
  };

  const hasMessages = chatMessages.length > 0 || isStreaming;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] flex-shrink-0">
        <h2 className="text-sm font-semibold text-content-primary">Repla</h2>
        <button
          onClick={() => void handleNewChat()}
          disabled={isStreaming}
          className="text-xs text-content-muted hover:text-content-primary disabled:opacity-50 transition-colors px-2 py-1 rounded-lg hover:bg-surface-raised"
        >
          새 채팅
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <span className="text-4xl mb-4">🤖</span>
            <p className="text-content-secondary font-medium mb-2">Repla에게 무엇이든 물어보세요!</p>
            <p className="text-content-muted text-sm mb-6">현재 학습 중인 자료에 대해 자유롭게 질문하세요.</p>
            <div className="space-y-2 w-full max-w-xs">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInputText(q);
                    textareaRef.current?.focus();
                  }}
                  className="w-full text-left text-sm text-content-secondary hover:text-content-primary bg-surface hover:bg-surface-raised rounded-xl px-3 py-2 transition-colors border border-white/[0.05]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-brand-500/15 border border-brand-500/10 text-content-primary rounded-tr-sm'
                      : 'bg-surface border border-white/[0.05] text-content-primary rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div>
                      {msg.pageContext != null && (
                        <p className="text-xs text-brand-300 mb-1">📄 {msg.pageContext}페이지에서 질문</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-surface border border-white/[0.05] text-content-primary rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
                  {streamingContent ? (
                    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{streamingContent}</ReactMarkdown>
                  ) : (
                    <div className="flex gap-1 items-center py-1">
                      <span className="w-2 h-2 bg-content-muted rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-content-muted rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-content-muted rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/[0.05] px-4 py-3 flex-shrink-0">
        {sseError && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-semantic-error-bg border border-semantic-error-border rounded-xl text-semantic-error text-xs">
            <span>⚠️</span>
            <span>{sseError}</span>
          </div>
        )}
        {selectedPageForCapture != null && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-brand-400 bg-brand-500/10 rounded-full px-3 py-1 flex items-center gap-1">
              📄 {selectedPageForCapture}페이지에서 질문
              <button
                onClick={() => setSelectedPage(null)}
                className="ml-1 text-brand-300 hover:text-brand-100 leading-none"
                aria-label="페이지 컨텍스트 제거"
              >
                ×
              </button>
            </span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder="메시지 입력... (Shift+Enter 줄바꿈)"
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-surface text-content-primary placeholder-content-muted rounded-xl px-4 py-3 text-sm resize-none disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-brand-500 border border-white/[0.05]"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          {currentPage != null && (
            <button
              onClick={handleLasso}
              title={`${currentPage}페이지 컨텍스트 ${selectedPageForCapture === currentPage ? '제거' : '추가'}`}
              className={`flex-shrink-0 w-11 h-11 rounded-xl transition-colors flex items-center justify-center text-base ${
                selectedPageForCapture === currentPage
                  ? 'bg-brand-500 text-content-inverse'
                  : 'bg-surface-raised text-content-muted hover:text-content-primary hover:bg-surface-hover border border-white/[0.05]'
              }`}
            >
              📄
            </button>
          )}
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isStreaming}
            className="flex-shrink-0 w-11 h-11 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-content-inverse rounded-xl transition-colors flex items-center justify-center"
            aria-label="전송"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
