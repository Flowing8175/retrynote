import { lazy, Suspense, useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, Network, RefreshCw } from 'lucide-react';
import type { NodeMouseHandler } from '@xyflow/react';
import { useStudyStatus, useStudyMindmap, useGenerateContent, useContentVersions, useMindmapVersion } from '@/api/study';
import type { StudyMindmapNode, StudyMindmapEdge } from '@/types/study';
import type { MindmapFlowNode, MindmapFlowEdge, MindmapFlowInstance } from './MindmapFlow';
import KeywordPopup, { type KeywordPopupNode, type KeywordPopupAnchor } from './KeywordPopup';
import { VersionNavigator } from './VersionNavigator';
import { useStudyStreaming } from '@/hooks/useStudyStreaming';
import { StudyThinkingView } from './StudyThinkingView';

const MindmapFlow = lazy(() => import('./MindmapFlow'));

// Subtree-width-aware tree layout — computes depth, transitive descendant counts,
// and positions so that visible siblings never overlap and collapsed subtrees
// are excluded from layout while their hidden-count is preserved on the parent.
function enrichWithDepth(
  rawNodes: StudyMindmapNode[],
  rawEdges: StudyMindmapEdge[],
  collapsed: Set<string>,
  onToggle: (id: string) => void,
): { nodes: MindmapFlowNode[]; edges: MindmapFlowEdge[] } {
  const childrenMap = new Map<string, string[]>();
  for (const edge of rawEdges) {
    const list = childrenMap.get(edge.source) ?? [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  }

  const targets = new Set(rawEdges.map((e) => e.target));
  const roots = rawNodes.filter((n) => !targets.has(n.id));
  const startingRoots = roots.length > 0 ? roots : rawNodes.length > 0 ? [rawNodes[0]] : [];

  const visible = new Set<string>();
  const depthMap = new Map<string, number>();
  const queue: { id: string; depth: number }[] = startingRoots.map((r) => ({
    id: r.id,
    depth: 0,
  }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visible.has(id)) continue;
    visible.add(id);
    depthMap.set(id, depth);
    if (collapsed.has(id)) continue;
    for (const childId of childrenMap.get(id) ?? []) {
      if (!visible.has(childId)) queue.push({ id: childId, depth: depth + 1 });
    }
  }

  const descendantCount = new Map<string, number>();
  function countDescendants(nodeId: string, guard: Set<string>): number {
    if (descendantCount.has(nodeId)) return descendantCount.get(nodeId)!;
    if (guard.has(nodeId)) return 0;
    guard.add(nodeId);
    const children = childrenMap.get(nodeId) ?? [];
    let total = children.length;
    for (const c of children) total += countDescendants(c, guard);
    descendantCount.set(nodeId, total);
    return total;
  }

  const NODE_HEIGHTS = [50, 40, 36];
  const V_GAP = 30;
  const H_SPACING = 260;

  function nodeHeight(nodeId: string): number {
    const d = depthMap.get(nodeId) ?? 0;
    return NODE_HEIGHTS[Math.min(d, NODE_HEIGHTS.length - 1)];
  }

  const visibleChildrenMap = new Map<string, string[]>();
  for (const edge of rawEdges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    if (collapsed.has(edge.source)) continue;
    const list = visibleChildrenMap.get(edge.source) ?? [];
    list.push(edge.target);
    visibleChildrenMap.set(edge.source, list);
  }

  const subtreeH = new Map<string, number>();
  function calcHeight(nodeId: string): number {
    if (subtreeH.has(nodeId)) return subtreeH.get(nodeId)!;
    const children = visibleChildrenMap.get(nodeId) ?? [];
    if (children.length === 0) {
      const h = nodeHeight(nodeId);
      subtreeH.set(nodeId, h);
      return h;
    }
    let total = 0;
    for (const c of children) total += calcHeight(c);
    total += (children.length - 1) * V_GAP;
    const h = Math.max(nodeHeight(nodeId), total);
    subtreeH.set(nodeId, h);
    return h;
  }

  const positions = new Map<string, { x: number; y: number }>();
  function place(nodeId: string, centerY: number) {
    if (positions.has(nodeId)) return;
    const d = depthMap.get(nodeId) ?? 0;
    positions.set(nodeId, { x: d * H_SPACING, y: centerY });
    const children = visibleChildrenMap.get(nodeId) ?? [];
    if (children.length === 0) return;
    let totalH = 0;
    for (const c of children) totalH += subtreeH.get(c) ?? 0;
    totalH += (children.length - 1) * V_GAP;
    let y = centerY - totalH / 2;
    for (const c of children) {
      const ch = subtreeH.get(c) ?? 0;
      place(c, y + ch / 2);
      y += ch + V_GAP;
    }
  }

  const visibleRoots = startingRoots.filter((r) => visible.has(r.id));
  for (const r of visibleRoots) calcHeight(r.id);

  let totalRoots = 0;
  for (const r of visibleRoots) totalRoots += subtreeH.get(r.id) ?? 0;
  totalRoots += Math.max(0, visibleRoots.length - 1) * V_GAP;

  let ry = -totalRoots / 2;
  for (const r of visibleRoots) {
    const rh = subtreeH.get(r.id) ?? 0;
    place(r.id, ry + rh / 2);
    ry += rh + V_GAP;
  }

  const visibleRawNodes = rawNodes.filter((n) => visible.has(n.id));
  const nodes: MindmapFlowNode[] = visibleRawNodes.map((n) => {
    const hasChildren = (childrenMap.get(n.id) ?? []).length > 0;
    const isCollapsed = collapsed.has(n.id);
    const hiddenCount = isCollapsed ? countDescendants(n.id, new Set<string>()) : 0;
    return {
      id: n.id,
      type: n.type ?? 'mindmap',
      position: positions.get(n.id) ?? n.position,
      data: {
        label: String(n.data?.label ?? n.id),
        depth: depthMap.get(n.id) ?? 0,
        hasChildren,
        isCollapsed,
        hiddenCount,
        onToggle,
      },
    };
  });

  const edges: MindmapFlowEdge[] = [];
  for (const edge of rawEdges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    if (collapsed.has(edge.source)) continue;
    const targetDepth = depthMap.get(edge.target) ?? 1;
    let stroke: string;
    let strokeWidth: number;
    if (targetDepth === 1) {
      stroke = 'oklch(0.55 0.08 175)';
      strokeWidth = 1.75;
    } else if (targetDepth === 2) {
      stroke = 'oklch(0.45 0.04 175)';
      strokeWidth = 1.5;
    } else {
      stroke = 'oklch(0.38 0.02 250)';
      strokeWidth = 1.25;
    }
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      style: { stroke, strokeWidth },
    });
  }

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
  const { isPending: isGenerating } = useGenerateContent(fileId);
  const streaming = useStudyStreaming(fileId, 'mindmap');

  const { data: versionsData } = useContentVersions(fileId, 'mindmap', {
    enabled: mindmapStatus === 'completed',
  });
  const versions = versionsData?.versions ?? [];
  const [versionIndex, setVersionIndex] = useState<number | null>(null);
  const pendingRegenRef = useRef(false);
  const prevVersionsLengthRef = useRef(0);

  const isViewingOldVersion = versionIndex !== null && versions.length > 0 && versionIndex < versions.length - 1;
  const selectedVersionId = isViewingOldVersion ? versions[versionIndex]?.id ?? null : null;

  const { data: oldVersionData } = useMindmapVersion(fileId, selectedVersionId);

  const [selected, setSelected] = useState<
    { node: KeywordPopupNode; anchor: KeywordPopupAnchor } | null
  >(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const flowInstanceRef = useRef<MindmapFlowInstance | null>(null);
  const lastToggledRef = useRef<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    lastToggledRef.current = id;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleInit = useCallback((instance: MindmapFlowInstance) => {
    flowInstanceRef.current = instance;
  }, []);

  useEffect(() => {
    if (mindmapStatus === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['study', 'mindmap', fileId] });
      void queryClient.invalidateQueries({ queryKey: ['study', 'versions', fileId, 'mindmap'] });
    }
  }, [mindmapStatus, fileId, queryClient]);

  useEffect(() => {
    setVersionIndex(null);
    pendingRegenRef.current = false;
  }, [fileId]);

  useEffect(() => {
    if (versions.length > 0 && versionIndex === null) {
      setVersionIndex(versions.length - 1);
    }
  }, [versions.length, versionIndex]);

  useEffect(() => {
    if (pendingRegenRef.current && versions.length > prevVersionsLengthRef.current) {
      setVersionIndex(versions.length - 1);
      pendingRegenRef.current = false;
    }
    prevVersionsLengthRef.current = versions.length;
  }, [versions.length]);

  useEffect(() => {
    setSelected(null);
    setCollapsed(new Set());
  }, [fileId, mindmap?.generated_at]);

  const displayMindmap = isViewingOldVersion ? oldVersionData : mindmap;
  const rawData = displayMindmap?.data;
  const hasData = rawData && Array.isArray(rawData.nodes) && rawData.nodes.length > 0;

  const layout = useMemo(
    () =>
      hasData
        ? enrichWithDepth(rawData.nodes, rawData.edges ?? [], collapsed, handleToggle)
        : null,
    [hasData, rawData, collapsed, handleToggle],
  );

  useEffect(() => {
    const toggledId = lastToggledRef.current;
    if (!toggledId || !flowInstanceRef.current || !layout) return;
    lastToggledRef.current = null;
    const toggledNode = layout.nodes.find((n) => n.id === toggledId);
    if (!toggledNode) return;
    const { x, y } = toggledNode.position;
    const instance = flowInstanceRef.current;
    const timer = setTimeout(() => {
      instance.setCenter(x, y, { duration: 500, zoom: instance.getZoom() });
    }, 80);
    return () => clearTimeout(timer);
  }, [collapsed, layout]);

  const handleNodeClick = useCallback<NodeMouseHandler>((event, node) => {
    const target = event.target as HTMLElement | null;
    if (target && target.closest('.mindmap-toggle-badge')) return;
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

  if (streaming.state.isStreaming) {
    return (
      <div className="h-full">
        <StudyThinkingView state={streaming.state} onCancel={streaming.cancelStreaming} />
      </div>
    );
  }

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
          onClick={() => streaming.startStreaming()}
          disabled={isGenerating || streaming.state.isStreaming}
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
          onClick={() => streaming.startStreaming()}
          disabled={isGenerating || streaming.state.isStreaming}
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
          onClick={() => streaming.startStreaming()}
          disabled={isGenerating || streaming.state.isStreaming}
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
        <MindmapFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          onInit={handleInit}
        />
      </Suspense>
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        <VersionNavigator
          current={(versionIndex ?? versions.length - 1) + 1}
          total={versions.length}
          onPrev={() => {
            setVersionIndex((i) => Math.max(0, (i ?? versions.length - 1) - 1));
            setCollapsed(new Set());
          }}
          onNext={() => {
            setVersionIndex((i) => Math.min(versions.length - 1, (i ?? versions.length - 1) + 1));
            setCollapsed(new Set());
          }}
        />
         <button
           onClick={() => {
             pendingRegenRef.current = true;
             streaming.startStreaming();
             setVersionIndex(null);
           }}
           disabled={isGenerating || streaming.state.isStreaming}
           className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-raised disabled:opacity-50 text-content-secondary text-xs rounded-xl border border-white/[0.05] transition-colors"
           title="마인드맵 재생성"
         >
           {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
           재생성
         </button>
      </div>
      <KeywordPopup
        fileId={fileId}
        node={selected?.node ?? null}
        anchor={selected?.anchor ?? null}
        onClose={handleClosePopup}
      />
    </div>
  );
}
