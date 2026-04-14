import { lazy, Suspense } from 'react';
import { Loader2, AlertCircle, Network, RefreshCw } from 'lucide-react';
import { useStudyMindmap, useGenerateContent } from '@/api/study';
import type { StudyMindmapNode } from '@/types/study';
import type { MindmapFlowNode, MindmapFlowEdge } from './MindmapFlow';

const MindmapFlow = lazy(() => import('./MindmapFlow'));

const LEVEL_GAP = 220;
const NODE_HEIGHT = 50;
const NODE_GAP = 28;

function subtreeSize(node: StudyMindmapNode): number {
  const children = node.children ?? [];
  if (children.length === 0) return NODE_HEIGHT + NODE_GAP;
  return children.reduce((sum, c) => sum + subtreeSize(c), 0);
}

function placeSubtree(
  children: StudyMindmapNode[],
  parentId: string,
  parentX: number,
  parentCenterY: number,
  direction: -1 | 1,
  depth: number,
  nodes: MindmapFlowNode[],
  edges: MindmapFlowEdge[],
) {
  const total = children.reduce((s, c) => s + subtreeSize(c), 0);
  let y = parentCenterY - total / 2;

  for (const child of children) {
    const size = subtreeSize(child);
    const centerY = y + size / 2;
    const childX = parentX + direction * LEVEL_GAP;

    nodes.push({
      id: child.id,
      type: 'mindmap',
      position: { x: childX, y: centerY },
      data: { label: child.label, depth },
    });
    edges.push({
      id: `e-${parentId}-${child.id}`,
      source: parentId,
      target: child.id,
      type: 'smoothstep',
      style: { stroke: 'oklch(0.30 0.01 250)', strokeWidth: 2 },
    });

    const grandchildren = child.children ?? [];
    if (grandchildren.length > 0) {
      placeSubtree(grandchildren, child.id, childX, centerY, direction, depth + 1, nodes, edges);
    }
    y += size;
  }
}

function buildLayout(root: StudyMindmapNode): { nodes: MindmapFlowNode[]; edges: MindmapFlowEdge[] } {
  const nodes: MindmapFlowNode[] = [];
  const edges: MindmapFlowEdge[] = [];

  nodes.push({ id: root.id, type: 'mindmap', position: { x: 0, y: 0 }, data: { label: root.label, depth: 0 } });

  const children = root.children ?? [];
  const half = Math.ceil(children.length / 2);
  placeSubtree(children.slice(0, half), root.id, 0, 0, -1, 1, nodes, edges);
  placeSubtree(children.slice(half), root.id, 0, 0, 1, 1, nodes, edges);

  return { nodes, edges };
}

interface MindmapTabProps {
  fileId: string;
}

export function MindmapTab({ fileId }: MindmapTabProps) {
  const { data: mindmap, isLoading, isError } = useStudyMindmap(fileId);
  const { mutate: generate, isPending: isGenerating } = useGenerateContent(fileId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-content-muted">
        <Loader2 size={28} className="animate-spin" />
        <span className="text-sm">불러오는 중...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-semantic-error">
        <AlertCircle size={28} />
        <span className="text-sm">마인드맵을 불러오지 못했습니다</span>
        <button
          onClick={() => generate('mindmap')}
          disabled={isGenerating}
          className="mt-2 px-4 py-2 text-sm bg-surface-raised hover:bg-surface-hover disabled:opacity-50 text-content-secondary border border-white/[0.05] rounded-xl transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const status = mindmap?.status ?? 'not_generated';

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

  if (status === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-content-muted">
        <Loader2 size={28} className="animate-spin text-brand-400" />
        <span className="text-sm">마인드맵을 생성하고 있습니다...</span>
        <span className="text-xs text-content-muted">잠시 후 페이지를 새로고침해 주세요</span>
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

  const root = mindmap?.root;
  if (!root) {
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

  const { nodes, edges } = buildLayout(root);

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
