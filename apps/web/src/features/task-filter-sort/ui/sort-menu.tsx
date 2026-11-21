"use client";

import { sortOrderSchema, taskSortSchema, type SortOrder, type TaskSort } from "@postdog/shared";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTaskListParams } from "@/entities/task";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

/** Each sort field with the words its two directions read as. */
const SORT_OPTIONS: Record<TaskSort, { label: string; order: Record<SortOrder, string> }> = {
  createdAt: { label: "Created", order: { desc: "Newest first", asc: "Oldest first" } },
  priority: { label: "Priority", order: { desc: "Highest first", asc: "Lowest first" } },
};

export function SortMenu() {
  const { params, setParams } = useTaskListParams();
  const current = SORT_OPTIONS[params.sort];
  const Icon = params.order === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-10 shrink-0 gap-1.5 px-2.5 text-[13px] font-normal md:h-8"
          aria-label={`Sort: ${current.label}, ${current.order[params.order].toLowerCase()}`}
        >
          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="max-sm:hidden">{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={params.sort}
          onValueChange={(value) => {
            const sort = taskSortSchema.safeParse(value).data;
            if (sort) setParams({ sort });
          }}
        >
          {taskSortSchema.options.map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort} className="text-[13px]">
              {SORT_OPTIONS[sort].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={params.order}
          onValueChange={(value) => {
            const order = sortOrderSchema.safeParse(value).data;
            if (order) setParams({ order });
          }}
        >
          {sortOrderSchema.options.toReversed().map((order) => (
            <DropdownMenuRadioItem key={order} value={order} className="text-[13px]">
              {current.order[order]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
