import { lazy, Suspense, useMemo, useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, Network, RefreshCw } from 'lucide-react';
import type { NodeMouseHandler } from '@xyflow/react';
import { useStudyStatus, useStudyMindmap, useGenerateContent } from '@/api/study';
import type { StudyMindmapNode, StudyMindmapEdge } from '@/types/study';
import type { MindmapFlowNode, MindmapFlowEdge } from './MindmapFlow';
import KeywordPopup, { type KeywordPopupNode, type KeywordPopupAnchor } from './KeywordPopup';

const MindmapFlow = lazy(() => import('./MindmapFlow'));

// Subtree-width-aware tree layout — computes depth and positions so that
// sibling subtrees never overlap and children are centered under parents.
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

  // Node widths per depth (must match MindmapFlow getNodeStyle maxWidth + padding)
  const NODE_WIDTHS = [220, 180, 160];
  const H_GAP = 40;
  const V_SPACING = 160;

  function nodeWidth(nodeId: string): number {
    const d = depthMap.get(nodeId) ?? 0;
    return NODE_WIDTHS[Math.min(d, NODE_WIDTHS.length - 1)];
  }

  // Bottom-up: compute how wide each subtree needs to be
  const subtreeW = new Map<string, number>();

  function calcWidth(nodeId: string): number {
    if (subtreeW.has(nodeId)) return subtreeW.get(nodeId)!;
    const children = childrenMap.get(nodeId) ?? [];
    if (children.length === 0) {
      const w = nodeWidth(nodeId);
      subtreeW.set(nodeId, w);
      return w;
    }
    let total = 0;
    for (const c of children) total += calcWidth(c);
    total += (children.length - 1) * H_GAP;
    const w = Math.max(nodeWidth(nodeId), total);
    subtreeW.set(nodeId, w);
    return w;
  }

  // Top-down: place each node centered in its allocated space
  const positions = new Map<string, { x: number; y: number }>();

  function place(nodeId: string, centerX: number) {
    if (positions.has(nodeId)) return; // guard against multi-parent DAGs
    const d = depthMap.get(nodeId) ?? 0;
    positions.set(nodeId, { x: centerX, y: d * V_SPACING });

    const children = childrenMap.get(nodeId) ?? [];
    if (children.length === 0) return;

    let totalW = 0;
    for (const c of children) totalW += (subtreeW.get(c) ?? 0);
    totalW += (children.length - 1) * H_GAP;

    let x = centerX - totalW / 2;
    for (const c of children) {
      const cw = subtreeW.get(c) ?? 0;
      place(c, x + cw / 2);
      x += cw + H_GAP;
    }
  }

  for (const r of roots) calcWidth(r.id);

  let totalRoots = 0;
  for (const r of roots) totalRoots += (subtreeW.get(r.id) ?? 0);
  totalRoots += Math.max(0, roots.length - 1) * H_GAP;

  let rx = -totalRoots / 2;
  for (const r of roots) {
    const rw = subtreeW.get(r.id) ?? 0;
    place(r.id, rx + rw / 2);
    rx += rw + H_GAP;
  }

  const nodes: MindmapFlowNode[] = rawNodes.map((n) => ({
    id: n.id,
    type: n.type ?? 'mindmap',
    position: positions.get(n.id) ?? n.position,
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

  const [selected, setSelected] = useState<
    { node: KeywordPopupNode; anchor: KeywordPopupAnchor } | null
  >(null);

  useEffect(() => {
    if (mindmapStatus === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['study', 'mindmap', fileId] });
    }
  }, [mindmapStatus, fileId, queryClient]);

  useEffect(() => {
    setSelected(null);
  }, [fileId, mindmap?.generated_at]);

  const rawData = mindmap?.data;
  const hasData = rawData && Array.isArray(rawData.nodes) && rawData.nodes.length > 0;

  const layout = useMemo(
    () => (hasData ? enrichWithDepth(rawData.nodes, rawData.edges ?? []) : null),
    [hasData, rawData],
  );

  const handleNodeClick = useCallback<NodeMouseHandler>((event, node) => {
    const nodeData = node.data as { label?: unknown } | undefined;
    const label = String(nodeData?.label ?? node.id).trim();
    if (!label) return;
    setSelected({
      node: { id: node.id, label },
      anchor: { x: event.clientX, y: event.clientY },
    });
  }, []);

  const handleClosePopup = useCallback(() => setSelected(null), []);

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
        <MindmapFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
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
      <KeywordPopup
        fileId={fileId}
        node={selected?.node ?? null}
        anchor={selected?.anchor ?? null}
        onClose={handleClosePopup}
      />
    </div>
  );
}
