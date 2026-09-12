import { useState } from 'react';
import { PaletteIcon, SlidersHorizontalIcon } from '@phosphor-icons/react';

import { AgentProfileModule } from './AgentProfileModule';
import { PersonalizationPanel } from './PersonalizationPanel';
import './SettingsModule.css';

type SettingsPanel = 'agent-profile' | 'personalization';

const menuItems: {
  key: SettingsPanel;
  label: string;
  description: string;
  icon: typeof SlidersHorizontalIcon;
}[] = [
  {
    key: 'agent-profile',
    label: 'Agent Profile',
    description: '角色模型与温度',
    icon: SlidersHorizontalIcon,
  },
  {
    key: 'personalization',
    label: '个性化美化',
    description: '色系、字体与字号',
    icon: PaletteIcon,
  },
];

export function SettingsModule() {
  const [activePanel, setActivePanel] = useState<SettingsPanel>('agent-profile');

  return (
    <section className="settings-workspace">
      <aside className="settings-menu">
        <header>
          <span>Settings</span>
          <h1>设置</h1>
        </header>
        <nav aria-label="设置菜单">
          {menuItems.map(({ key, label, description, icon: Icon }) => {
            const selected = key === activePanel;
            return (
              <button
                key={key}
                id={`settings-menu-${key}`}
                type="button"
                className={`settings-menu__item ${selected ? 'is-selected' : ''}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => setActivePanel(key)}
              >
                <span className="settings-menu__icon">
                  <Icon size={18} weight={selected ? 'fill' : 'regular'} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="settings-workspace__content">
        {activePanel === 'agent-profile' ? <AgentProfileModule /> : <PersonalizationPanel />}
      </div>
    </section>
  );
}
