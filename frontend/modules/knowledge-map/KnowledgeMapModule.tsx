import { useMemo, useState } from 'react';

import { CaretRightIcon, GraphIcon, TreeStructureIcon } from '@phosphor-icons/react';

import { messages } from '../../constants';
import type { OutlinePayload } from '../../services/content-pipeline/contracts';
import type { KnowledgeGraph } from '../../services/knowledge-map/types';
import {
  currentOutlineSnapshot,
  layoutProjection,
  projectOutlineToKnowledgeMap,
  type ProjectionChapter,
} from '../../services/knowledge-map/projection';
import './KnowledgeMapModule.css';

function ChapterTree({
  chapters,
  selectedId,
  onSelect,
}: {
  chapters: ProjectionChapter[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="knowledge-map-tree__list">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <button
            type="button"
            id={`knowledge-map-chapter-${chapter.outlineNodeId}`}
            className={`knowledge-map-tree__item ${selectedId === chapter.id ? 'is-selected' : ''}`}
            onClick={() => onSelect(chapter.id)}
          >
            <CaretRightIcon size={13} weight="bold" />
            <span>
              <strong>{chapter.title}</strong>
              <small>{chapter.knowledgePointIds.length} 个知识点</small>
            </span>
          </button>
          {chapter.children.length > 0 && (
            <ChapterTree chapters={chapter.children} selectedId={selectedId} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function KnowledgeMapModule({
  outline = currentOutlineSnapshot,
  knowledgeGraph,
}: {
  outline?: OutlinePayload;
  knowledgeGraph?: KnowledgeGraph;
}) {
  const projection = useMemo(
    () => projectOutlineToKnowledgeMap(outline, knowledgeGraph),
    [outline, knowledgeGraph],
  );
  const firstKnowledge = projection.nodes.find((node) => node.kind === 'knowledge');
  const [selectedId, setSelectedId] = useState(firstKnowledge?.id ?? projection.nodes[0]?.id ?? '');
  const selectedNode = projection.nodes.find((node) => node.id === selectedId) ?? projection.nodes[0];
  const layout = useMemo(
    () => layoutProjection(projection, selectedNode?.id ?? ''),
    [projection, selectedNode?.id],
  );
  const selectedChapter = projection.chapters
    .flatMap((chapter) => flattenChapters(chapter))
    .find((chapter) => chapter.id === selectedNode?.sourceChapterIds[0]);

  return (
    <section className="knowledge-map-page">
      <header className="card knowledge-map-header motion-enter">
        <div>
          <p className="page-kicker">Knowledge Projection</p>
          <h1 className="page-title">{messages.nav.knowledgeMap}</h1>
          <p className="page-subtitle">
            从当前大纲确定性投影章节树与知识点关系，不调用 LLM，不使用物理模拟布局。
          </p>
        </div>
        <div className="knowledge-map-header__meta">
          <span>{projection.title}</span>
          <strong>{projection.nodes.filter((node) => node.kind === 'knowledge').length} 个知识点</strong>
        </div>
      </header>

      <div className="knowledge-map-layout">
        <aside className="card knowledge-map-tree motion-enter motion-delay-1">
          <header>
            <div>
              <span className="knowledge-map-section-label">Outline Source</span>
              <strong>章节树</strong>
            </div>
            <TreeStructureIcon size={18} weight="duotone" />
          </header>
          <p className="knowledge-map-source">
            Outline {outline.id} · 章节是知识点的来源章节
          </p>
          <ChapterTree
            chapters={projection.chapters}
            selectedId={selectedNode?.sourceChapterIds[0] ?? selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        <section className="card knowledge-map-graph motion-enter motion-delay-2">
          <header>
            <div>
              <span className="knowledge-map-section-label">Deterministic Graph</span>
              <strong>知识点子图</strong>
            </div>
            <span className="knowledge-map-count">当前节点周围 {layout.nodes.length} 个节点</span>
          </header>
          <div className="knowledge-map-legend">
            <span className="is-chapter">章节</span>
            <span className="is-knowledge">知识点</span>
            <span className="is-prerequisite">先修关系</span>
          </div>
          <div className="knowledge-map-canvas" role="img" aria-label="知识点关系图">
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet">
              {layout.edges.map((edge) => {
                const from = layout.nodes.find((node) => node.id === edge.from);
                const to = layout.nodes.find((node) => node.id === edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${edge.from}-${edge.to}-${edge.type}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={`knowledge-map-edge is-${edge.type}`}
                  />
                );
              })}
              {layout.nodes.map((node) => {
                const selected = node.id === selectedNode?.id;
                return (
                  <g
                    key={node.id}
                    id={`knowledge-map-node-${node.id.replace(/[:.]/g, '-')}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.kind === 'chapter' ? '章节' : '知识点'}：${node.label}`}
                    className={`knowledge-map-node is-${node.kind} ${selected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id);
                    }}
                  >
                    <circle cx={node.x} cy={node.y} r={node.kind === 'chapter' ? 22 : 17} />
                    <text x={node.x} y={node.y + 4} textAnchor="middle">
                      {node.label.length > 9 ? `${node.label.slice(0, 8)}…` : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        <aside className="card knowledge-map-inspector motion-enter motion-delay-3">
          <header>
            <div>
              <span className="knowledge-map-section-label">Projection Detail</span>
              <strong>来源与关系</strong>
            </div>
            <GraphIcon size={18} weight="duotone" />
          </header>
          {selectedNode ? (
            <>
              <div className={`knowledge-map-node-card is-${selectedNode.kind}`}>
                <span>{selectedNode.kind === 'chapter' ? '章节' : '知识点'}</span>
                <strong>{selectedNode.label}</strong>
                <p>{selectedNode.summary ?? '暂无摘要'}</p>
              </div>
              <div className="knowledge-map-inspector__section">
                <span className="knowledge-map-section-label">来源章节</span>
                {selectedNode.sourceChapterIds.map((chapterId) => {
                  const chapter = projection.nodes.find((node) => node.id === chapterId);
                  return <code key={chapterId}>{chapter?.label ?? chapterId}</code>;
                })}
                {selectedNode.sourceChapterIds.length === 0 && <p>暂无来源章节</p>}
              </div>
              <div className="knowledge-map-inspector__section">
                <span className="knowledge-map-section-label">回溯</span>
                <p>
                  {selectedNode.kind === 'knowledge'
                    ? `来自 ${selectedNode.sourceChapterIds.length} 个大纲章节`
                    : `大纲节点 ${selectedNode.outlineNodeId}`}
                </p>
                {selectedChapter?.summary && <p>{selectedChapter.summary}</p>}
              </div>
            </>
          ) : (
            <p className="knowledge-map-empty">当前大纲暂无可展示节点。</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function flattenChapters(chapter: ProjectionChapter): ProjectionChapter[] {
  return [chapter, ...chapter.children.flatMap(flattenChapters)];
}
