import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CircleIcon,
  CursorClickIcon,
  ClockIcon,
  DatabaseIcon,
  GitBranchIcon,
  HandIcon,
  PauseIcon,
  PlayIcon,
  RobotIcon,
  UserCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import type {
  NodeRunStatus,
  WorkflowEdgeDefinition,
  NodeAnchorSide,
  WorkflowNodeKind,
  WorkflowRunStatus,
} from '../../services/content-pipeline/types';
import { fetchWorkflowDefinition } from '../../services/content-pipeline/workflowSource';
import type { WorkflowDefinitionPayload } from '../../services/content-pipeline/workflowSource';
import { diffText } from '../../services/content-pipeline/artifactDiff';
import { useWorkbenchStore } from '../../services/workbenchStore';
import { domId } from '../../shared/ids';
import { Button, SegmentedControl, toast } from '../../shared/ui';
import { NodePromptMap } from './NodePromptMap';
import type { PromptMapViewState } from './NodePromptMap';
import { fetchNodePromptMap, fetchPromptDiff, shortHash, type PromptMap } from '../../services/content-pipeline/promptMap';
import { graphLayout } from '../../services/content-pipeline/canvasLayout';
import type { NodePosition } from '../../services/content-pipeline/canvasLayout';
import {
  artifactRows,
  decideRunNode,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  nodeStatusMap,
  pauseWorkflowRun,
  rerunRunNode,
  resumeWorkflowRun,
  reviewedHash,
  runMetrics,
  runStatusOf,
  timelineEvents,
  timestampLabel,
  waitingItems,
} from '../../services/content-pipeline/runs';
import type {
  NodeRunSummary,
  RunProgress,
  WorkflowRunDetail,
  WorkflowRunSummary,
} from '../../services/content-pipeline/runs';
import './ContentPipelineModule.css';

type CanvasTool = 'hand' | 'pointer';

interface PanSession {
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
}

const statusLabels: Record<NodeRunStatus, string> = {
  pending: '等待',
  running: '运行中',
  blocked: '阻塞',
  'waiting-approval': '等待审批',
  succeeded: '已完成',
  failed: '失败',
  skipped: '已跳过',
  stale: '已过期',
  cancelled: '已取消',
};

