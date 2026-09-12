import { useState } from 'react';
import {
  BookOpenIcon,
  BooksIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  LightbulbIcon,
  ListBulletsIcon,
  WarningIcon,
} from '@phosphor-icons/react';

import { useWorkbenchStore } from '../../services/workbenchStore';
import {
  firstSectionId,
  getTextbookDocument,
} from '../mocks/textbooks';
import type {
  CalloutBlock,
  CodeBlock,
  ContentBlock,
  FormulaBlock,
  HeadingBlock,
  ProseBlock,
  SectionKind,
  TextbookDocument,
  TextbookSection,
} from '../../services/textbook/types';
import { domId } from '../../shared/ids';
import { SandboxBlock } from './SandboxBlock';
import './LearningZoneModule.css';

const sectionKindMeta: Record<SectionKind, { label: string; className: string }> = {
  lesson: { label: '正文', className: 'is-lesson' },
  sandbox: { label: '实验', className: 'is-sandbox' },
  practice: { label: '练习', className: 'is-practice' },
  review: { label: '复习', className: 'is-review' },
};

const calloutMeta = {
  info: { icon: InfoIcon, label: '说明' },
  tip: { icon: LightbulbIcon, label: '提示' },
  warning: { icon: WarningIcon, label: '注意' },
};

function ProseBlockView({ block }: { block: ProseBlock }) {
  return (
    <div className="reader-prose">
      {block.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const id = domId('learning', 'content-heading', block.id);
  return block.level === 2 ? (
    <h3 id={id} className="reader-heading is-level-2">
      {block.title}
    </h3>
  ) : (
    <h4 id={id} className="reader-heading is-level-3">
      {block.title}
    </h4>
  );
}

function CalloutBlockView({ block }: { block: CalloutBlock }) {
  const meta = calloutMeta[block.tone];
  const Icon = meta.icon;
  return (
    <aside className={`reader-callout is-${block.tone}`}>
      <span className="reader-callout__icon">
        <Icon size={18} weight="duotone" />
      </span>
      <div>
        <span>{meta.label}</span>
        <h4>{block.title}</h4>
        <p>{block.body}</p>
      </div>
    </aside>
  );
}

function FormulaBlockView({ block }: { block: FormulaBlock }) {
  return (
    <figure className="reader-formula">
      <code>{block.expression}</code>
      <figcaption>{block.caption}</figcaption>
    </figure>
  );
}

function CodeBlockView({ block }: { block: CodeBlock }) {
  return (
    <figure className="reader-code">
      <div className="reader-code__bar">
        <span>{block.language}</span>
        <span>Example</span>
      </div>
      <pre>
        <code>{block.code}</code>
      </pre>
      <figcaption>{block.caption}</figcaption>
    </figure>
  );
}

function ContentBlockView({
  block,
  textbookId,
}: {
  block: ContentBlock;
  textbookId: string;
}) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlockView block={block} />;
    case 'prose':
      return <ProseBlockView block={block} />;
    case 'callout':
      return <CalloutBlockView block={block} />;
    case 'formula':
      return <FormulaBlockView block={block} />;
    case 'code':
      return <CodeBlockView block={block} />;
    case 'sandbox':
      return <SandboxBlock scopeId={textbookId} block={block} />;
  }
}

function SectionHeading({ section }: { section: TextbookSection }) {
  const kind = sectionKindMeta[section.kind];
  return (
    <header className="reader-section-heading">
      <div className="reader-section-heading__meta">
        <span className={`section-kind ${kind.className}`}>{kind.label}</span>
        <span>
          <ClockIcon size={13} />
          {section.estimatedMinutes} 分钟
        </span>
      </div>
      <h2 id={domId('learning', 'section-title', section.id)}>{section.title}</h2>
      <p>{section.summary}</p>
    </header>
  );
}

