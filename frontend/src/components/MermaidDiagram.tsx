import { useEffect, useState } from 'react';

// Module-level flag: mermaid is initialized at most once per app lifecycle
let mermaidInitialized = false;

type RenderState = 'loading' | 'success' | 'error';

interface MermaidDiagramProps {
  code: string;
  className?: string;
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
            themeVariables: {
              darkMode: true,
              background: 'transparent',
              fontFamily: "'SUIT Variable', 'Pretendard Variable', 'Noto Sans KR', system-ui, sans-serif",
              primaryColor: '#1a332f',
              primaryTextColor: '#e4e8ec',
              primaryBorderColor: '#4db8a8',
              secondaryColor: '#1a2d3d',
              secondaryTextColor: '#e4e8ec',
              secondaryBorderColor: '#5a9faf',
              tertiaryColor: '#1a3328',
              tertiaryTextColor: '#e4e8ec',
              tertiaryBorderColor: '#4aaf82',
              lineColor: '#5e9e9e',
              textColor: '#e4e8ec',
              mainBkg: '#1a332f',
              nodeBorder: '#4db8a8',
              nodeTextColor: '#e4e8ec',
            },
          });
          mermaidInitialized = true;
        }

        // Generate a fresh render ID each time code changes to avoid stale-ID conflicts
        const renderId = `mermaid-${crypto.randomUUID()}`;

        const { svg: renderedSvg } = await mermaid.render(renderId, code);

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
