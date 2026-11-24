"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { routes } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import { Wordmark } from "@/shared/ui/wordmark";
import { UnreadCountBadge, unreadBadgeText, useUnreadCount } from "@/entities/notification";
import { useSettings } from "@/entities/settings";
import { isActive, navItemsFor } from "../config/nav";

/** Mobile only: the wordmark and a menu button that opens the navigation sheet. */
export function MobileTopBar() {
  const pathname = usePathname();
  const { aiEnabled } = useSettings();
  const unread = useUnreadCount(aiEnabled);
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-1.5 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={unreadBadgeText(unread) ? `Open menu, ${unread} unread` : "Open menu"}
            className="relative cursor-pointer flex size-10 items-center justify-center rounded-md text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Menu className="size-5" aria-hidden />
            {unreadBadgeText(unread) && (
              <span
                aria-hidden
                className="absolute top-2 right-2 size-2 rounded-full bg-brand ring-2 ring-sidebar"
              />
            )}
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <div className="flex h-12 items-center justify-between pr-1.5 pl-4">
            <SheetTitle>
              <Wordmark />
            </SheetTitle>
            <SheetClose
              aria-label="Close menu"
              className="flex size-10 items-center justify-center rounded-md outline-none hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </SheetClose>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-1 px-2 pt-1">
            {navItemsFor(aiEnabled).map(({ href, label, icon: Icon, unread: showsUnread }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none",
                    "hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                  {showsUnread && <UnreadCountBadge count={unread} className="ml-auto" />}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
      <Link
        href={routes.tasks}
        aria-label="Postdog home"
        className="flex h-10 items-center rounded-md px-1.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Wordmark />
      </Link>
    </header>
  );
}