function TextbookReader({
  textbook,
  onOpenBookshelf,
}: {
  textbook: TextbookDocument;
  onOpenBookshelf: () => void;
}) {
  const [selectedSectionId, setSelectedSectionId] = useState(firstSectionId(textbook));

  const sections = textbook.chapters.flatMap((chapter) =>
    chapter.sections.map((section) => ({ chapter, section })),
  );
  const selectedIndex = Math.max(
    0,
    sections.findIndex((item) => item.section.id === selectedSectionId),
  );
  const selected = sections[selectedIndex];
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const articleOutline = selected
    ? [
        {
          id: domId('learning', 'section-title', selected.section.id),
          title: selected.section.title,
          level: 1,
        },
        ...selected.section.blocks.flatMap((block) =>
          block.type === 'heading'
            ? [
                {
                  id: domId('learning', 'content-heading', block.id),
                  title: block.title,
                  level: block.level,
                },
              ]
            : [],
        ),
      ]
    : [];

  function toggleChapter(chapterId: string) {
    setCollapsedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  function scrollToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  if (!selected) {
    return (
      <section className="reader-empty">
        <BooksIcon size={32} weight="duotone" />
        <h2>教材内容尚未生成</h2>
        <button
          type="button"
          id="learning-empty-open-bookshelf"
          className="button button--secondary"
          onClick={onOpenBookshelf}
        >
          返回书架
        </button>
      </section>
    );
  }

  return (
    <section className={`reader-page book-cover--${textbook.theme}`}>
      <header className="reader-header motion-enter">
        <div className={`reader-book-mark book-cover--${textbook.theme}`}>
          <BookOpenIcon size={19} weight="duotone" />
        </div>
        <div className="reader-header__identity">
          <span>
            {textbook.category} · {textbook.code}
          </span>
          <h1>{textbook.title}</h1>
          <p>{textbook.subtitle}</p>
        </div>
        <div className="reader-header__progress">
          <span>整体进度</span>
          <strong>{textbook.progress}%</strong>
          <span className="reader-progress">
            <span style={{ width: `${textbook.progress}%` }} />
          </span>
        </div>
        <button
          type="button"
          id="learning-open-bookshelf"
          className="button button--secondary reader-back"
          onClick={onOpenBookshelf}
        >
          <BooksIcon size={15} />
          书架
        </button>
      </header>

      <div className="reader-layout">
        <aside className="reader-outline motion-enter motion-delay-1">
          <div className="reader-outline__heading">
            <ListBulletsIcon size={17} weight="duotone" />
            <div>
              <strong>目录</strong>
              <span>{textbook.chapters.length} 章</span>
            </div>
          </div>

          <nav aria-label="教材目录">
            {textbook.chapters.map((chapter) => (
              <div className="outline-chapter" key={chapter.id}>
                <button
                  type="button"
                  id={domId('learning', 'outline-chapter', chapter.id)}
                  className="outline-chapter__title"
                  aria-expanded={!collapsedChapterIds.has(chapter.id)}
                  onClick={() => toggleChapter(chapter.id)}
                >
                  <span className="outline-chapter__caret">
                    {collapsedChapterIds.has(chapter.id) ? (
                      <CaretRightIcon size={12} weight="bold" />
                    ) : (
                      <CaretDownIcon size={12} weight="bold" />
                    )}
                  </span>
                  <span>{chapter.title}</span>
                  <small>{chapter.sections.length}</small>
                </button>
                {!collapsedChapterIds.has(chapter.id) && (
                  <ul>
                    {chapter.sections.map((section) => {
                      const active = section.id === selectedSectionId;
                      const sectionIndex = sections.findIndex(
                        (item) => item.section.id === section.id,
                      );
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            id={domId('learning', 'outline-section', section.id)}
                            className={`outline-section ${active ? 'is-active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setSelectedSectionId(section.id)}
                          >
                            <span className="outline-section__state">
                              {sectionIndex < selectedIndex ? (
                                <CheckCircleIcon size={13} weight="fill" />
                              ) : (
                                <span />
                              )}
                            </span>
                            <span>{section.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </nav>

          <div className="reader-article-outline">
            <div className="reader-article-outline__heading">
              <strong>大纲</strong>
              <span>当前正文</span>
            </div>
            <ul>
              {articleOutline.map((item) => (
                <li key={item.id} className={`is-level-${item.level}`}>
                  <button
                    type="button"
                    id={domId('learning', 'article-outline', item.id)}
                    onClick={() => scrollToHeading(item.id)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <article className="reader-article motion-enter motion-delay-2">
          <div className="reader-breadcrumb">
            <span>{selected.chapter.title}</span>
            <span>/</span>
            <span>{selected.section.title}</span>
          </div>

          <SectionHeading section={selected.section} />

          <div className="reader-objectives">
            <span>学习目标</span>
            <ul className="objective-list">
              {selected.section.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </div>

          <div className="reader-blocks">
            {selected.section.blocks.map((block) => (
              <ContentBlockView key={block.id} block={block} textbookId={textbook.id} />
            ))}
          </div>

        </article>
      </div>
    </section>
  );
}

export function LearningZoneModule() {
  const activeTextbookId = useWorkbenchStore((state) => state.activeTextbookId);
  const setActive = useWorkbenchStore((state) => state.setActive);
  const textbook = getTextbookDocument(activeTextbookId);

  return (
    <TextbookReader
      key={textbook.id}
      textbook={textbook}
      onOpenBookshelf={() => setActive('bookshelf')}
    />
  );
}
