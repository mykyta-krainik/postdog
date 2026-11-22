import type { ChangesetTaskState, NotificationKind } from "@postdog/shared";
import { ListTree, PencilLine, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import {
  CHANGESET_TASK_STATE_META,
  NOTIFICATION_KIND_LABEL,
  unreadBadgeText,
  type ChangesetStateTone,
} from "../model/describe";

const KIND_ICON: Record<NotificationKind, { icon: LucideIcon; className: string }> = {
  auto_decomposition: { icon: ListTree, className: "text-brand" },
  agent_failed: { icon: TriangleAlert, className: "text-destructive" },
  conflict: { icon: PencilLine, className: "text-muted-foreground" },
};

export function NotificationKindIcon({
  kind,
  className,
}: {
  kind: NotificationKind;
  className?: string;
}) {
  const { icon: Icon, className: tone } = KIND_ICON[kind];
  return (
    <Icon
      role="img"
      aria-label={NOTIFICATION_KIND_LABEL[kind]}
      className={cn("size-4 shrink-0", tone, className)}
    />
  );
}

/** The amber dot of an unread notification. */
export function UnreadDot({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-2 shrink-0", className)}>
      <span aria-hidden className="block size-2 rounded-full bg-brand ring-[3px] ring-brand-soft" />
      <span className="sr-only">Unread</span>
    </span>
  );
}

/** The unread count on the Inbox nav item, capped at 9+. Renders nothing at zero. */
export function UnreadCountBadge({
  count,
  className,
}: {
  count: number | undefined;
  className?: string;
}) {
  const text = unreadBadgeText(count);
  if (!text) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-foreground tabular-nums",
        className,
      )}
    >
      {text}
    </span>
  );
}

const TONE_CLASS: Record<ChangesetStateTone, string> = {
  brand: "border-brand/30 bg-brand-soft text-brand",
  muted: "border-border bg-muted text-muted-foreground",
  done: "border-status-done/30 bg-status-done/10 text-status-done",
};

export function ChangesetStateBadge({ state }: { state: ChangesetTaskState }) {
  const { label, tone } = CHANGESET_TASK_STATE_META[state];
  return (
    <Badge variant="outline" className={cn("font-normal", TONE_CLASS[tone])}>
      {label}
    </Badge>
  );
}
