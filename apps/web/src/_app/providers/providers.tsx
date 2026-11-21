"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { isRetryableError } from "@/shared/api";
import { ThemeSync } from "@/shared/lib/theme";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ shouldRetryOnError: isRetryableError, errorRetryCount: 3 }}>
      <TooltipProvider delayDuration={300}>
        <ThemeSync />
        {children}
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </SWRConfig>
  );
}
