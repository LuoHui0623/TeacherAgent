import { useEffect, useState } from 'react';
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

import { mainWorkflowDefinition } from '../../mocks/content-pipeline/main-workflow';
import type {
  NodeRunStatus,
  WorkflowEdgeDefinition,
  NodeAnchorSide,
  WorkflowNodeKind,
  WorkflowRunStatus,
} from '../../services/content-pipeline/types';
import { diffText } from '../../services/content-pipeline/artifactDiff';
import { useWorkbenchStore } from '../../services/workbenchStore';
import { domId } from '../../shared/ids';
import { Button, SegmentedControl, toast } from '../../shared/ui';
import { PromptMapPanel } from './PromptMapPanel';
import {
  createDemoPromptMapCall,
  fetchPromptMapCalls,
  initialPromptMapCalls,
  mergePromptMapCalls,
  type PromptMapCall,
} from '../../services/content-pipeline/promptMap';
import './ContentPipelineModule.css';

interface NodePosition {
  x: number;
  y: number;
}

interface DemoEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}

interface DemoArtifact {
  id: string;
  nodeId: string;
  name: string;
  type: string;
  version: string;
  status: 'draft' | 'validated' | 'confirmed';
  before?: string;
  after?: string;
}

type CanvasTool = 'hand' | 'pointer';

interface PanSession {
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
}

const nodeColumns = [
  ['tutor-trigger'],
  ['context-snapshot'],
  ['intent-planner'],
  ['brief-approval'],
  ['outline-architect'],
  ['outline-contract-gate'],
  ['outline-approval'],
  ['chapter-writers'],
  ['reviewer', 'reviser'],
  ['chapter-approval'],
  ['beautifier', 'assessment-generator'],
  ['quality-gate'],
  ['publish-approval'],
  ['publisher'],
] as const;

const nodePositions: Record<string, NodePosition> = Object.fromEntries(
  nodeColumns.flatMap((nodeIds, columnIndex) =>
    nodeIds.map((nodeId, rowIndex) => [
      nodeId,
      {
        x: 40 + columnIndex * 218,
        y: 152 + (rowIndex - (nodeIds.length - 1) / 2) * 112,
      },
    ]),
  ),
);

const initialNodeStatuses: Record<string, NodeRunStatus> = {
  'tutor-trigger': 'succeeded',
  'context-snapshot': 'succeeded',
  'intent-planner': 'succeeded',
  'brief-approval': 'succeeded',
  'outline-architect': 'succeeded',
  'outline-contract-gate': 'succeeded',
  'outline-approval': 'succeeded',
  'chapter-writers': 'succeeded',
  reviewer: 'succeeded',
  reviser: 'succeeded',
  'chapter-approval': 'waiting-approval',
  beautifier: 'pending',
  'assessment-generator': 'pending',
  'quality-gate': 'pending',
  'publish-approval': 'pending',
  publisher: 'pending',
};

const initialEvents: DemoEvent[] = [
  {
    id: 'event-1',
    at: '09:18:12',
    title: '上下文快照完成',
    detail: '已冻结用户画像、最近 Tutor Query 和学习历史。',
    tone: 'success',
  },
  {
    id: 'event-2',
    at: '09:19:03',
    title: 'Learning Brief 已确认',
    detail: '目标为系统学习前端性能优化，预计 8 小时。',
    tone: 'success',
  },
  {
    id: 'event-3',
    at: '09:23:47',
    title: '大纲 Contract 校验通过',
    detail: '章节依赖、知识点和验收标准完整。',
    tone: 'success',
  },
  {
    id: 'event-4',
    at: '09:31:25',
    title: '章节主笔并行完成',
    detail: '4 个 OutlineItem 已生成内容草稿。',
    tone: 'success',
  },
  {
    id: 'event-5',
    at: '09:38:16',
    title: '审校发现 6 个问题',
    detail: '主要集中在术语一致性和前后衔接。',
    tone: 'warning',
  },
  {
    id: 'event-6',
    at: '09:44:08',
    title: '等待章节审批',
    detail: '修订稿已生成，等待用户逐章确认。',
    tone: 'neutral',
  },
];

