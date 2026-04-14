import { ReactFlow, Background, Controls, Handle, BackgroundVariant, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export interface MindmapFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; depth: number };
}

export interface MindmapFlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  style?: React.CSSProperties;
}

function getNodeStyle(depth: number): React.CSSProperties {
  if (depth === 0) {
    return {
      background: '#1D4ED8',
      color: 'white',
      border: '2px solid #3B82F6',
      borderRadius: '10px',
      padding: '10px 20px',
      fontSize: '15px',
      fontWeight: '700',
      minWidth: '180px',
      maxWidth: '220px',
      textAlign: 'center',
      boxShadow: '0 0 0 4px rgba(59,130,246,0.15)',
      lineHeight: '1.4',
    };
  }
  if (depth === 1) {
    return {
      background: '#374151',
      color: '#F3F4F6',
      border: '1px solid #4B5563',
      borderRadius: '8px',
      padding: '8px 14px',
      fontSize: '13px',
      fontWeight: '600',
      minWidth: '130px',
      maxWidth: '180px',
      textAlign: 'center',
      lineHeight: '1.4',
    };
  }
  return {
    background: '#1F2937',
    color: '#9CA3AF',
    border: '1px solid #374151',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '400',
    minWidth: '110px',
    maxWidth: '160px',
    textAlign: 'center',
    lineHeight: '1.4',
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

function MindmapNode({ data }: { data: { label: string; depth: number } }) {
  return (
    <div style={getNodeStyle(data.depth)}>
      <Handle type="target" position={Position.Left} id="tl" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right} id="tr" style={HANDLE_STYLE} />
      <span style={{ wordBreak: 'break-word' }}>{data.label}</span>
      <Handle type="source" position={Position.Left} id="sl" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="sr" style={HANDLE_STYLE} />
    </div>
  );
}

const NODE_TYPES = { mindmap: MindmapNode };

interface MindmapFlowProps {
  nodes: MindmapFlowNode[];
  edges: MindmapFlowEdge[];
}

export default function MindmapFlow({ nodes, edges }: MindmapFlowProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      nodeTypes={NODE_TYPES}
      nodeOrigin={[0.5, 0.5]}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#111827', width: '100%', height: '100%' }}
    >
      <Background variant={BackgroundVariant.Dots} color="#374151" gap={24} size={1} />
      <Controls />
    </ReactFlow>
  );
}
