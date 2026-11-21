import { ListTodo, Settings, Sun, type LucideIcon } from "lucide-react";
import { routes } from "@/shared/config";

/** `ai` items are AI entry points, hidden while AI is off. */
export type NavItem = { href: string; label: string; icon: LucideIcon; ai?: boolean };

/** Docs and Inbox join when their phases land. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: routes.today, label: "Today", icon: Sun, ai: true },
  { href: routes.tasks, label: "Tasks", icon: ListTodo },
  { href: routes.settings, label: "Settings", icon: Settings },
];

/** The items to show: AI entry points are hidden, not disabled, while AI is off. */
export function navItemsFor(aiEnabled: boolean): readonly NavItem[] {
  return aiEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.ai);
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