const initialArtifacts: DemoArtifact[] = [
  {
    id: 'artifact-context',
    nodeId: 'context-snapshot',
    name: '学习上下文',
    type: 'ContextSnapshot',
    version: 'v1',
    status: 'confirmed',
  },
  {
    id: 'artifact-brief',
    nodeId: 'intent-planner',
    name: 'Learning Brief',
    type: 'LearningBrief',
    version: 'v2',
    status: 'confirmed',
  },
  {
    id: 'artifact-blueprint',
    nodeId: 'outline-architect',
    name: '课程大纲',
    type: 'Outline',
    version: 'v3',
    status: 'confirmed',
  },
  {
    id: 'artifact-draft',
    nodeId: 'chapter-writers',
    name: '章节草稿',
    type: 'ContentDraft',
    version: 'v1',
    status: 'validated',
  },
  {
    id: 'artifact-review',
    nodeId: 'reviewer',
    name: '审校报告',
    type: 'ReviewReport',
    version: 'v1',
    status: 'validated',
  },
  {
    id: 'artifact-revised',
    nodeId: 'reviser',
    name: '修订与二次整理稿',
    type: 'ContentDraft',
    version: 'v2',
    status: 'validated',
    before: '## 性能指标\\n\\n旧版说明',
    after: '## 性能指标\\n\\n新版说明与示例',
  },
];

const initialChapterDecisions: Record<string, 'pending' | 'approved'> = {
  'chapter-performance-metrics': 'pending',
  'chapter-rendering': 'pending',
  'chapter-network': 'pending',
};

const chapterApprovalItems = [
  { id: 'chapter-performance-metrics', title: '性能指标与测量' },
  { id: 'chapter-rendering', title: '渲染性能' },
  { id: 'chapter-network', title: '网络与缓存' },
] as const;

