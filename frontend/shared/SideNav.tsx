import {
  BooksIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FlowArrowIcon,
  GraduationCapIcon,
  GraphIcon,
  NoteBlankIcon,
  UserCircleIcon,
  UserFocusIcon,
} from '@phosphor-icons/react';

import { messages } from '../constants';
import { useWorkbenchStore, type ModuleKey } from '../services/workbenchStore';
import { domId } from './ids';
import { Button } from './ui/Button';

const items: { key: ModuleKey; label: string; icon: typeof GraphIcon }[] = [
  { key: 'knowledge-map', label: messages.nav.knowledgeMap, icon: GraphIcon },
  { key: 'bookshelf', label: messages.nav.bookshelf, icon: BooksIcon },
  { key: 'learning-zone', label: messages.nav.learningZone, icon: GraduationCapIcon },
  { key: 'content-pipeline', label: messages.nav.contentPipeline, icon: FlowArrowIcon },
  { key: 'notes', label: messages.nav.notes, icon: NoteBlankIcon },
  { key: 'profile', label: messages.nav.profile, icon: UserCircleIcon },
  { key: 'settings', label: messages.nav.settings, icon: UserFocusIcon },
];

export function SideNav() {
  const activeModule = useWorkbenchStore((state) => state.activeModule);
  const collapsed = useWorkbenchStore((state) => state.sidebarCollapsed);
  const setActive = useWorkbenchStore((state) => state.setActive);
  const toggleSidebar = useWorkbenchStore((state) => state.toggleSidebar);

  return (
    <nav className={`side-nav ${collapsed ? 'is-collapsed' : ''}`}>
      <ul className="side-nav__items">
        {items.map(({ key, label, icon: Icon }) => {
          const active = key === activeModule;
          return (
            <li key={key}>
              <Button
                type="button"
                id={domId('shell', 'nav', key)}
                onClick={() => setActive(key)}
                variant="secondary"
                className={`side-nav__item ${active ? 'is-active' : ''}`}
                title={collapsed ? label : undefined}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <span className="side-nav__icon">
                  <Icon size={19} weight={active ? 'fill' : 'regular'} />
                </span>
                <span className="side-nav__label">{label}</span>
              </Button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        id="shell-sidebar-toggle"
        className="side-nav__toggle"
        aria-label={collapsed ? '展开导航' : '收起导航'}
        aria-expanded={!collapsed}
        title={collapsed ? '展开导航' : '收起导航'}
        onClick={toggleSidebar}
      >
        {collapsed ? (
          <CaretRightIcon size={15} weight="bold" />
        ) : (
          <CaretLeftIcon size={15} weight="bold" />
        )}
      </button>
    </nav>
  );
}
