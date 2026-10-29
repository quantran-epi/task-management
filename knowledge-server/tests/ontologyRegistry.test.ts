import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { OntologyRegistryService } from '../src/services/ontologyRegistryService.js';

const created: string[] = [];
afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('OntologyRegistryService', () => {
  it('persists accepted server-wide runtime relation and affected chunks atomically', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ontology-registry-'));
    created.push(dir);
    const file = path.join(dir, 'registry.json');
    const registry = new OntologyRegistryService(file);
    const input = {
      relationType: 'publishes_api',
      sourceEntityName: 'BillingService',
      sourceKind: 'SoftwareComponent' as const,
      targetEntityName: 'Payments API',
      targetKind: 'SoftwareComponent' as const,
      evidenceQuote: 'BillingService publishes Payments API',
      setId: '11111111-1111-4111-8111-111111111111',
      sourceSnapshotId: '22222222-2222-4222-8222-222222222222',
      documentId: '33333333-3333-4333-8333-333333333333',
      documentTitle: 'Architecture',
      chunkId: '33333333-3333-4333-8333-333333333333:0',
    };
    const proposal = await registry.recordProposal(input);
    await registry.recordProposal({ ...input, chunkId: '33333333-3333-4333-8333-333333333333:1' });

    const accepted = await registry.acceptProposal(proposal.proposalId);
    expect(accepted.affected.chunkIds).toEqual([
      '33333333-3333-4333-8333-333333333333:0',
      '33333333-3333-4333-8333-333333333333:1',
    ]);

    const restarted = new OntologyRegistryService(file);
    const effective = await restarted.getEffectiveOntology();
    expect(effective.relations).toContainEqual(expect.objectContaining({
      relationType: 'PUBLISHES_API',
      runtime: true,
      allowedSourceKinds: ['SoftwareComponent'],
      allowedTargetKinds: ['SoftwareComponent'],
    }));
    expect((await restarted.listProposals())[0]?.status).toBe('ACCEPTED');
  });
});
