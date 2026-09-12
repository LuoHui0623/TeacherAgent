import { BookOpenIcon, BooksIcon, ClockIcon } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';

import { useWorkbenchStore } from '../../services/workbenchStore';
import { textbookCatalog } from '../mocks/textbooks';
import type { BookStatus, TextbookSummary } from '../../services/textbook/types';
import { domId } from '../../shared/ids';
import './BookshelfModule.css';

const statusMeta: Record<BookStatus, { label: string; className: string }> = {
  learning: { label: '学习中', className: 'is-learning' },
  ready: { label: '已生成', className: 'is-ready' },
  queued: { label: '待开始', className: 'is-queued' },
};

const shelves = [
  {
    id: 'foundation',
    label: '基础学科',
    caption: '数学 · 物理',
    books: textbookCatalog.filter((book) => ['数学', '物理'].includes(book.category)),
  },
  {
    id: 'computing',
    label: '计算与认知',
    caption: '计算机 · 人工智能 · 心理',
    books: textbookCatalog.filter((book) =>
      ['计算机', '人工智能', '心理'].includes(book.category),
    ),
  },
];

function BookCard({ book, index }: { book: TextbookSummary; index: number }) {
  const openTextbook = useWorkbenchStore((state) => state.openTextbook);
  const status = statusMeta[book.status];
  const titleClass = book.title.length > 6 ? 'book-cover__title is-compact' : 'book-cover__title';
  const style = { '--book-index': index } as CSSProperties;

  return (
    <button
      type="button"
      id={domId('bookshelf', 'open-textbook', book.id)}
      className="book-card"
      style={style}
      onClick={() => openTextbook(book.id)}
      aria-label={`打开《${book.title}》，${status.label}，学习进度 ${book.progress}%`}
    >
      <div className={`book-cover book-cover--${book.theme}`}>
        <span className="book-cover__spine" />
        <span className="book-cover__glint" />

        <div className="book-cover__header">
          <span>TeacherAgent</span>
          <code>{book.code}</code>
        </div>

        <div className="book-cover__title-block">
          <span className="book-cover__category">{book.category}</span>
          <h3 className={titleClass}>{book.title}</h3>
          <p>{book.subtitle}</p>
        </div>

        <div className="book-cover__footer">
          <span>Textbook Series</span>
          <span>{book.edition}</span>
        </div>
      </div>

      <div className="book-card__caption">
        <div className="book-card__title">
          <strong>{book.title}</strong>
          <span className={`book-status ${status.className}`}>{status.label}</span>
        </div>
        <div className="book-card__meta">
          <span>
            <BookOpenIcon size={13} />
            {book.chapterCount} 章
          </span>
          <span>
            <ClockIcon size={13} />
            {book.progress}%
          </span>
        </div>
        <span className="book-progress" aria-hidden="true">
          <span style={{ width: `${book.progress}%` }} />
        </span>
      </div>
    </button>
  );
}

export function BookshelfModule() {
  const learningCount = textbookCatalog.filter((book) => book.status === 'learning').length;
  const chapterCount = textbookCatalog.reduce((total, book) => total + book.chapterCount, 0);

  return (
    <section className="bookshelf-page">
      <header className="bookshelf-header motion-enter">
        <div>
          <p className="page-kicker">Library / Textbooks</p>
          <h1 className="page-title">教材书架</h1>
          <p className="page-subtitle">Agent 生成的教材按主题分柜陈列。</p>
        </div>

        <div className="bookshelf-stats" aria-label="教材统计">
          <div>
            <BooksIcon size={18} weight="duotone" />
            <span>
              <strong>{textbookCatalog.length}</strong>
              本教材
            </span>
          </div>
          <div>
            <BookOpenIcon size={18} weight="duotone" />
            <span>
              <strong>{chapterCount}</strong>
              个章节
            </span>
          </div>
          <div>
            <ClockIcon size={18} weight="duotone" />
            <span>
              <strong>{learningCount}</strong>
              本学习中
            </span>
          </div>
        </div>
      </header>

      <div className="bookshelf-cabinets">
        {shelves.map((shelf, shelfIndex) => (
          <section
            key={shelf.id}
            className="bookshelf-section motion-enter"
            style={{ animationDelay: `${80 + shelfIndex * 70}ms` }}
          >
            <div className="bookshelf-section__heading">
              <div>
                <h2>{shelf.label}</h2>
                <p>{shelf.caption}</p>
              </div>
              <span>{String(shelf.books.length).padStart(2, '0')}</span>
            </div>

            <div className="shelf-frame">
              <span className="shelf-frame__back" aria-hidden="true" />
              <div className="shelf-books">
                {shelf.books.map((book, bookIndex) => (
                  <BookCard key={book.id} book={book} index={bookIndex} />
                ))}
              </div>
              <span className="shelf-frame__rail" aria-hidden="true" />
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
