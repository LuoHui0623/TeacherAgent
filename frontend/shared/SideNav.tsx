import { useWorkbenchStore, type ModuleKey } from '../services/workbenchStore';
import { messages } from '../constants';
import {
  GraphIcon,
  BooksIcon,
  GraduationCapIcon,
  NoteBlankIcon,
  UserCircleIcon,
} from '@phosphor-icons/react';

const items: { key: ModuleKey; label: string; icon: typeof GraphIcon }[] = [
  { key: 'knowledge-map', label: messages.nav.knowledgeMap, icon: GraphIcon },
  { key: 'bookshelf', label: messages.nav.bookshelf, icon: BooksIcon },
  { key: 'learning-zone', label: messages.nav.learningZone, icon: GraduationCapIcon },
  { key: 'notes', label: messages.nav.notes, icon: NoteBlankIcon },
  { key: 'profile', label: messages.nav.profile, icon: UserCircleIcon },
];

/* 左侧导航栏：工作台式布局，无路由 */
export function SideNav() {
  const activeModule = useWorkbenchStore((s) => s.activeModule);
  const setActive = useWorkbenchStore((s) => s.setActive);

  return (
    <nav
      className="flex h-full w-56 shrink-0 flex-col border-r py-6"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="px-6">
        <h1 className="text-base font-semibold tracking-tight">{messages.app.title}</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-tertiary)' }}>
          {messages.app.subtitle}
        </p>
      </div>
      <ul className="mt-8 flex flex-col gap-1 px-3">
        {items.map(({ key, label, icon: Icon }) => {
          const active = key === activeModule;
          return (
            <li key={key}>
              <button
                onClick={() => setActive(key)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
                style={{
                  background: active ? 'var(--canvas)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-secondary)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <Icon size={18} weight={active ? 'fill' : 'regular'} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
