import type { ReactNode } from 'react';
import { MobileTopBar } from './mobile-top-bar';
import { RunsWatcher } from './runs-watcher';
import { Sidebar } from './sidebar';

/** Mobile: top bar and sheet menu. Tablet: icon rail. Desktop: full sidebar. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <RunsWatcher />
      <MobileTopBar />
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
