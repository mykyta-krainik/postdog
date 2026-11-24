import { Activity, Inbox, ListTodo, Settings, Sun, type LucideIcon } from 'lucide-react';
import { routes } from '@/shared/config';

/**
 * `ai` items are AI entry points, hidden while AI is off. `unread` items carry the unread badge,
 * `running` items the count of runs going now.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  ai?: boolean;
  unread?: boolean;
  running?: boolean;
};

/** Docs joins when its phase lands. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: routes.today, label: 'Today', icon: Sun, ai: true },
  { href: routes.tasks, label: 'Tasks', icon: ListTodo },
  { href: routes.runs, label: 'Runs', icon: Activity, ai: true, running: true },
  { href: routes.inbox, label: 'Inbox', icon: Inbox, ai: true, unread: true },
  { href: routes.settings, label: 'Settings', icon: Settings },
];

/** The items to show: AI entry points are hidden, not disabled, while AI is off. */
export function navItemsFor(aiEnabled: boolean): readonly NavItem[] {
  return aiEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.ai);
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** "1 run running", "3 runs running". */
export function runningText(count: number): string {
  return `${count} ${count === 1 ? 'run' : 'runs'} running`;
}

/**
 * The phone menu button carries one dot for both unread notifications and running runs, so its
 * name says which: "Open menu, 2 unread, 1 run running".
 */
export function menuButtonLabel(unread: number | undefined, running: number): string {
  const parts = ['Open menu'];
  if (unread && unread > 0) parts.push(`${unread} unread`);
  if (running > 0) parts.push(runningText(running));
  return parts.join(', ');
}
