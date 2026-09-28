export type TagSource = 'direct' | 'milestone' | 'project' | 'none';

export interface TagInheritanceResult {
  tags: string[];
  source: TagSource;
  originName?: string;
}

export interface EntityTagAncestors {
  project?: { name: string; opsOwners?: string[] | undefined; businessAnalysts?: string[] | undefined } | undefined;
  milestone?: { name: string; projectId?: string | undefined; opsOwners?: string[] | undefined; businessAnalysts?: string[] | undefined } | undefined;
}

export function resolveInheritedTags(
  field: 'opsOwners' | 'businessAnalysts',
  item: { opsOwners?: string[]; businessAnalysts?: string[]; milestoneId?: string; projectId?: string },
  ancestors: EntityTagAncestors
): TagInheritanceResult {
  const direct = item[field];
  if (direct && direct.length > 0) {
    return { tags: direct, source: 'direct' };
  }

  if (ancestors.milestone) {
    const msTags = ancestors.milestone[field];
    if (msTags && msTags.length > 0) {
      return { tags: msTags, source: 'milestone', originName: ancestors.milestone.name };
    }
  }

  if (ancestors.project) {
    const projTags = ancestors.project[field];
    if (projTags && projTags.length > 0) {
      return { tags: projTags, source: 'project', originName: ancestors.project.name };
    }
  }

  return { tags: [], source: 'none' };
}
