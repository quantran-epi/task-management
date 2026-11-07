// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveInheritedTags } from '../../src/domain/inheritance';

describe('CR-level tag inheritance resolution (SHB-02, D-06, D-07)', () => {
  it('returns direct tags when the task has explicit tags (source: direct)', () => {
    const task = {
      opsOwners: ['ops-direct-1', 'ops-direct-2'],
      businessAnalysts: ['ba-direct'],
      crId: 'cr-1',
    };
    const ancestors = {
      cr: {
        name: 'CR Alpha',
        opsOwners: ['ops-cr'],
        businessAnalysts: ['ba-cr'],
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

  it('inherits from the CR when task tags are undefined or empty (source: cr)', () => {
    const taskUndefined = { crId: 'cr-1' };
    const taskEmpty = {
      opsOwners: [],
      businessAnalysts: [],
      crId: 'cr-1',
    };
    const ancestors = {
      cr: {
        name: 'CR Titan',
        opsOwners: ['ops-titan'],
        businessAnalysts: ['ba-titan'],
      },
    };

    const opsUndefined = resolveInheritedTags('opsOwners', taskUndefined, ancestors);
    expect(opsUndefined).toEqual({
      tags: ['ops-titan'],
      source: 'cr',
      originName: 'CR Titan',
    });

    const baEmpty = resolveInheritedTags('businessAnalysts', taskEmpty, ancestors);
    expect(baEmpty).toEqual({
      tags: ['ba-titan'],
      source: 'cr',
      originName: 'CR Titan',
    });
  });

  it('returns source: none and an empty array when the CR has no tags or no ancestor is given', () => {
    const standaloneTask = { crId: 'cr-1' };
    const ancestorsEmpty = {};

    const opsResult = resolveInheritedTags('opsOwners', standaloneTask, ancestorsEmpty);
    expect(opsResult).toEqual({
      tags: [],
      source: 'none',
    });

    const emptyAncestors = { cr: { name: 'CR-1' } };
    const baResult = resolveInheritedTags('businessAnalysts', standaloneTask, emptyAncestors);
    expect(baResult).toEqual({
      tags: [],
      source: 'none',
    });
  });

  it('explicit child tags completely replace ancestor tags without union (replacement semantics per D-07)', () => {
    const task = {
      opsOwners: ['ops-specific'],
      crId: 'cr-1',
    };
    const ancestors = {
      cr: {
        name: 'Parent CR',
        opsOwners: ['ops-general-1', 'ops-general-2'],
      },
    };

    const result = resolveInheritedTags('opsOwners', task, ancestors);
    expect(result.tags).toEqual(['ops-specific']);
    expect(result.tags).not.toContain('ops-general-1');
    expect(result.tags).not.toContain('ops-general-2');
    expect(result.source).toBe('direct');
    expect(result.originName).toBeUndefined();
  });

  it('never reports a milestone or project source — the CR is the only ancestor tier', () => {
    const result = resolveInheritedTags('opsOwners', {}, {
      cr: { name: 'CR One', opsOwners: ['ops-cr'] },
    });
    expect(result.source).toBe('cr');
    expect(['direct', 'cr', 'none']).toContain(result.source);
  });
});
