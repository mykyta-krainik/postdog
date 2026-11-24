import type { ReactNode } from 'react';

export function TasksHeader({ action, children }: { action?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pt-3 pb-3 md:px-5">
      <div className="flex h-8 items-center justify-between gap-3">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Tasks</h1>
        {action}
      </div>
      {children}
    </header>
  );
}
