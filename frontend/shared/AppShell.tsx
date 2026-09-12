import type { ReactNode } from 'react';

import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { ToastViewport } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <TopBar />
      <div className="shell__body">
        <SideNav />
        <main className="shell__content">{children}</main>
      </div>
      <ToastViewport />
    </div>
  );
}
