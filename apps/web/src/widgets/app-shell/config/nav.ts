import { ListTodo, Settings, type LucideIcon } from "lucide-react";
import { routes } from "@/shared/config";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Phase 1 navigation. Today, Docs and Inbox join when their phases land. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: routes.tasks, label: "Tasks", icon: ListTodo },
  { href: routes.settings, label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
