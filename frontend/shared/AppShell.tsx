import { useEffect, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress } from '@fortawesome/free-solid-svg-icons';

import { useWorkbenchStore } from '../services/workbenchStore';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { Button, ToastViewport } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  const immersiveMode = useWorkbenchStore((state) => state.immersiveMode);
  const toggleImmersiveMode = useWorkbenchStore((state) => state.toggleImmersiveMode);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'F11') return;
      event.preventDefault();
      toggleImmersiveMode();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleImmersiveMode]);

  return (
    <div className={`shell${immersiveMode ? ' is-immersive' : ''}`}>
      <SideNav />
      <div className="shell__main">
        <TopBar />
        <main className="shell__content">{children}</main>
      </div>
      {immersiveMode && (
        <Button
          type="button"
          id="shell-immersive-exit"
          variant="icon-ghost"
          className="shell__immersive-toggle"
          aria-label="退出沉浸式模式"
          title="退出沉浸式模式 (F11)"
          onClick={toggleImmersiveMode}
        >
          <FontAwesomeIcon icon={faCompress} />
        </Button>
      )}
      <ToastViewport />
    </div>
  );
}
