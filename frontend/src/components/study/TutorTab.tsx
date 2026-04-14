import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
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

  const [inputText, setInputText] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [sseEnabled, setSseEnabled] = useState(false);
  const [shouldSyncHistory, setShouldSyncHistory] = useState(true);

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
    },
    onError: () => {
      setSseEnabled(false);
      setIsStreaming(false);
    },
  });

  const sendMessage = useCallback(() => {
    const msg = inputText.trim();
    if (!msg || isStreaming) return;

    const page = selectedPageForCapture;
    addUserMessage(msg, page);
    setInputText('');
    setSelectedPage(null);

    const url = `/study/${fileId}/chat/stream?message=${encodeURIComponent(msg)}&page_context=${page ?? ''}`;
    setStreamUrl(url);
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
    setShouldSyncHistory(true);
    void queryClient.invalidateQueries({ queryKey: ['study', 'chat', 'history', fileId] });
    await refetchHistory();
  };

  const handleLasso = () => {
    if (currentPage != null) {
      setSelectedPage(selectedPageForCapture === currentPage ? null : currentPage);
    }
  };

  const hasMessages = chatMessages.length > 0 || isStreaming;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">AI 튜터</h2>
        <button
          onClick={() => void handleNewChat()}
          disabled={isStreaming}
          className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-gray-700"
        >
          새 채팅
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <span className="text-4xl mb-4">🤖</span>
            <p className="text-gray-300 font-medium mb-2">AI 튜터에게 무엇이든 물어보세요!</p>
            <p className="text-gray-500 text-sm mb-6">현재 학습 중인 자료에 대해 자유롭게 질문하세요.</p>
            <div className="space-y-2 w-full max-w-xs">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInputText(q);
                    textareaRef.current?.focus();
                  }}
                  className="w-full text-left text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
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
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-700 text-gray-100 rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div>
                      {msg.pageContext != null && (
                        <p className="text-xs text-blue-200 mb-1">📄 {msg.pageContext}페이지에서 질문</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-gray-700 text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
                  {streamingContent ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{streamingContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center py-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-700 px-4 py-3 flex-shrink-0">
        {selectedPageForCapture != null && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-blue-400 bg-blue-900/30 rounded-full px-3 py-1 flex items-center gap-1">
              📄 {selectedPageForCapture}페이지에서 질문
              <button
                onClick={() => setSelectedPage(null)}
                className="ml-1 text-blue-300 hover:text-blue-100 leading-none"
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
            className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-3 text-sm resize-none disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          {currentPage != null && (
            <button
              onClick={handleLasso}
              title={`${currentPage}페이지 컨텍스트 ${selectedPageForCapture === currentPage ? '제거' : '추가'}`}
              className={`flex-shrink-0 w-11 h-11 rounded-xl transition-colors flex items-center justify-center text-base ${
                selectedPageForCapture === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-600'
              }`}
            >
              📄
            </button>
          )}
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isStreaming}
            className="flex-shrink-0 w-11 h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center"
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
