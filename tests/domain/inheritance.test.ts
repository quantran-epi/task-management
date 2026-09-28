// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveInheritedTags } from '../../src/domain/inheritance';

describe('Nearest-Ancestor Tag Inheritance Resolution Engine (SHB-02, D-06, D-07)', () => {
  it('returns direct tags when child has explicit tags (source: direct)', () => {
    const task = {
      opsOwners: ['ops-direct-1', 'ops-direct-2'],
      businessAnalysts: ['ba-direct'],
      milestoneId: 'ms-1',
      projectId: 'proj-1',
    };
    const ancestors = {
      milestone: {
        name: 'Milestone Alpha',
        opsOwners: ['ops-ms'],
        businessAnalysts: ['ba-ms'],
      },
      project: {
        name: 'Project Omega',
        opsOwners: ['ops-proj'],
        businessAnalysts: ['ba-proj'],
      },
    };

    const opsResult = resolveInheritedTags('opsOwners', task, ancestors);
    expect(opsResult).toEqual({
      tags: ['ops-direct-1', 'ops-direct-2'],
      source: 'direct',
    });

    const baResult = resolveInheritedTags('businessAnalysts', task, ancestors);
    expect(baResult).toEqual({
      tags: ['ba-direct'],
      source: 'direct',
    });
  });

  it('inherits from milestone when task tags are undefined or empty (source: milestone)', () => {
    const taskUndefined = {
      milestoneId: 'ms-1',
      projectId: 'proj-1',
    };
    const taskEmpty = {
      opsOwners: [],
      businessAnalysts: [],
      milestoneId: 'ms-1',
      projectId: 'proj-1',
    };
    const ancestors = {
      milestone: {
        name: 'Sprint 42',
        opsOwners: ['ops-sprint'],
        businessAnalysts: ['ba-sprint'],
      },
      project: {
        name: 'Project Titan',
        opsOwners: ['ops-titan'],
        businessAnalysts: ['ba-titan'],
      },
    };

    const opsUndefined = resolveInheritedTags('opsOwners', taskUndefined, ancestors);
    expect(opsUndefined).toEqual({
      tags: ['ops-sprint'],
      source: 'milestone',
      originName: 'Sprint 42',
    });

    const baEmpty = resolveInheritedTags('businessAnalysts', taskEmpty, ancestors);
    expect(baEmpty).toEqual({
      tags: ['ba-sprint'],
      source: 'milestone',
      originName: 'Sprint 42',
    });
  });

  it('falls back to parent project when milestone has no tags (source: project)', () => {
    const task = {
      milestoneId: 'ms-1',
      projectId: 'proj-1',
    };
    const ancestors = {
      milestone: {
        name: 'Empty Milestone',
        opsOwners: [],
        businessAnalysts: [],
      },
      project: {
        name: 'Core Banking',
        opsOwners: ['ops-core'],
        businessAnalysts: ['ba-core'],
      },
    };

    const opsResult = resolveInheritedTags('opsOwners', task, ancestors);
    expect(opsResult).toEqual({
      tags: ['ops-core'],
      source: 'project',
      originName: 'Core Banking',
    });

    const baResult = resolveInheritedTags('businessAnalysts', task, ancestors);
    expect(baResult).toEqual({
      tags: ['ba-core'],
      source: 'project',
      originName: 'Core Banking',
    });
  });

  it('inherits directly from project for standalone task with project (source: project)', () => {
    const task = {
      projectId: 'proj-1',
    };
    const ancestors = {
      project: {
        name: 'Payments Portal',
        opsOwners: ['ops-payments'],
        businessAnalysts: ['ba-payments'],
      },
    };

    const opsResult = resolveInheritedTags('opsOwners', task, ancestors);
    expect(opsResult).toEqual({
      tags: ['ops-payments'],
      source: 'project',
      originName: 'Payments Portal',
    });
  });

  it('returns source: none and empty array when no ancestors have tags or ancestors missing', () => {
    const standaloneTask = {};
    const ancestorsEmpty = {};

    const opsResult = resolveInheritedTags('opsOwners', standaloneTask, ancestorsEmpty);
    expect(opsResult).toEqual({
      tags: [],
      source: 'none',
    });

    const taskWithAncestorsWithoutTags = {
      milestoneId: 'ms-1',
      projectId: 'proj-1',
    };
    const emptyAncestors = {
      milestone: {
        name: 'M1',
      },
      project: {
        name: 'P1',
      },
    };

    const baResult = resolveInheritedTags('businessAnalysts', taskWithAncestorsWithoutTags, emptyAncestors);
    expect(baResult).toEqual({
      tags: [],
      source: 'none',
    });
  });

  it('resolves milestone tags inheriting from parent project when milestone tags are empty', () => {
    const milestone = {
      name: 'Release 1.0',
      projectId: 'proj-99',
    };
    const ancestors = {
      project: {
        name: 'Enterprise Core',
        opsOwners: ['ops-enterprise'],
        businessAnalysts: ['ba-enterprise'],
      },
    };

    const opsResult = resolveInheritedTags('opsOwners', milestone, ancestors);
    expect(opsResult).toEqual({
      tags: ['ops-enterprise'],
      source: 'project',
      originName: 'Enterprise Core',
    });
  });

  it('explicit child tags completely replace ancestor tags without union (replacement semantics per D-07)', () => {
    const task = {
      opsOwners: ['ops-specific'],
      milestoneId: 'ms-1',
    };
    const ancestors = {
      milestone: {
        name: 'Parent MS',
        opsOwners: ['ops-general-1', 'ops-general-2'],
      },
      project: {
        name: 'Parent Proj',
        opsOwners: ['ops-root'],
      },
    };

    const result = resolveInheritedTags('opsOwners', task, ancestors);
    expect(result.tags).toEqual(['ops-specific']);
    expect(result.tags).not.toContain('ops-general-1');
    expect(result.tags).not.toContain('ops-general-2');
    expect(result.tags).not.toContain('ops-root');
    expect(result.source).toBe('direct');
    expect(result.originName).toBeUndefined();
  });
});
