import { lazy, Suspense, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, Network, RefreshCw } from 'lucide-react';
import { useStudyStatus, useStudyMindmap, useGenerateContent } from '@/api/study';
import type { StudyMindmapNode, StudyMindmapEdge } from '@/types/study';
import type { MindmapFlowNode, MindmapFlowEdge } from './MindmapFlow';

const MindmapFlow = lazy(() => import('./MindmapFlow'));

// BFS depth computation — needed because backend nodes lack `depth` but
// MindmapFlow's getNodeStyle() requires it for visual hierarchy styling.
function enrichWithDepth(
  rawNodes: StudyMindmapNode[],
  rawEdges: StudyMindmapEdge[],
): { nodes: MindmapFlowNode[]; edges: MindmapFlowEdge[] } {
  const targets = new Set(rawEdges.map((e) => e.target));
  const childrenMap = new Map<string, string[]>();
  for (const edge of rawEdges) {
    const list = childrenMap.get(edge.source) ?? [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  }

  const depthMap = new Map<string, number>();
  const roots = rawNodes.filter((n) => !targets.has(n.id));
  const queue = roots.map((r) => ({ id: r.id, depth: 0 }));
  if (queue.length === 0 && rawNodes.length > 0) {
    queue.push({ id: rawNodes[0].id, depth: 0 });
  }
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depthMap.has(id)) continue;
    depthMap.set(id, depth);
    for (const childId of childrenMap.get(id) ?? []) {
      if (!depthMap.has(childId)) queue.push({ id: childId, depth: depth + 1 });
    }
  }

  const nodes: MindmapFlowNode[] = rawNodes.map((n) => ({
    id: n.id,
    type: n.type ?? 'mindmap',
    position: n.position,
    data: { label: String(n.data?.label ?? n.id), depth: depthMap.get(n.id) ?? 0 },
  }));

  const edges: MindmapFlowEdge[] = rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    style: e.style as React.CSSProperties | undefined,
  }));

  return { nodes, edges };
}

interface MindmapTabProps {
  fileId: string;
}

export function MindmapTab({ fileId }: MindmapTabProps) {
  const queryClient = useQueryClient();
  const { data: statusData } = useStudyStatus(fileId);
  const mindmapStatus = statusData?.mindmap_status ?? 'not_generated';

  const { data: mindmap, isLoading } = useStudyMindmap(fileId, {
    enabled: mindmapStatus === 'completed',
  });
  const { mutate: generate, isPending: isGenerating } = useGenerateContent(fileId);

  useEffect(() => {
    if (mindmapStatus === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['study', 'mindmap', fileId] });
    }
  }, [mindmapStatus, fileId, queryClient]);

  const status = mindmapStatus;

  if (status === 'generating' || (status === 'completed' && isLoading)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-content-muted">
        <Loader2 size={28} className="animate-spin text-brand-400" />
        <span className="text-sm">
          {status === 'generating' ? '마인드맵을 생성하고 있습니다...' : '불러오는 중...'}
        </span>
      </div>
    );
  }

  if (status === 'not_generated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-content-muted">
        <Network size={40} className="text-content-muted" />
        <p className="text-sm text-center">아직 마인드맵이 생성되지 않았습니다</p>
        <button
          onClick={() => generate('mindmap')}
          disabled={isGenerating}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-content-inverse text-sm font-medium rounded-xl transition-colors"
        >
          {isGenerating && <Loader2 size={14} className="animate-spin" />}
          마인드맵 생성
        </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-semantic-error">
        <AlertCircle size={28} />
        <span className="text-sm">마인드맵 생성에 실패했습니다</span>
        <button
          onClick={() => generate('mindmap')}
          disabled={isGenerating}
          className="flex items-center gap-2 mt-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-content-inverse rounded-xl transition-colors"
        >
          {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          재생성
        </button>
      </div>
    );
  }

  const rawData = mindmap?.data;
  const hasData = rawData && Array.isArray(rawData.nodes) && rawData.nodes.length > 0;

  const layout = useMemo(
    () => (hasData ? enrichWithDepth(rawData.nodes, rawData.edges ?? []) : null),
    [hasData, rawData],
  );

  if (!layout) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-content-muted">
        <Network size={32} className="text-content-muted" />
        <span className="text-sm">마인드맵 데이터가 없습니다</span>
        <button
          onClick={() => generate('mindmap')}
          disabled={isGenerating}
          className="flex items-center gap-2 mt-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-content-inverse rounded-xl transition-colors"
        >
          {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          재생성
        </button>
      </div>
    );
  }

  const { nodes, edges } = layout;

  return (
    <div className="relative w-full h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full gap-2 text-content-muted">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">마인드맵 로딩 중...</span>
          </div>
        }
      >
        <MindmapFlow nodes={nodes} edges={edges} />
      </Suspense>
      <button
        onClick={() => generate('mindmap')}
        disabled={isGenerating}
        className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-raised disabled:opacity-50 text-content-secondary text-xs rounded-xl border border-white/[0.05] transition-colors"
        title="마인드맵 재생성"
      >
        {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        재생성
      </button>
    </div>
  );
}
