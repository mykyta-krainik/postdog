import type { LinkDirection, LinkType, TaskDetailLink } from '@postdog/shared';

/**
 * How each link reads from the viewed task, and where its relation sorts.
 * Tasks that block this one come first. relates is symmetric, so both directions read the same.
 */
const LINK_RELATIONS: Record<LinkType, Record<LinkDirection, { label: string; rank: number }>> = {
  blocks: { in: { label: 'Blocked by', rank: 0 }, out: { label: 'Blocks', rank: 1 } },
  duplicates: { out: { label: 'Duplicates', rank: 2 }, in: { label: 'Duplicated by', rank: 3 } },
  relates: { out: { label: 'Relates to', rank: 4 }, in: { label: 'Relates to', rank: 4 } },
};

type LinkRelation = Pick<TaskDetailLink, 'type' | 'direction'>;

export function linkLabel({ type, direction }: LinkRelation): string {
  return LINK_RELATIONS[type][direction].label;
}

/** Links grouped by relation. Each group keeps the API order. */
export function sortLinks<T extends LinkRelation>(links: readonly T[]): T[] {
  const rank = ({ type, direction }: LinkRelation) => LINK_RELATIONS[type][direction].rank;
  return links.toSorted((a, b) => rank(a) - rank(b));
}
