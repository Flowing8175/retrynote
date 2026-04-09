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
            theme: 'dark',
            darkMode: true,
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
