import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: import.meta.dirname });

/** Lints one import as if it were written in `file`, and returns the FSD boundary errors. */
async function boundaryErrors(file: string, source: string) {
  const [result] = await eslint.lintText(`export * from "${source}";\n`, { filePath: file });
  return (result?.messages ?? []).filter((m) => m.ruleId === "boundaries/dependencies");
}

describe("FSD import rules", () => {
  it.each([
    ["a lower layer through its index", "src/_pages/tasks/ui/probe.ts", "@/widgets/app-shell"],
    ["a shared segment file", "src/_pages/tasks/ui/probe.ts", "@/shared/config/routes"],
    ["a file inside the same slice", "src/_pages/tasks/probe.ts", "./ui/tasks-page"],
    ["a page from a route file", "app/probe/page.tsx", "@/_pages/settings"],
    ["the app layer from a route file", "app/probe/layout.tsx", "@/_app"],
  ])("allows importing %s", async (_case, file, source) => {
    expect(await boundaryErrors(file, source)).toEqual([]);
  });

  it.each([
    ["an upper layer", "src/shared/api/probe.ts", "@/widgets/app-shell"],
    ["a sibling slice on the same layer", "src/_pages/tasks/ui/probe.ts", "@/_pages/settings"],
    ["a file behind a slice's index", "src/_app/probe.ts", "@/widgets/app-shell/ui/app-shell"],
    ["a widget from a route file", "app/probe/page.tsx", "@/widgets/app-shell"],
  ])("rejects importing %s", async (_case, file, source) => {
    expect(await boundaryErrors(file, source)).toHaveLength(1);
  });
});
