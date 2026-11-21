import { idParamsSchema } from "@postdog/shared";
import { notFound, redirect } from "next/navigation";
import { routes } from "@/shared/config";

/** /tasks/[id] is a shareable alias. The task opens in the panel of the Tasks page. */
export async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  redirect(routes.task(parsed.data.id));
}
