import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

import { useWorkbenchStore } from '../services/workbenchStore';
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
      <ul className="side-nav__items">
        {sideNavItems.map(({ key, label, icon: Icon }) => {
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
