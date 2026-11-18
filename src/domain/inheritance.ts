export type TagSource = 'direct' | 'cr' | 'none';

export interface TagInheritanceResult {
  tags: string[];
  source: TagSource;
  originName?: string;
}

/**
 * Only the CR tier remains: a task has exactly one CR ancestor and no milestone
 * tier. `systemId` is deliberately not inherited — it must be one of the CR's
 * targets and the caller decides which one.
 */
export interface EntityTagAncestors {
  cr?: { name: string; opsOwners?: string[] | undefined; businessAnalysts?: string[] | undefined } | undefined;
}

export function resolveInheritedTags(
  field: 'opsOwners' | 'businessAnalysts',
  item: { opsOwners?: string[]; businessAnalysts?: string[]; crId?: string },
  ancestors: EntityTagAncestors
): TagInheritanceResult {
  const direct = item[field];
  if (direct && direct.length > 0) {
    return { tags: direct, source: 'direct' };
  }

  if (ancestors.cr) {
    const crTags = ancestors.cr[field];
    if (crTags && crTags.length > 0) {
      return { tags: crTags, source: 'cr', originName: ancestors.cr.name };
    }
  }

  return { tags: [], source: 'none' };
}
