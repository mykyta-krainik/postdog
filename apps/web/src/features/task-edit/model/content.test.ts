import { describe, expect, it } from 'vitest';
import { contentPatch, rebaseContent } from './content';

const saved = { title: 'Fix the login redirect', description: 'Happens after SSO.' };

describe('contentPatch', () => {
  it('is empty when nothing changed', () => {
    expect(contentPatch({ ...saved }, saved)).toEqual({});
  });

  it('ignores spaces around the title, which the API trims anyway', () => {
    expect(contentPatch({ ...saved, title: '  Fix the login redirect ' }, saved)).toEqual({});
  });

  it('sends a changed title trimmed', () => {
    expect(contentPatch({ ...saved, title: ' Fix the login redirect loop ' }, saved)).toEqual({
      title: 'Fix the login redirect loop',
    });
  });

  it('sends a changed description as typed, since markdown whitespace matters', () => {
    const description = 'Steps:\n\n- sign in with SSO\n- wait 15 minutes\n';
    expect(contentPatch({ ...saved, description }, saved)).toEqual({ description });
  });

  it('sends both fields when both changed', () => {
    expect(contentPatch({ title: 'Login loop', description: '' }, saved)).toEqual({
      title: 'Login loop',
      description: '',
    });
  });
});

describe('rebaseContent', () => {
  const next = { title: 'Fix the SSO redirect', description: 'Seen in Safari only.' };

  it('moves fields the user has not touched to the newly saved values', () => {
    expect(rebaseContent(saved, next, { ...saved })).toEqual(next);
  });

  it("keeps the user's edit when the saved value changes under it", () => {
    const current = { ...saved, description: 'My notes so far' };
    expect(rebaseContent(saved, next, current)).toEqual({
      title: 'Fix the SSO redirect',
      description: 'My notes so far',
    });
  });
});
