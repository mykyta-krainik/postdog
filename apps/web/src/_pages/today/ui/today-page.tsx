import type { Metadata } from 'next';
import { TodayView } from './today-view';

export const metadata: Metadata = { title: 'Today' };

export function TodayPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <TodayView />
    </main>
  );
}
