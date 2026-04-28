import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  BackgroundVariant,
  Position,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import { ChevronDown } from 'lucide-react';
import '@xyflow/react/dist/style.css';

export interface MindmapFlowNodeData extends Record<string, unknown> {
  label: string;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  hiddenCount: number;
  onToggle: (id: string) => void;
}

export type MindmapFlowNode = Node<MindmapFlowNodeData>;
export type MindmapFlowEdge = Edge;
export type MindmapFlowInstance = ReactFlowInstance<MindmapFlowNode, MindmapFlowEdge>;

const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

function getNodeStyle(depth: number, isCollapsed: boolean): React.CSSProperties {
  if (depth === 0) {
    return {
      background: 'oklch(0.58 0.15 175)',
      color: 'oklch(0.15 0.01 250)',
      border: '1.5px solid oklch(0.70 0.14 175 / 0.55)',
      borderRadius: '12px',
      padding: '12px 22px',
      fontSize: '15px',
      fontWeight: 700,
      minWidth: '180px',
      maxWidth: '220px',
      textAlign: 'center',
      boxShadow:
        '0 1px 0 oklch(0.80 0.10 175 / 0.25) inset, 0 10px 28px -10px oklch(0.50 0.14 175 / 0.45)',
      lineHeight: 1.4,
      position: 'relative',
      transition: `box-shadow 240ms ${EASE_OUT_EXPO}`,
    };
  }
  if (depth === 1) {
    return {
      background: 'oklch(0.24 0.01 250)',
      color: 'oklch(0.94 0.005 250)',
      border: `1px solid oklch(0.65 0.15 175 / ${isCollapsed ? 0.34 : 0.18})`,
      borderRadius: '10px',
      padding: '9px 16px',
      fontSize: '13px',
      fontWeight: 600,
      minWidth: '140px',
      maxWidth: '180px',
      textAlign: 'center',
      lineHeight: 1.4,
      position: 'relative',
      transition: `border-color 240ms ${EASE_OUT_EXPO}`,
    };
  }
  return {
    background: 'oklch(0.20 0.01 250)',
    color: 'oklch(0.72 0.01 250)',
    border: `1px solid oklch(${isCollapsed ? '0.36 0.04 175' : '0.26 0.01 250'})`,
    borderRadius: '8px',
    padding: '7px 12px',
    fontSize: '12px',
    fontWeight: 500,
    minWidth: '110px',
    maxWidth: '160px',
    textAlign: 'center',
    lineHeight: 1.4,
    position: 'relative',
    transition: `border-color 240ms ${EASE_OUT_EXPO}`,
  };
}

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
};

function MindmapNode({ id, data }: NodeProps<MindmapFlowNode>) {
  const { label, depth, hasChildren, isCollapsed, hiddenCount, onToggle } = data;

  const handleBadgeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget;
      target.classList.remove('mindmap-badge-pressed');
      void target.offsetWidth;
      target.classList.add('mindmap-badge-pressed');
      onToggle(id);
    },
    [id, onToggle],
  );

  const enterDelay = `${Math.min(depth, 3) * 40}ms`;

  return (
    <div
      style={{ ...getNodeStyle(depth, isCollapsed), animationDelay: enterDelay }}
      className="mindmap-node-inner cursor-pointer hover:brightness-110 active:scale-[0.98] transition-[filter,transform] duration-150 ease-out-expo"
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <span style={{ wordBreak: 'break-word' }}>
        {label}
        {isCollapsed && hiddenCount > 0 && (
          <span className="mindmap-hidden-count" aria-hidden="true">
            +{hiddenCount}
          </span>
        )}
      </span>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      {hasChildren && (
        <button
          type="button"
          onClick={handleBadgeClick}
          aria-label={isCollapsed ? '하위 노드 펼치기' : '하위 노드 접기'}
          aria-expanded={!isCollapsed}
          className="mindmap-toggle-badge"
        >
          <ChevronDown
            size={12}
            style={{
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: `transform 260ms ${EASE_OUT_EXPO}`,
            }}
          />
        </button>
      )}
    </div>
  );
}

const NODE_TYPES = { mindmap: MindmapNode };

interface MindmapFlowProps {
  nodes: MindmapFlowNode[];
  edges: MindmapFlowEdge[];
  onNodeClick?: NodeMouseHandler;
  onInit?: (instance: MindmapFlowInstance) => void;
}

const DEFAULT_EDGE_OPTIONS = {
  type: 'smoothstep' as const,
  style: { stroke: 'oklch(0.40 0.03 175)', strokeWidth: 1.25 },
};

export default function MindmapFlow({ nodes, edges, onNodeClick, onInit }: MindmapFlowProps) {
  return (
    <div className="mindmap-animated" style={{ width: '100%', height: '100%' }}>
      <ReactFlow<MindmapFlowNode, MindmapFlowEdge>
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        onNodeClick={onNodeClick}
        onInit={onInit}
        nodeTypes={NODE_TYPES}
        nodeOrigin={[0.5, 0.5]}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'oklch(0.13 0.01 250)', width: '100%', height: '100%' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="oklch(0.22 0.01 250)"
          gap={24}
          size={1}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}
