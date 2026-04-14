import { useEffect, useState } from 'react';

// Module-level flag: mermaid is initialized at most once per app lifecycle
let mermaidInitialized = false;

type RenderState = 'loading' | 'success' | 'error';

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

const WRAP_MAX_CHARS = 11;

function hardBreak(token: string): string[] {
  const chunks: string[] = [];
  let remaining = token;
  while (remaining.length > WRAP_MAX_CHARS) {
    chunks.push(remaining.slice(0, WRAP_MAX_CHARS));
    remaining = remaining.slice(WRAP_MAX_CHARS);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

function wrapLabelText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= WRAP_MAX_CHARS || /<br\s*\/?>/i.test(trimmed)) return trimmed;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';

  for (const tok of tokens) {
    if (tok.length > WRAP_MAX_CHARS) {
      if (cur) { lines.push(cur); cur = ''; }
      const pieces = hardBreak(tok);
      lines.push(...pieces.slice(0, -1));
      cur = pieces[pieces.length - 1];
      continue;
    }
    const candidate = cur ? `${cur} ${tok}` : tok;
    if (candidate.length > WRAP_MAX_CHARS) {
      if (cur) lines.push(cur);
      cur = tok;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 1 ? lines.join('<br/>') : trimmed;
}

function preprocessMindmap(code: string): string {
  const lines = code.split('\n');
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      const indentLen = line.length - line.trimStart().length;
      const indent = line.slice(0, indentLen);
      const body = line.slice(indentLen);

      if (/^mindmap\b/i.test(body) || body.startsWith('%%') || body.startsWith('::')) {
        return line;
      }

      const shapes: Array<[RegExp, string, string]> = [
        [/^([\w가-힣]*)\)\)(.+)\(\((.*)$/, '))', '(('],
        [/^([\w가-힣]*)\(\((.+)\)\)(.*)$/, '((', '))'],
        [/^([\w가-힣]*)\{\{(.+)\}\}(.*)$/, '{{', '}}'],
        [/^([\w가-힣]*)\)(.+)\((.*)$/, ')', '('],
        [/^([\w가-힣]*)\[(.+)\](.*)$/, '[', ']'],
        [/^([\w가-힣]*)\((.+)\)(.*)$/, '(', ')'],
      ];

      for (const [re, open, close] of shapes) {
        const m = body.match(re);
        if (m) {
          const [, id, rawText, rest] = m;
          const unquoted = rawText.replace(/^"([\s\S]*)"$/, '$1');
          return `${indent}${id}${open}"${wrapLabelText(unquoted)}"${close}${rest}`;
        }
      }

      return `${indent}["${wrapLabelText(body)}"]`;
    })
    .join('\n');
}

function preprocessMermaidCode(code: string): string {
  const firstLine = code.trimStart().split('\n', 1)[0].trim().toLowerCase();
  if (firstLine.startsWith('mindmap')) return preprocessMindmap(code);

  let result = code.replace(/"([^"\n]+)"/g, (_, t) => `"${wrapLabelText(t)}"`);

  const unquotedShapes: Array<{ open: string; close: string; re: RegExp }> = [
    { open: '[[', close: ']]', re: /([\w가-힣]+)\[\[([^\[\]"|<>\n]+)\]\]/g },
    { open: '((', close: '))', re: /([\w가-힣]+)\(\(([^()"|<>\n]+)\)\)/g },
    { open: '{{', close: '}}', re: /([\w가-힣]+)\{\{([^{}"|<>\n]+)\}\}/g },
    { open: '[', close: ']', re: /([\w가-힣]+)\[([^\[\]"|<>\n]+)\]/g },
    { open: '(', close: ')', re: /([\w가-힣]+)\(([^()"|<>\n]+)\)/g },
    { open: '{', close: '}', re: /([\w가-힣]+)\{([^{}"|<>\n]+)\}/g },
  ];

  for (const { open, close, re } of unquotedShapes) {
    result = result.replace(re, (match, id, text) => {
      const trimmed = text.trim();
      if (trimmed.length <= WRAP_MAX_CHARS) return match;
      return `${id}${open}"${wrapLabelText(trimmed)}"${close}`;
    });
  }

  return result;
}

export default function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const [state, setState] = useState<RenderState>('loading');
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (!code.trim()) return;

    let cancelled = false;

    const renderDiagram = async () => {
      setState('loading');

      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: 'base',
            darkMode: true,
            fontFamily: "'SUIT Variable', 'Pretendard Variable', 'Noto Sans KR', system-ui, sans-serif",
            fontSize: 14,
            mindmap: {
              padding: 14,
              maxNodeWidth: 220,
            },
            flowchart: {
              htmlLabels: true,
              curve: 'basis',
              padding: 12,
            },
            themeVariables: {
              darkMode: true,
              background: 'transparent',
              fontFamily: "'SUIT Variable', 'Pretendard Variable', 'Noto Sans KR', system-ui, sans-serif",
              primaryColor: '#2a3a3e',
              primaryTextColor: '#d8dde2',
              primaryBorderColor: '#5a8a84',
              secondaryColor: '#2a3540',
              secondaryTextColor: '#d8dde2',
              secondaryBorderColor: '#5a7a8a',
              tertiaryColor: '#2a3a35',
              tertiaryTextColor: '#d8dde2',
              tertiaryBorderColor: '#5a8a6e',
              lineColor: '#4a7070',
              textColor: '#d8dde2',
              mainBkg: '#2a3a3e',
              nodeBorder: '#5a8a84',
              nodeTextColor: '#d8dde2',
            },
          });
          mermaidInitialized = true;
        }

        // Generate a fresh render ID each time code changes to avoid stale-ID conflicts
        const renderId = `mermaid-${crypto.randomUUID()}`;

        const { svg: renderedSvg } = await mermaid.render(renderId, preprocessMermaidCode(code));

        if (cancelled) return;

        setSvg(renderedSvg);
        setState('success');
      } catch {
        if (cancelled) return;
        setState('error');
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state === 'loading') {
    return <div className={`animate-pulse rounded-lg bg-surface-hover h-64 ${className ?? ''}`} />;
  }

  if (state === 'error') {
    return (
      <div className={`rounded-lg border border-red-500/20 bg-red-500/10 p-4 ${className ?? ''}`}>
        <p className="text-sm text-red-400 mb-2">다이어그램을 표시할 수 없습니다</p>
        <pre className="text-xs text-content-muted overflow-x-auto whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div
      className={`mermaid-diagram overflow-x-auto ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
