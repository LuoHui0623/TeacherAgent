/* 节点提示词地图区块：三态都由后端给出的 `nodeStatus` 与阶段状态表达。
 *
 * 取数在 ContentPipelineModule（它知道当前 run），本组件只渲染。
 */

import { useState } from 'react';
import {
  CaretDownIcon,
  CheckCircleIcon,
  CircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { domId } from '../../shared/ids';
import { Button } from '../../shared/ui';
import {
  artifactLabel,
  bindingRows,
  callStatusLabel,
  driftLabel,
  gateRows,
  shortHash,
  stageDetail,
  stageLabel,
  stageStateLabel,
  stageSummary,
  type PromptMap,
  type PromptMapCall,
  type StageState,
} from '../../services/content-pipeline/promptMap';

export type PromptMapViewState = 'loading' | 'empty' | 'ready' | 'error';

interface Props {
  state: PromptMapViewState;
  map: PromptMap | null;
  error: string;
  diff: string | null;
  onOpenDiff: () => void;
}

function StageIcon({ state }: { state: StageState }) {
  if (state === 'failed') return <WarningCircleIcon size={13} weight="fill" />;
  if (state === 'streaming') return <CircleIcon size={9} weight="fill" />;
  if (state === 'pending') return <CircleIcon size={9} />;
  return <CheckCircleIcon size={13} weight="fill" />;
}

export function NodePromptMap({ state, map, error, diff, onOpenDiff }: Props) {
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(() => new Set());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(() => new Set());

  function toggleCall(sequence: number) {
    setExpandedCalls((current) => {
      const next = new Set(current);
      if (next.has(sequence)) next.delete(sequence);
      else next.add(sequence);
      return next;
    });
  }

  function toggleStage(callSequence: number, kind: string) {
    const key = `${callSequence}:${kind}`;
    setExpandedStages((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="pipeline-inspector__section pipeline-prompt-map">
      <span className="pipeline-section-label">提示词地图</span>

      {state === 'loading' && <p className="pipeline-empty">正在读取提示词地图…</p>}
      {state === 'empty' && (
        <p className="pipeline-empty">这次流程还没有运行记录，发起一次运行后才能看地图。</p>
      )}
      {state === 'error' && <p className="pipeline-empty">无法读取提示词地图：{error}</p>}

      {state === 'ready' && map && (
        <>
          <TemplateBlock map={map} diff={diff} onOpenDiff={onOpenDiff} />

          <div className="prompt-map__calls">
            {map.calls.map((call) => (
              <CallBlock
                key={`${call.sequence}-${call.attempt}-${call.itemKey}`}
                call={call}
                expanded={expandedCalls.has(call.sequence)}
                expandedStages={expandedStages}
                onToggleCall={toggleCall}
                onToggleStage={toggleStage}
              />
            ))}
            {map.calls.length === 0 && <p className="pipeline-empty">该节点没有调用记录。</p>}
          </div>

          <ArtifactList label="输入产物" artifacts={map.inputs} />
          <ArtifactList label="输出产物" artifacts={map.outputs} />
          <ApprovalBlock map={map} />
        </>
      )}
    </div>
  );
}

function TemplateBlock({
  map,
  diff,
  onOpenDiff,
}: {
  map: PromptMap;
  diff: string | null;
  onOpenDiff: () => void;
}) {
  const template = map.template;
  if (!template) {
    return (
      <div className="prompt-map__template">
        <p className="pipeline-empty">该节点没有提示词资产，地图从调用记录开始。</p>
      </div>
    );
  }

  const drift = driftLabel(template);
  return (
    <div className="prompt-map__template">
      <div className="prompt-map__template-head">
        <code>{template.ref}</code>
        <small>{shortHash(template.currentHash)}</small>
      </div>

      {template.variables.length > 0 ? (
        <div className="prompt-map__bindings">
          <span className="pipeline-section-label">变量清单</span>
          {bindingRows(template).map((row) => (
            <div key={row.name} className={`prompt-map__binding is-${row.state}`}>
              <code>{`{{ ${row.name} }}`}</code>
              <span>{row.source}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="pipeline-empty">该模板没有变量，整份静态渲染。</p>
      )}

      {drift ? (
        <div className="prompt-map__drift">
          <WarningCircleIcon size={13} weight="fill" />
          <span>{drift}</span>
          <Button
            id="content-pipeline-prompt-map-diff"
            variant="secondary"
            size="sm"
            onClick={onOpenDiff}
          >
            查看差异
          </Button>
        </div>
      ) : (
        <p className="prompt-map__template-state">本次运行用的就是当前模板版本。</p>
      )}

      {diff !== null && <pre className="prompt-map__diff">{diff || '两版内容相同。'}</pre>}

      <details className="prompt-map__source">
        <summary>待填充模板</summary>
        <pre>{template.template}</pre>
      </details>
    </div>
  );
}

function CallBlock({
  call,
  expanded,
  expandedStages,
  onToggleCall,
  onToggleStage,
}: {
  call: PromptMapCall;
  expanded: boolean;
  expandedStages: Set<string>;
  onToggleCall: (sequence: number) => void;
  onToggleStage: (sequence: number, kind: string) => void;
}) {
  const planned = call.callId === null;
  const label = `${callStatusLabel(call.status)} · 第 ${call.sequence} 次调用`;
  return (
    <div className={`prompt-map__call${planned ? ' is-planned' : ''}`}>
      <button
        type="button"
        id={domId('content-pipeline', 'prompt-call', String(call.sequence), String(call.attempt))}
        className="prompt-map__call-head"
        aria-expanded={expanded}
        onClick={() => onToggleCall(call.sequence)}
      >
        <span>{label}</span>
        <small>{[call.itemKey || '整节点', call.role].filter(Boolean).join(' · ')}</small>
        <CaretDownIcon size={13} weight="bold" className={expanded ? 'is-expanded' : ''} />
      </button>

      {expanded && (
        <div className="prompt-map__stages">
          {call.stages.map((stage) => (
            <div key={stage.kind} className={`prompt-map__stage is-${stage.state}`}>
              <div className="prompt-map__stage-head">
                <StageIcon state={stage.state} />
                <span>{stageLabel(stage.kind)}</span>
                <small>{stageStateLabel(stage.state)}</small>
              </div>
              <p>{stageSummary(stage)}</p>
              {stageDetail(stage) !== '' && (
                <button
                  type="button"
                  id={domId(
                    'content-pipeline',
                    'prompt-stage',
                    `${call.sequence}-${call.attempt}-${stage.kind}`,
                  )}
                  className="prompt-map__stage-toggle"
                  aria-expanded={expandedStages.has(`${call.sequence}:${stage.kind}`)}
                  onClick={() => onToggleStage(call.sequence, stage.kind)}
                >
                  {expandedStages.has(`${call.sequence}:${stage.kind}`) ? '收起内容' : '查看内容'}
                </button>
              )}
              {expandedStages.has(`${call.sequence}:${stage.kind}`) && (
                <pre>{stageDetail(stage)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactList({ label, artifacts }: { label: string; artifacts: PromptMap['inputs'] }) {
  return (
    <div className="prompt-map__artifacts">
      <span className="pipeline-section-label">{label}</span>
      {artifacts.length > 0 ? (
        artifacts.map((artifact) => (
          <code key={`${artifact.nodeId}-${artifact.portId}-${artifact.itemKey}`}>
            {artifactLabel(artifact)}
          </code>
        ))
      ) : (
        <p className="pipeline-empty">无</p>
      )}
    </div>
  );
}

function ApprovalBlock({ map }: { map: PromptMap }) {
  const reviews = gateRows(map.outputs);
  if (reviews.length === 0 && map.nodeStatus !== 'waiting-human') return null;

  return (
    <div className="prompt-map__approval">
      <span className="pipeline-section-label">审批</span>
      {reviews.length > 0 ? (
        reviews.map((review) => (
          <div key={`${review.reviewer}-${review.decision}`} className="prompt-map__review">
            <span>{review.reviewer === 'user' ? '人工' : 'AI'} · {review.decision}</span>
            {review.comments && <p>{review.comments}</p>}
          </div>
        ))
      ) : (
        <p className="pipeline-empty">等待人工决断。</p>
      )}
    </div>
  );
}
