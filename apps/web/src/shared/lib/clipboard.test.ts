import { describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

const TEXT = '*Status update*\n• PD-12 shipped';

describe('copyText', () => {
  it('uses the Clipboard API when the browser has it', async () => {
    const writeText = vi.fn(async () => {});
    const legacyCopy = vi.fn(() => true);

    await expect(copyText(TEXT, { clipboard: { writeText }, legacyCopy })).resolves.toBe(
      'clipboard',
    );
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(legacyCopy).not.toHaveBeenCalled();
  });

  it('falls back to the legacy copy when the Clipboard API is missing', async () => {
    const legacyCopy = vi.fn(() => true);

    await expect(copyText(TEXT, { legacyCopy })).resolves.toBe('legacy');
    expect(legacyCopy).toHaveBeenCalledWith(TEXT);
  });

  it('falls back to the legacy copy when the Clipboard API refuses', async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    });

    await expect(
      copyText(TEXT, { clipboard: { writeText }, legacyCopy: () => true }),
    ).resolves.toBe('legacy');
  });

  it('asks for a manual copy when neither way works', async () => {
    await expect(copyText(TEXT, { legacyCopy: () => false })).resolves.toBe('manual');
  });
});
