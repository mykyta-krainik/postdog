import type { Metadata } from 'next';
import { InboxView } from './inbox-view';

export const metadata: Metadata = { title: 'Inbox' };

export function InboxPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <InboxView />
    </main>
  );
}
