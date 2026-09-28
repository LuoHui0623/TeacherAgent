import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

import { useWorkbenchStore } from '../services/workbenchStore';
import { messages } from '../constants';
import { domId } from './ids';
import { sideNavItems } from './sideNavItems';
import { Button } from './ui/Button';

export function SideNav() {
  const activeModule = useWorkbenchStore((state) => state.activeModule);
  const collapsed = useWorkbenchStore((state) => state.sidebarCollapsed);
  const setActive = useWorkbenchStore((state) => state.setActive);
  const toggleSidebar = useWorkbenchStore((state) => state.toggleSidebar);

  return (
    <nav className={`side-nav ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="side-nav__brand">
        <span className="side-nav__mark">TA</span>
        <div className="side-nav__brand-copy">
          <strong>{messages.app.title}</strong>
          <span>{messages.app.subtitle}</span>
        </div>
      </div>

      <ul className="side-nav__items">
        {sideNavItems.map(({ key, label, icon }) => {
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
                  <FontAwesomeIcon icon={icon} style={{ fontSize: 19 }} />
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
          <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 15 }} />
        ) : (
          <FontAwesomeIcon icon={faChevronLeft} style={{ fontSize: 15 }} />
        )}
      </button>
    </nav>
  );
}
