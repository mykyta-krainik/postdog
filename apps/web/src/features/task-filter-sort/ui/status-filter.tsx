"use client";

import { taskStatusSchema } from "@postdog/shared";
import { CircleDashed } from "lucide-react";
import {
  StatusIcon,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  useTaskListParams,
} from "@/entities/task";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

const ALL = "all";

export function StatusFilter() {
  const { params, setParams } = useTaskListParams();

  return (
    <Select
      value={params.status ?? ALL}
      onValueChange={(value) => setParams({ status: taskStatusSchema.safeParse(value).data })}
    >
      <SelectTrigger
        aria-label="Filter by status"
        className="h-10 shrink-0 gap-1.5 px-2.5 text-[13px] md:h-8 data-[size=default]:h-10 md:data-[size=default]:h-8"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL} className="text-[13px]">
          <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden />
          All statuses
        </SelectItem>
        {TASK_STATUS_ORDER.map((status) => (
          <SelectItem key={status} value={status} className="text-[13px]">
            <StatusIcon status={status} />
            {TASK_STATUS_META[status].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
