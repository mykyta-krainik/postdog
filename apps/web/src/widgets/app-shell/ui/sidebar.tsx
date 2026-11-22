"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { routes } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Wordmark } from "@/shared/ui/wordmark";
import { UnreadCountBadge, useUnreadCount } from "@/entities/notification";
import { useSettings } from "@/entities/settings";
import { isActive, navItemsFor } from "../config/nav";

/** Labels hide on the tablet rail until it is expanded. Desktop always shows them. */
const RAIL_HIDDEN = "md:max-lg:group-data-[expanded=false]/sidebar:sr-only";

/** On the collapsed tablet rail the badge sits on the icon's corner. */
const RAIL_CORNER =
  "ml-auto md:max-lg:group-data-[expanded=false]/sidebar:absolute md:max-lg:group-data-[expanded=false]/sidebar:-top-1 md:max-lg:group-data-[expanded=false]/sidebar:right-0";

/** Tablet: a collapsible icon rail. Desktop: the full sidebar. Hidden on mobile. */
export function Sidebar() {
  const pathname = usePathname();
  const { aiEnabled } = useSettings();
  const unread = useUnreadCount(aiEnabled);
  const [expanded, setExpanded] = useState(false);
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <aside
      data-expanded={expanded}
      className="group/sidebar hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150 md:flex md:w-14 data-[expanded=true]:md:w-56 lg:w-56"
    >
      <Link
        href={routes.tasks}
        aria-label="Postdog home"
        className="flex h-12 shrink-0 items-center px-[18px] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <Wordmark textClassName={RAIL_HIDDEN} />
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-0.5 px-2 pt-1">
        {navItemsFor(aiEnabled).map(({ href, label, icon: Icon, unread: showsUnread }) => {
          const active = isActive(pathname, href);
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium outline-none",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-ring",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className={RAIL_HIDDEN}>{label}</span>
                  {showsUnread && <UnreadCountBadge count={unread} className={RAIL_CORNER} />}
                </Link>
              </TooltipTrigger>
              {!expanded && (
                <TooltipContent side="right" className="lg:hidden">
                  {label}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-auto p-2 lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ToggleIcon className="size-4 shrink-0" aria-hidden />
          <span className={RAIL_HIDDEN}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
