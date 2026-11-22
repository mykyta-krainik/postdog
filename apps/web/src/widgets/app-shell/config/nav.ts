import { Inbox, ListTodo, Settings, Sun, type LucideIcon } from "lucide-react";
import { routes } from "@/shared/config";

/** `ai` items are AI entry points, hidden while AI is off. `unread` items carry the unread badge. */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  ai?: boolean;
  unread?: boolean;
};

/** Docs joins when its phase lands. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: routes.today, label: "Today", icon: Sun, ai: true },
  { href: routes.tasks, label: "Tasks", icon: ListTodo },
  { href: routes.inbox, label: "Inbox", icon: Inbox, ai: true, unread: true },
  { href: routes.settings, label: "Settings", icon: Settings },
];

/** The items to show: AI entry points are hidden, not disabled, while AI is off. */
export function navItemsFor(aiEnabled: boolean): readonly NavItem[] {
  return aiEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.ai);
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
