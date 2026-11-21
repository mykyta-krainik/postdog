import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tasks" };

export function TasksPage() {
  return <main className="flex-1 p-6 text-sm">Tasks</main>;
}
