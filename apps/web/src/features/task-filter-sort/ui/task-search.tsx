'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTaskListParams } from '@/entities/task';
import { cn } from '@/shared/lib/utils';

const DEBOUNCE_MS = 250;

/** Writes the search to the URL after a short pause, so typing does not flood history or the API. */
export function TaskSearch({ className }: { className?: string }) {
  const { params, setParams } = useTaskListParams();
  const [value, setValue] = useState(params.q);
  const [syncedQ, setSyncedQ] = useState(params.q);
  const timer = useRef<number | undefined>(undefined);

  if (params.q !== syncedQ) {
    setSyncedQ(params.q);
    if (params.q !== value.trim()) setValue(params.q);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (next: string, delay = DEBOUNCE_MS) => {
    setValue(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setParams({ q: next }), delay);
  };

  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            change('', 0);
          }
        }}
        placeholder="Search tasks"
        aria-label="Search tasks"
        maxLength={200}
        className="h-10 cursor-pointer w-full min-w-0 rounded-md border border-input bg-transparent pr-8 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40 md:h-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => change('', 0)}
          aria-label="Clear search"
          className="absolute right-1 flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground md:size-6"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
