"use client";

import Link from "next/link";
import {
  StatusIcon,
  linkLabel,
  sortLinks,
  useTaskListParams,
  type TaskDetailLink,
} from "@/entities/task";
import { PanelSection } from "./panel-section";

/** Read-only in phase 1. Each row opens the linked task. Hidden when the task has no links. */
export function LinksSection({ links }: { links: TaskDetailLink[] }) {
  const { hrefWith } = useTaskListParams();
  if (links.length === 0) return null;

  return (
    <PanelSection title="Links">
      <ul className="-mx-1.5 flex flex-col">
        {sortLinks(links).map((link) => (
          <li key={link.id}>
            <Link
              href={hrefWith({ selectedTaskId: link.task.id })}
              scroll={false}
              className="flex h-10 items-center gap-2 rounded-md px-1.5 text-[13px] outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring md:h-7"
            >
              <span className="w-[5.5rem] shrink-0 text-xs text-muted-foreground">
                {linkLabel(link)}
              </span>
              <StatusIcon status={link.task.status} />
              <span className="min-w-11 shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {link.task.identifier}
              </span>
              <span className="min-w-0 flex-1 truncate">{link.task.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}