const statusLabels: Record<NodeRunStatus, string> = {
  pending: '等待',
  running: '运行中',
  blocked: '阻塞',
  'waiting-approval': '等待审批',
  succeeded: '已完成',
  failed: '失败',
  skipped: '已跳过',
  stale: '已过期',
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
  const [selectedNodeId, setSelectedNodeId] = useState('chapter-approval');
  const [nodeStatuses, setNodeStatuses] =
    useState<Record<string, NodeRunStatus>>(initialNodeStatuses);
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus>('waiting-human');
  const [events, setEvents] = useState(initialEvents);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [promptCalls, setPromptCalls] = useState<PromptMapCall[]>(initialPromptMapCalls);
  const [comment, setComment] = useState('');
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('pointer');
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [panSession, setPanSession] = useState<PanSession | null>(null);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [chapterDecisions, setChapterDecisions] = useState(initialChapterDecisions);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    const state = useWorkbenchStore.getState();
    if (!state.sidebarCollapsed) state.toggleSidebar();
  }, []);

  useEffect(() => {
    let active = true;
    const loadPromptCalls = () => {
      void fetchPromptMapCalls().then((calls) => {
        if (active && calls.length > 0) {
          setPromptCalls((current) => mergePromptMapCalls(current, calls));
        }
      }).catch(() => {
        // The content-pipeline demo remains usable when the API is offline.
      });
    };
    loadPromptCalls();
    const poll = window.setInterval(loadPromptCalls, 1500);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, []);

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

  const selectedNode =
    mainWorkflowDefinition.nodes.find((node) => node.id === selectedNodeId) ??
    mainWorkflowDefinition.nodes[0];
  const graphWidth = Math.max(...Object.values(nodePositions).map((item) => item.x)) + 240;
  const graphHeight = Math.max(...Object.values(nodePositions).map((item) => item.y)) + 150;
  const selectedArtifacts = artifacts.filter((artifact) => artifact.nodeId === selectedNode.id);
  const selectedDiff = selectedArtifacts.find((artifact) => artifact.before && artifact.after);
  const diffLines = selectedDiff?.before && selectedDiff.after
    ? diffText(selectedDiff.before, selectedDiff.after)
    : [];

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setComment('');
  }

  function appendPromptCall(role: string, inputText: string, status: PromptMapCall['status'] = 'running') {
    setPromptCalls((current) => mergePromptMapCalls(current, [
      createDemoPromptMapCall({
        id: `live-prompt-call-${Date.now()}`,
        role,
        inputText,
        status,
      }),
    ]));
  }

  function approveCurrentNode() {
    if (nodeStatuses[selectedNode.id] !== 'waiting-approval') return;

    if (selectedNode.id === 'chapter-approval') {
      appendPromptCall('beautifier', '对已确认章节执行格式统一和教材美化。', 'ok');
      appendPromptCall('assessment-generator', '根据已确认章节生成练习、参考答案和解析。', 'ok');
      appendPromptCall('quality-publisher', '检查发布清单与所有必需产物。', 'ok');
      setNodeStatuses((current) => ({
        ...current,
        'chapter-approval': 'succeeded',
        beautifier: 'succeeded',
        'assessment-generator': 'succeeded',
        'quality-gate': 'succeeded',
        'publish-approval': 'waiting-approval',
      }));
      setRunStatus('waiting-human');
      setArtifacts((current) => [
        ...current,
        {
          id: 'artifact-beautified',
          nodeId: 'beautifier',
          name: '美化教材',
          type: 'BeautifiedContent',
          version: 'v1',
          status: 'validated',
        },
        {
          id: 'artifact-assessment',
          nodeId: 'assessment-generator',
          name: '练习与解析',
          type: 'AssessmentSet',
          version: 'v1',
          status: 'validated',
        },
        {
          id: 'artifact-manifest',
          nodeId: 'quality-gate',
          name: '发布清单',
          type: 'PublicationManifest',
          version: 'v1',
          status: 'validated',
        },
      ]);
      setEvents((current) => [
        ...current,
        {
          id: `event-${current.length + 1}`,
          at: '09:46:20',
          title: '章节审批通过',
          detail: comment.trim() || '用户确认所有章节修订结果。',
          tone: 'success',
        },
        {
          id: `event-${current.length + 2}`,
          at: '09:47:02',
          title: '等待发布确认',
          detail: '美化和出题完成，等待最终发布审批。',
          tone: 'neutral',
        },
      ]);
      setSelectedNodeId('publish-approval');
      setComment('');
      toast('章节已确认，进入发布确认');
      return;
    }

    if (selectedNode.id === 'publish-approval') {
      appendPromptCall('quality-publisher', '确认所有产物可发布并生成最终教材版本。', 'ok');
      setNodeStatuses((current) => ({
        ...current,
        'publish-approval': 'succeeded',
        publisher: 'succeeded',
      }));
      setRunStatus('succeeded');
      setEvents((current) => [
        ...current,
        {
          id: `event-${current.length + 1}`,
          at: '09:48:30',
          title: '教材已发布',
          detail: '版本 v1 已写入教材资产。',
          tone: 'success',
        },
      ]);
      toast('教材演示版本已发布');
    }
  }

  function approveChapter(chapterId: string) {
    const nextDecisions = { ...chapterDecisions, [chapterId]: 'approved' as const };
    setChapterDecisions(nextDecisions);
    if (Object.values(nextDecisions).every((decision) => decision === 'approved')) {
      approveCurrentNode();
    }
  }

  function approveAllChapters() {
    setChapterDecisions({
      'chapter-performance-metrics': 'approved',
      'chapter-rendering': 'approved',
      'chapter-network': 'approved',
    });
    approveCurrentNode();
  }

  function rerunSelectedNode() {
    appendPromptCall(selectedNode.id, `重新执行 ${selectedNode.label}，使用当前工作流上下文。`);
    const orderedNodes = nodeColumns.flat();
    const startIndex = (orderedNodes as readonly string[]).indexOf(selectedNode.id);
    setNodeStatuses((current) => {
      const next = { ...current };
      orderedNodes.forEach((nodeId, index) => {
        if (index < startIndex) return;
        next[nodeId] = index === startIndex ? 'running' : 'pending';
      });
      return next;
    });
    setRunStatus('running');
    setEvents((current) => [
      ...current,
      {
        id: `event-${current.length + 1}`,
        at: '09:45:10',
        title: '局部重跑已创建',
        detail: `从 ${selectedNode.label} 开始重新执行下游链路。`,
        tone: 'neutral',
      },
    ]);
    toast(`已从 ${selectedNode.label} 开始局部重跑`);
  }

  function branchSelectedNode() {
    setRunStatus('running');
    setEvents((current) => [
      ...current,
      {
        id: `event-${current.length + 1}`,
        at: '09:45:20',
        title: '运行分支已创建',
        detail: `已从 ${selectedNode.label} 创建独立运行分支。`,
        tone: 'neutral',
      },
    ]);
    toast(`已从 ${selectedNode.label} 创建运行分支`);
  }

  function requestChanges() {
    appendPromptCall('reviser', comment.trim() || '根据用户审批意见重新整理章节。');
    setNodeStatuses((current) => ({
      ...current,
      reviewer: 'pending',
      reviser: 'running',
      'chapter-approval': 'pending',
    }));
    setRunStatus('running');
    setEvents((current) => [
      ...current,
      {
        id: `event-${current.length + 1}`,
        at: '09:46:20',
        title: '章节审批要求修改',
        detail: comment.trim() || '用户提出了章节修订意见。',
        tone: 'warning',
      },
    ]);
    setChapterDecisions(initialChapterDecisions);
    setSelectedNodeId('reviser');
    toast('审批意见已发送给修订整理 Agent');
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
              <span className="pipeline-metric">耗时 <strong>2m 34s</strong></span>
              <span className="pipeline-metric">Tokens <strong>13.5k</strong></span>
              <span className="pipeline-metric">成本 <strong>$0.027</strong></span>
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
                {mainWorkflowDefinition.edges.map((edge) => {
                  const source = nodePositions[edge.from.nodeId];
                  const target = nodePositions[edge.to.nodeId];
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

              {mainWorkflowDefinition.nodes.map((node) => {
                const position = nodePositions[node.id];
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
                leadingIcon={<PlayIcon size={15} weight="fill" />}
                onClick={() => {
                  appendPromptCall('curriculum', '继续执行当前课程设计工作流中的待处理节点。');
                  setRunStatus('running');
                  toast('运行已继续，当前演示将调度待执行节点');
                }}
              >
                继续运行
              </Button>
              <Button
                id="content-pipeline-pause"
                variant="secondary"
                leadingIcon={<PauseIcon size={15} weight="fill" />}
                onClick={() => setRunStatus('paused')}
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
                  <small>当前运行与历史记录</small>
                </span>
                {historyExpanded ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}
              </button>
              {historyExpanded && (
                <div className="pipeline-history-window__list">
                  <button
                    type="button"
                    id="content-pipeline-run-current"
                    className="pipeline-run-item is-active"
                    onClick={() => toast('已切换到当前运行')}
                  >
                    <span>
                      <strong>前端性能优化</strong>
                      <small>09:18 启动 · 等待人工</small>
                    </span>
                    <span className="pipeline-run-item__dot is-waiting" />
                  </button>
                  <button
                    type="button"
                    id="content-pipeline-run-history-1"
                    className="pipeline-run-item"
                    onClick={() => toast('历史运行')}
                  >
                    <span>
                      <strong>线性代数复习</strong>
                      <small>昨天 · 已完成</small>
                    </span>
                    <CheckCircleIcon size={14} weight="fill" />
                  </button>
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
              {selectedNode.id === 'chapter-approval' && (
                <div className="pipeline-chapter-approvals">
                  {chapterApprovalItems.map((chapter) => (
                    <div key={chapter.id} className="pipeline-chapter-row">
                      <span>
                        <strong>{chapter.title}</strong>
                        <small>
                          {chapterDecisions[chapter.id] === 'approved'
                            ? '已通过'
                            : '等待确认'}
                        </small>
                      </span>
                      <Button
                        id={domId('content-pipeline', 'approve-chapter', chapter.id)}
                        variant="secondary"
                        size="sm"
                        disabled={chapterDecisions[chapter.id] === 'approved'}
                        onClick={() => approveChapter(chapter.id)}
                      >
                        通过本章
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
                  leadingIcon={<CheckCircleIcon size={14} weight="fill" />}
                  onClick={selectedNode.id === 'chapter-approval' ? approveAllChapters : approveCurrentNode}
                >
                  {selectedNode.id === 'chapter-approval' ? '全部通过' : '确认通过'}
                </Button>
                <Button
                  id="content-pipeline-approval-reject"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<WarningCircleIcon size={14} weight="bold" />}
                  onClick={requestChanges}
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
              leadingIcon={<ArrowClockwiseIcon size={14} weight="bold" />}
              onClick={rerunSelectedNode}
            >
              从此节点重跑
            </Button>
            <Button
              id="content-pipeline-node-branch"
              variant="secondary"
              size="sm"
              leadingIcon={<GitBranchIcon size={14} weight="bold" />}
              onClick={branchSelectedNode}
            >
              创建运行分支
            </Button>
          </div>

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
                <div key={artifact.id} className="pipeline-artifact">
                  <div>
                    <strong>{artifact.name}</strong>
                    <span>{artifact.type}</span>
                  </div>
                  <code>
                    {artifact.version} · {artifact.status}
                  </code>
                </div>
              ))
            ) : (
              <p className="pipeline-empty">当前尚无产物</p>
            )}
          </div>

          {selectedDiff && (
            <div className="pipeline-inspector__section">
              <span className="pipeline-section-label">Artifact Diff</span>
              <div className="pipeline-diff">
                <div className="pipeline-diff__summary">
                  <span>+{diffLines.filter((line) => line.type === 'added').length}</span>
                  <span>-{diffLines.filter((line) => line.type === 'removed').length}</span>
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
          </div>
        </div>

        <div className="card pipeline-artifacts">
          <header>
            <div>
              <span className="pipeline-section-label">Artifact Store</span>
              <strong>产物版本</strong>
            </div>
            <span>{artifacts.length} 个版本</span>
          </header>
          <div className="pipeline-artifacts__list">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                id={domId('content-pipeline', 'artifact', artifact.id)}
                className="pipeline-artifact-row"
                onClick={() => selectNode(artifact.nodeId)}
              >
                <span>
                  <strong>{artifact.name}</strong>
                  <small>{artifact.type}</small>
                </span>
                <code>
                  {artifact.version} · {artifact.status}
                </code>
              </button>
            ))}
          </div>
        </div>

        <PromptMapPanel calls={promptCalls} />
      </section>
    </section>
  );
}
