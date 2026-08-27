import {BaseEdge, type Edge, type EdgeProps} from '@xyflow/react';

export type WorkflowEdgeStatus = 'blocked' | 'ready' | 'running' | 'done' | 'error';
export type WorkflowEdgeData = {status: WorkflowEdgeStatus; label: string; lane?: number};
export type WorkflowEdge = Edge<WorkflowEdgeData, 'adaptive'>;

const statusColors: Record<WorkflowEdgeStatus, string> = {
  blocked: '#b7b9b3',
  ready: '#c48a34',
  running: '#ed7355',
  done: '#4b8d79',
  error: '#c6534c',
};

const buildAdaptivePath = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  lane = 0,
) => {
  const dx = targetX - sourceX;
  if (dx >= 0) {
    const pull = Math.max(26, Math.min(190, dx * 0.46));
    return {
      path: `M ${sourceX} ${sourceY} C ${sourceX + pull} ${sourceY}, ${targetX - pull} ${targetY}, ${targetX} ${targetY}`,
    };
  }

  const routeAbove = sourceY >= targetY;
  const clearance = 76 + Math.abs(lane % 4) * 18;
  const detourY = routeAbove
    ? Math.min(sourceY, targetY) - clearance
    : Math.max(sourceY, targetY) + clearance;
  const sourcePull = sourceX + 78;
  const targetPull = targetX - 78;
  const middleX = (sourceX + targetX) / 2;
  return {
    path: `M ${sourceX} ${sourceY} C ${sourcePull} ${sourceY}, ${sourcePull} ${detourY}, ${middleX} ${detourY} C ${targetPull} ${detourY}, ${targetPull} ${targetY}, ${targetX} ${targetY}`,
  };
};

export const AdaptiveEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: EdgeProps<WorkflowEdge>) => {
  const status = data?.status || 'blocked';
  const color = statusColors[status];
  const {path} = buildAdaptivePath(sourceX, sourceY, targetX, targetY, data?.lane);
  return <>
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={`workflow-edge workflow-edge--${status}`}
      style={{stroke: color, strokeWidth: status === 'running' ? 3 : 2.3}}
    />
    {status === 'running' ? <circle r="4.5" fill={color} className="workflow-edge-particle"><animateMotion dur="1.15s" repeatCount="indefinite" path={path} /></circle> : null}
  </>;
};