const runStatusLabels: Record<WorkflowRunStatus, string> = {
  draft: '草稿',
  ready: '就绪',
  running: '运行中',
  paused: '已暂停',
  'waiting-human': '等待人工',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const kindLabels: Record<WorkflowNodeKind, string> = {
  trigger: '触发',
  context: '上下文',
  agent: 'Agent',
  'contract-gate': '契约校验',
  'human-gate': '人工审批',
  router: '路由',
  'fan-out': '并行拆分',
  'fan-in': '结果汇总',
  'quality-loop': '质量回路',
  tool: '工具',
  persist: '持久化',
  notify: '通知',
};

function nodeIcon(kind: WorkflowNodeKind): ReactNode {
  const Icon = {
    trigger: PlayIcon,
    context: DatabaseIcon,
    agent: RobotIcon,
    'contract-gate': CheckCircleIcon,
    'human-gate': UserCheckIcon,
    router: GitBranchIcon,
    'fan-out': GitBranchIcon,
    'fan-in': GitBranchIcon,
    'quality-loop': ArrowClockwiseIcon,
    tool: CircleIcon,
    persist: DatabaseIcon,
    notify: CircleIcon,
  }[kind];
  return <Icon size={15} weight="duotone" />;
}

function anchorPoint(position: NodePosition, side: NodeAnchorSide) {
  const width = 174;
  const height = 76;
  switch (side) {
    case 'top':
      return { x: position.x + width / 2, y: position.y };
    case 'right':
      return { x: position.x + width, y: position.y + height / 2 };
    case 'bottom':
      return { x: position.x + width / 2, y: position.y + height };
    case 'left':
      return { x: position.x, y: position.y + height / 2 };
  }
}

function isOutputSide(side: NodeAnchorSide) {
  return side === 'right' || side === 'bottom';
}

function edgePath(
  source: NodePosition,
  target: NodePosition,
  fromSide: NodeAnchorSide = 'right',
  toSide: NodeAnchorSide = 'left',
  straight = false,
) {
  const start = anchorPoint(source, fromSide);
  const end = anchorPoint(target, toSide);
  if (straight) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const horizontal = end.x - start.x;
  const control = Math.max(38, Math.abs(horizontal) * 0.45);
  const startControlX = start.x + (isOutputSide(fromSide) ? control : -control);
  const endControlX = end.x + (isOutputSide(toSide) ? control : -control);
  if (horizontal < 0) {
    const loopY = Math.min(start.y, end.y) - 44;
    return `M ${start.x} ${start.y} C ${start.x} ${loopY}, ${end.x} ${loopY}, ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} C ${startControlX} ${start.y}, ${endControlX} ${end.y}, ${end.x} ${end.y}`;
}

function edgeTone(
  edge: WorkflowEdgeDefinition,
  statuses: Record<string, NodeRunStatus>,
) {
  const source = statuses[edge.from.nodeId];
  const target = statuses[edge.to.nodeId];
  if (source === 'succeeded' && ['running', 'waiting-approval'].includes(target)) {
    return 'is-active';
  }
  if (source === 'succeeded' && target === 'succeeded') return 'is-complete';
  return 'is-pending';
}

export function ContentPipelineModule() {
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [definition, setDefinition] = useState<WorkflowDefinitionPayload | null>(null);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null);
  const [runError, setRunError] = useState('');
  // 暂停只住在执行器进程里，库里状态不变，所以暂停视图由前端自己记（口径 26）。
  const [pausedRuns, setPausedRuns] = useState<string[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promptMap, setPromptMap] = useState<PromptMap | null>(null);
  const [promptMapState, setPromptMapState] = useState<PromptMapViewState>('loading');
  const [promptMapError, setPromptMapError] = useState('');
  const [promptDiff, setPromptDiff] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [decidedItems, setDecidedItems] = useState<string[]>([]);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('pointer');
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [panSession, setPanSession] = useState<PanSession | null>(null);
  const [shiftPressed, setShiftPressed] = useState(false);

  useEffect(() => {
    const state = useWorkbenchStore.getState();
    if (!state.sidebarCollapsed) state.toggleSidebar();
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWorkflowDefinition()
      .then((payload) => {
        if (active) setDefinition(payload);
      })
      .catch(() => {
        if (active) setDefinitionError('无法读取流程定义：后端接口不可用。');
      });
    return () => {
      active = false;
    };
  }, []);

  const reloadRuns = useCallback(async (): Promise<void> => {
    if (definition === null) return;
    try {
      const list = await fetchWorkflowRuns(definition.id);
      setRuns(list);
      setSelectedRunId((current) =>
        current !== null && list.some((run) => run.runId === current)
          ? current
          : (list[0]?.runId ?? null),
      );
    } catch {
      setRuns([]);
      setSelectedRunId(null);
    }
  }, [definition]);

  const reloadRun = useCallback(async (): Promise<void> => {
    if (definition === null || selectedRunId === null) {
      setRunDetail(null);
      return;
    }
    try {
      setRunDetail(await fetchWorkflowRun(definition.id, selectedRunId));
      setRunError('');
    } catch (error) {
      setRunDetail(null);
      setRunError(error instanceof Error ? error.message : '后端接口不可用。');
    }
  }, [definition, selectedRunId]);

  useEffect(() => {
    void reloadRuns();
  }, [reloadRuns]);

  useEffect(() => {
    setDecidedItems([]);
    setPromptDiff(null);
    void reloadRun();
  }, [reloadRun]);

  const activeDefinition = runDetail?.graph ?? definition;
  const layout = useMemo(() => graphLayout(activeDefinition), [activeDefinition]);
  const nodeStatuses = nodeStatusMap(runDetail);
  const paused = selectedRunId !== null && pausedRuns.includes(selectedRunId);
  const runStatus = runStatusOf(runDetail, paused);
  const events = timelineEvents(runDetail);
  const metrics = runMetrics(runDetail);
  // 未显式选中节点时，界面看的就是该运行的第一个节点（节点摘要按图里节点顺序给出）。
  const fallbackNodeId = runDetail?.nodes[0]?.nodeId ?? '';

  useEffect(() => {
    const nodeId = selectedNodeId || fallbackNodeId;
    if (selectedRunId === null || nodeId === '') {
      setPromptMapState(runs.length === 0 ? 'empty' : 'loading');
      return;
    }
    let active = true;
    setPromptMapState('loading');
    void fetchNodePromptMap(definition?.id ?? '', selectedRunId, nodeId)
      .then((payload) => {
        if (!active) return;
        setPromptMap(payload);
        setPromptMapState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPromptMapError(error instanceof Error ? error.message : '后端接口不可用。');
        setPromptMapState('error');
      });
    return () => {
      active = false;
    };
  }, [definition, fallbackNodeId, runs.length, selectedRunId, selectedNodeId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftPressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  if (definition === null) {
    return (
      <section className="pipeline-page">
        <header className="pipeline-header card motion-enter">
          <div>
            <p className="page-kicker">Content Pipeline</p>
            <h1 className="page-title">教材生产线</h1>
            <p className="page-subtitle">
              多角色 Agent 协作、结构化产物和人工审批的运行可视化。
            </p>
          </div>
        </header>
        <p className="card pipeline-definition-notice">
          {definitionError ?? '正在读取流程定义…'}
        </p>
      </section>
    );
  }

  const selectedNode =
    activeDefinition?.nodes.find((node) => node.id === selectedNodeId) ??
    activeDefinition?.nodes[0] ??
    null;
  const graphWidth = layout.width;
  const graphHeight = layout.height;
  const selectedSummary: NodeRunSummary | null =
    (runDetail?.nodes ?? []).find((node) => node.nodeId === selectedNodeId) ?? null;
  const visibleArtifacts = artifactRows(runDetail);
  const selectedArtifacts = visibleArtifacts.filter(
    (artifact) => artifact.nodeId === selectedNode?.id,
  );
  // 代次越大越新：重跑产生新代次，旧代次仍留在同一份列表里。
  const selectedVersions = [...selectedArtifacts].sort(
    (left, right) => right.generation - left.generation,
  );
  const currentVersion = selectedVersions[0] ?? null;
  const previousVersion = selectedVersions[1] ?? null;
  const diffLines =
    currentVersion && previousVersion
      ? diffText(
          JSON.stringify(previousVersion.payload, null, 2),
          JSON.stringify(currentVersion.payload, null, 2),
        )
      : [];
  const pendingItems = waitingItems(selectedSummary).filter(
    (itemKey) => !decidedItems.includes(itemKey),
  );
  const nextItem = pendingItems[0] ?? '';
  const nodeLabels: Record<string, string> = Object.fromEntries(
    (activeDefinition?.nodes ?? []).map((node) => [node.id, node.label]),
  );

  if (selectedNode === null) return null;

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setComment('');
    setDecidedItems([]);
  }

  function reportProgress(action: string, progress: RunProgress, description?: string): void {
    const parts: string[] = [];
    if (progress.executed.length > 0) parts.push(`执行 ${progress.executed.length} 个节点实例`);
    if (progress.waiting.length > 0) parts.push(`等待人工 ${progress.waiting.length} 项`);
    if (progress.failed.length > 0) parts.push(`失败 ${progress.failed.length} 项`);
    toast(action, {
      description: description ?? (parts.length > 0 ? parts.join('，') : '没有可推进的节点。'),
      variant: progress.failed.length > 0 ? 'error' : 'success',
    });
  }

  async function runControl<T extends RunProgress>(
    action: () => Promise<T>,
    label: string,
    describe?: (result: T) => string,
  ): Promise<void> {
    if (definition === null || selectedRunId === null || busy) return;
    setBusy(true);
    try {
      const result = await action();
      setPausedRuns((current) =>
        result.paused ? [...new Set([...current, selectedRunId])] : current.filter((id) => id !== selectedRunId),
      );
      reportProgress(label, result, describe?.(result));
      await reloadRun();
      await reloadRuns();
    } catch (error) {
      toast(`${label}失败`, {
        description: error instanceof Error ? error.message : '后端接口不可用。',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  function pauseRun() {
    if (definition === null || selectedRunId === null || busy) return;
    void (async () => {
      setBusy(true);
      try {
        await pauseWorkflowRun(definition.id, selectedRunId);
        setPausedRuns((current) => [...new Set([...current, selectedRunId])]);
        toast('已暂停', { description: '执行器不再推进这个运行；再次继续即接着跑。' });
      } catch (error) {
        toast('暂停失败', {
          description: error instanceof Error ? error.message : '后端接口不可用。',
          variant: 'error',
        });
      } finally {
        setBusy(false);
      }
    })();
  }

  function resumeRun() {
    if (definition === null || selectedRunId === null) return;
    void runControl(() => resumeWorkflowRun(definition.id, selectedRunId), '已继续运行');
  }

  function rerunSelectedNode() {
    if (definition === null || selectedRunId === null || selectedNode === null) return;
    const nodeId = selectedNode.id;
    void runControl(
      () => rerunRunNode(definition.id, selectedRunId, nodeId),
      '已重跑',
      (result) => `${result.affected.length} 个节点进入新代次；旧代次产物仍可读。`,
    );
  }

  function decide(approved: boolean, itemKey: string) {
    if (definition === null || selectedRunId === null || selectedNode === null || busy) return;
    const nodeId = selectedNode.id;
    const hash = reviewedHash(selectedSummary, itemKey);
    void runControl(async () => {
      const progress = await decideRunNode(definition.id, selectedRunId, nodeId, {
        approved,
        comments: comment.trim(),
        itemKey,
        expectedHash: hash,
      });
      setDecidedItems((current) => [...new Set([...current, itemKey])]);
      setComment('');
      return progress;
    }, approved ? '审批已通过' : '意见已提交');
  }

  async function openTemplateDiff() {
    const template = promptMap?.template;
    if (!template?.runHash) return;
    try {
      setPromptDiff(
        await fetchPromptDiff(template.ref, template.runHash, template.currentHash ?? ''),
      );
    } catch (error) {
      toast('无法读取模板差异', {
        description: error instanceof Error ? error.message : '后端接口不可用。',
        variant: 'error',
      });
    }
  }

  return (
    <section className="pipeline-page">
      <header className="pipeline-header card motion-enter">
        <div>
          <p className="page-kicker">Content Pipeline</p>
          <h1 className="page-title">教材生产线</h1>
          <p className="page-subtitle">
            多角色 Agent 协作、结构化产物和人工审批的运行可视化。
          </p>
        </div>
      </header>

      <div className="pipeline-layout">
        <section className="card pipeline-canvas-card">
          <div className="pipeline-canvas-header">
            <div className="pipeline-canvas-header__title">
              <strong>教材生产主流程</strong>
              <span>只读运行视图</span>
            </div>
            <div className="pipeline-canvas-header__actions">
              <span className="pipeline-metric">耗时 <strong>{metrics.duration}</strong></span>
              <span className="pipeline-metric">节点 <strong>{metrics.nodes}</strong></span>
              <span className="pipeline-metric">模型调用 <strong>{metrics.calls}</strong></span>
              <SegmentedControl
                value={canvasTool}
                onChange={setCanvasTool}
                ariaLabel="pipeline canvas 工具栏"
                className="pipeline-canvas-tools"
                options={[
                  {
                    value: 'pointer',
                    id: 'content-pipeline-canvas-tool-pointer',
                    label: <CursorClickIcon size={15} weight="bold" />,
                    ariaLabel: '指针模式',
                    title: '指针模式：选择节点',
                  },
                  {
                    value: 'hand',
                    id: 'content-pipeline-canvas-tool-hand',
                    label: <HandIcon size={15} weight="bold" />,
                    ariaLabel: '手模式',
                    title: '手模式：拖动画布，鼠标中键也可触发',
                  },
                ]}
              />
            </div>
          </div>

          <div
            className={`pipeline-canvas__scroll is-tool-${canvasTool} ${panSession ? 'is-panning' : ''}`}
            onPointerDown={(event) => {
              const target = event.target;
              const onNode =
                target instanceof HTMLElement &&
                target.closest('.pipeline-node') !== null;
              const panGesture =
                event.button === 1 ||
                canvasTool === 'hand' ||
                (event.button === 0 && !onNode);
              if (!panGesture) return;
              event.preventDefault();
              setPanSession({
                clientX: event.clientX,
                clientY: event.clientY,
                originX: canvasOffset.x,
                originY: canvasOffset.y,
              });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!panSession) return;
              setCanvasOffset({
                x: panSession.originX + event.clientX - panSession.clientX,
                y: panSession.originY + event.clientY - panSession.clientY,
              });
            }}
            onPointerUp={(event) => {
              if (!panSession) return;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              setPanSession(null);
            }}
            onPointerCancel={() => setPanSession(null)}
            onAuxClick={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
          >
            <div
              className={`pipeline-canvas is-tool-${canvasTool}`}
              style={{
                width: graphWidth,
                height: graphHeight,
                transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
              }}
            >
              <svg
                className="pipeline-edges"
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="pipeline-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                {activeDefinition?.edges.map((edge) => {
                  const source = layout.positions[edge.from.nodeId];
                  const target = layout.positions[edge.to.nodeId];
                  if (!source || !target) return null;
                  return (
                    <path
                      key={edge.id}
                      d={edgePath(source, target, edge.fromSide, edge.toSide, shiftPressed)}
                      className={`pipeline-edge ${edgeTone(edge, nodeStatuses)}`}
                      markerEnd="url(#pipeline-arrow)"
                    />
                  );
                })}
              </svg>

              {activeDefinition?.nodes.map((node) => {
                const position = layout.positions[node.id];
                if (!position) return null;
                const status = nodeStatuses[node.id] ?? 'pending';
                const selected = node.id === selectedNode.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    id={domId('content-pipeline', 'node', node.id)}
                    className={`pipeline-node is-${status} ${selected ? 'is-selected' : ''} ${node.enabled === false ? 'is-disabled' : ''}`}
                    style={{ left: position.x, top: position.y }}
                    aria-pressed={selected}
                    onClick={() => selectNode(node.id)}
                  >
                    <span className="pipeline-node__icon">
                      {nodeIcon(node.kind)}
                    </span>
                    <span className="pipeline-node__body">
                      <strong>{node.label}</strong>
                      <small>{kindLabels[node.kind]}</small>
                    </span>
                    <span className="pipeline-node__status">
                      {statusLabels[status]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="pipeline-legend">
              <span className="is-complete">已完成</span>
              <span className="is-active">执行中</span>
              <span className="is-waiting">等待审批</span>
              <span className="is-pending">等待</span>
            </div>
          </div>
        </section>

        <aside className="card pipeline-inspector">
          <div className="pipeline-inspector__top">
            <div className="pipeline-header__actions">
              <span className={`pipeline-run-status is-${runStatus}`}>
                <CircleIcon size={9} weight="fill" />
                {runStatusLabels[runStatus]}
              </span>
              <Button
                id="content-pipeline-run"
                variant="secondary"
                disabled={selectedRunId === null || busy}
                leadingIcon={<PlayIcon size={15} weight="fill" />}
                onClick={resumeRun}
              >
                继续运行
              </Button>
              <Button
                id="content-pipeline-pause"
                variant="secondary"
                disabled={selectedRunId === null || busy || paused}
                leadingIcon={<PauseIcon size={15} weight="fill" />}
                onClick={pauseRun}
              >
                暂停
              </Button>
            </div>

            <div className={`pipeline-history-window ${historyExpanded ? 'is-expanded' : ''}`}>
              <button
                type="button"
                id="content-pipeline-history-toggle"
                className="pipeline-history-window__toggle"
                aria-expanded={historyExpanded}
                onClick={() => setHistoryExpanded((current) => !current)}
              >
                <span>
                  <strong>运行历史</strong>
                  <small>{runs.length > 0 ? `${runs.length} 次运行` : '还没有运行记录'}</small>
                </span>
                {historyExpanded ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}
              </button>
              {historyExpanded && (
                <div className="pipeline-history-window__list">
                  {runs.map((run) => {
                    const status = runStatusOf(run, pausedRuns.includes(run.runId));
                    return (
                      <button
                        key={run.runId}
                        type="button"
                        id={domId('content-pipeline', 'run', run.runId)}
                        className={`pipeline-run-item ${run.runId === selectedRunId ? 'is-active' : ''}`}
                        onClick={() => setSelectedRunId(run.runId)}
                      >
                        <span>
                          <strong>{run.runId}</strong>
                          <small>
                            {timestampLabel(run.startedAt)} 启动 · {runStatusLabels[status]}
                          </small>
                        </span>
                        {status === 'succeeded' ? (
                          <CheckCircleIcon size={14} weight="fill" />
                        ) : (
                          <span className={`pipeline-run-item__dot is-${status}`} />
                        )}
                      </button>
                    );
                  })}
                  {runs.length === 0 && (
                    <p className="pipeline-empty">
                      还没有运行记录；发起一次运行后，每次运行都会出现在这里。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <header className="pipeline-inspector__header">
            <span className="pipeline-inspector__kind">
              {kindLabels[selectedNode.kind]}
            </span>
            <h2>{selectedNode.label}</h2>
            <p>{selectedNode.description}</p>
          </header>

          <div className="pipeline-inspector__status">
            <span className={`pipeline-status-chip is-${nodeStatuses[selectedNode.id]}`}>
              {statusLabels[nodeStatuses[selectedNode.id] ?? 'pending']}
            </span>
            {selectedNode.roleId && <code>{selectedNode.roleId}</code>}
          </div>

          {nodeStatuses[selectedNode.id] === 'waiting-approval' && (
            <div className="pipeline-approval">
              <div className="pipeline-approval__title">
                <UserCheckIcon size={17} weight="duotone" />
                <span>人工审批</span>
              </div>
              <div className="pipeline-chapter-approvals">
                {waitingItems(selectedSummary).map((itemKey) => {
                  const hash = reviewedHash(selectedSummary, itemKey);
                  return (
                    <div key={itemKey || 'single'} className="pipeline-chapter-row">
                      <span>
                        <strong>{itemKey || '整节点一次决断'}</strong>
                        <small>
                          {decidedItems.includes(itemKey)
                            ? '已决断'
                            : hash
                              ? `依据 ${shortHash(hash)}`
                              : '等待决断'}
                        </small>
                      </span>
                      <Button
                        id={domId('content-pipeline', 'approve-item', itemKey || 'single')}
                        variant="secondary"
                        size="sm"
                        disabled={decidedItems.includes(itemKey) || busy}
                        onClick={() => decide(true, itemKey)}
                      >
                        通过本项
                      </Button>
                    </div>
                  );
                })}
              </div>
              <label htmlFor="content-pipeline-approval-comment">审批意见</label>
              <textarea
                id="content-pipeline-approval-comment"
                className="ui-input pipeline-approval__textarea"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="可选：填写修改意见或审批说明"
              />
              <div className="pipeline-approval__actions">
                <Button
                  id="content-pipeline-approval-approve"
                  variant="primary"
                  size="sm"
                  disabled={busy || (selectedSummary !== null && pendingItems.length === 0)}
                  leadingIcon={<CheckCircleIcon size={14} weight="fill" />}
                  onClick={() => decide(true, nextItem)}
                >
                  确认通过
                </Button>
                <Button
                  id="content-pipeline-approval-reject"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  leadingIcon={<WarningCircleIcon size={14} weight="bold" />}
                  onClick={() => decide(false, nextItem)}
                >
                  提出意见
                </Button>
              </div>
            </div>
          )}

          <div className="pipeline-node-actions">
            <Button
              id="content-pipeline-node-rerun"
              variant="secondary"
              size="sm"
              disabled={selectedRunId === null || busy}
              leadingIcon={<ArrowClockwiseIcon size={14} weight="bold" />}
              onClick={rerunSelectedNode}
            >
              从此节点重跑
            </Button>
          </div>

          <NodePromptMap
            state={promptMapState}
            map={promptMap}
            error={promptMapError}
            diff={promptDiff}
            onOpenDiff={() => { void openTemplateDiff(); }}
          />

          <div className="pipeline-inspector__section">
            <span className="pipeline-section-label">输入 Contract</span>
            {selectedNode.inputs.length > 0 ? (
              selectedNode.inputs.map((port) => (
                <div key={port.id} className="pipeline-port">
                  <span>{port.id}</span>
                  <code>{port.artifactType}</code>
                </div>
              ))
            ) : (
              <p className="pipeline-empty">无输入</p>
            )}
          </div>

          <div className="pipeline-inspector__section">
            <span className="pipeline-section-label">输出 Contract</span>
            {selectedNode.outputs.map((port) => (
              <div key={port.id} className="pipeline-port">
                <span>{port.id}</span>
                <code>{port.artifactType}</code>
              </div>
            ))}
          </div>

          <div className="pipeline-inspector__section">
            <span className="pipeline-section-label">节点配置</span>
            {Object.entries(selectedNode.config).map(([key, value]) => (
              <div key={key} className="pipeline-config-row">
                <span>{key}</span>
                <code>{String(value)}</code>
              </div>
            ))}
            {Object.keys(selectedNode.config).length === 0 && (
              <p className="pipeline-empty">无额外配置</p>
            )}
          </div>

          <div className="pipeline-inspector__section">
            <span className="pipeline-section-label">当前节点产物</span>
            {selectedArtifacts.length > 0 ? (
              selectedArtifacts.map((artifact) => (
                <div
                  key={`${artifact.portId}:${artifact.itemKey}:${artifact.generation}`}
                  className="pipeline-artifact"
                >
                  <div>
                    <strong>
                      {artifact.portId}
                      {artifact.itemKey ? ` · ${artifact.itemKey}` : ''}
                    </strong>
                    <span>{artifact.type}</span>
                  </div>
                  <code>
                    代次 {artifact.generation} · {shortHash(artifact.contentHash)}
                  </code>
                </div>
              ))
            ) : (
              <p className="pipeline-empty">当前尚无产物</p>
            )}
          </div>

          {diffLines.length > 0 && (
            <div className="pipeline-inspector__section">
              <span className="pipeline-section-label">产物代次对比</span>
              <div className="pipeline-diff">
                <div className="pipeline-diff__summary">
                  <span>代次 {currentVersion?.generation} → {previousVersion?.generation}</span>
                </div>
                {diffLines.slice(0, 8).map((line, index) => (
                  <code key={`${line.type}-${index}`} className={`is-${line.type}`}>
                    {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                    {line.value}
                  </code>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="pipeline-bottom">
        <div className="card pipeline-timeline">
          <header>
            <div>
              <span className="pipeline-section-label">运行事件</span>
              <strong>事件时间线</strong>
            </div>
            <ClockIcon size={17} weight="duotone" />
          </header>
          <div className="pipeline-timeline__list">
            {events.map((event) => (
              <div key={event.id} className={`pipeline-event is-${event.tone}`}>
                <span>{event.at}</span>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="pipeline-empty">
                {runError || '这次运行还没有产生节点执行记录。'}
              </p>
            )}
          </div>
        </div>

        <div className="card pipeline-artifacts">
          <header>
            <div>
              <span className="pipeline-section-label">Artifact Store</span>
              <strong>产物版本</strong>
            </div>
            <span>{visibleArtifacts.length} 个版本</span>
          </header>
          <div className="pipeline-artifacts__list">
            {visibleArtifacts.map((artifact) => (
              <button
                key={`${artifact.nodeId}:${artifact.portId}:${artifact.itemKey}:${artifact.generation}`}
                type="button"
                id={domId(
                  'content-pipeline',
                  'artifact',
                  `${artifact.nodeId}-${artifact.portId}-${artifact.generation}`,
                )}
                className="pipeline-artifact-row"
                onClick={() => selectNode(artifact.nodeId)}
              >
                <span>
                  <strong>
                    {artifact.portId}
                    {artifact.itemKey ? ` · ${artifact.itemKey}` : ''}
                  </strong>
                  <small>
                    {nodeLabels[artifact.nodeId] ?? artifact.nodeId} · {artifact.type}
                  </small>
                </span>
                <code>
                  v{artifact.generation} · {shortHash(artifact.contentHash)}
                </code>
              </button>
            ))}
            {visibleArtifacts.length === 0 && (
              <p className="pipeline-empty">这次运行还没有产物版本。</p>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
