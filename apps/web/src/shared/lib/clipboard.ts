/**
 * How a copy went: `clipboard` through the Clipboard API, `legacy` through the older
 * execCommand path, `manual` when the browser allowed neither and the user has to press Ctrl+C.
 */
export type CopyResult = 'clipboard' | 'legacy' | 'manual';

export type CopyDeps = {
  /** navigator.clipboard, which is missing outside secure contexts such as plain http on a LAN IP. */
  clipboard?: Pick<Clipboard, 'writeText'>;
  /** Copies through a hidden textarea and document.execCommand. Returns whether it worked. */
  legacyCopy: (text: string) => boolean;
};

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function browserDeps(): CopyDeps {
  return {
    clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    legacyCopy,
  };
}

/** Puts text on the clipboard with the best way the browser allows. Never throws. */
export async function copyText(text: string, deps: CopyDeps = browserDeps()): Promise<CopyResult> {
  if (deps.clipboard) {
    try {
      await deps.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // Denied permission or an unfocused document. The legacy path may still work.
    }
  }
  return deps.legacyCopy(text) ? 'legacy' : 'manual';
}
