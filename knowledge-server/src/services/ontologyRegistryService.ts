import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ONTOLOGY_VERSION, staticOntologyDefinitions } from '../graph/ontology.js';
import {
  OntologyRelationDefinitionSchema,
  RelationProposalSchema,
  RuntimeRelationNameSchema,
  type NodeKind,
  type OntologyRelationDefinition,
  type RelationProposal,
} from '../types/graphProtocol.js';

interface RegistryState {
  version: number;
  updatedAt: string;
  accepted: OntologyRelationDefinition[];
  proposals: RelationProposal[];
}

export interface ProposedRelationInput {
  relationType: string;
  sourceEntityName: string;
  sourceKind: NodeKind;
  targetEntityName: string;
  targetKind: NodeKind;
  evidenceQuote: string;
  setId: string;
  sourceSnapshotId: string;
  documentId: string;
  documentTitle: string;
  chunkId: string;
}

export interface ProposalTarget {
  setId: string;
  sourceSnapshotId: string;
  chunkIds: string[];
}

export class OntologyRegistryService {
  readonly filePath: string;
  private state?: RegistryState;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = process.env.ONTOLOGY_REGISTRY_PATH || './data/ontology-registry.json') {
    this.filePath = filePath;
  }

  private emptyState(): RegistryState {
    return { version: 1, updatedAt: new Date().toISOString(), accepted: [], proposals: [] };
  }

  private async load(): Promise<RegistryState> {
    if (this.state) return this.state;
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as RegistryState;
      this.state = {
        version: Number.isInteger(parsed.version) && parsed.version > 0 ? parsed.version : 1,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        accepted: (parsed.accepted ?? []).map((item) => OntologyRelationDefinitionSchema.parse(item)),
        proposals: (parsed.proposals ?? []).map((item) => RelationProposalSchema.parse(item)),
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.state = this.emptyState();
    }
    return this.state;
  }

  private async persist(): Promise<void> {
    const state = await this.load();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temp, this.filePath);
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(work, work);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async getEffectiveOntology(): Promise<{ ontologyVersion: string; registryVersion: number; relations: OntologyRelationDefinition[] }> {
    const state = await this.load();
    const relationMap = new Map<string, OntologyRelationDefinition>();

    // 1. Load static definitions
    for (const def of staticOntologyDefinitions()) {
      relationMap.set(def.relationType, {
        ...def,
        allowedSourceKinds: [...def.allowedSourceKinds],
        allowedTargetKinds: [...def.allowedTargetKinds],
      });
    }

    // 2. Merge accepted runtime proposals/definitions
    for (const def of state.accepted) {
      const existing = relationMap.get(def.relationType);
      if (existing) {
        // Union allowed source & target kinds
        existing.allowedSourceKinds = Array.from(
          new Set([...existing.allowedSourceKinds, ...def.allowedSourceKinds])
        );
        existing.allowedTargetKinds = Array.from(
          new Set([...existing.allowedTargetKinds, ...def.allowedTargetKinds])
        );
        existing.runtime = true;
      } else {
        relationMap.set(def.relationType, {
          ...def,
          allowedSourceKinds: [...def.allowedSourceKinds],
          allowedTargetKinds: [...def.allowedTargetKinds],
        });
      }
    }

    return {
      ontologyVersion: ONTOLOGY_VERSION,
      registryVersion: state.version,
      relations: Array.from(relationMap.values()),
    };
  }

  async findRelation(relationType: string): Promise<OntologyRelationDefinition | undefined> {
    const normalized = RuntimeRelationNameSchema.parse(relationType.trim().toUpperCase());
    const effective = await this.getEffectiveOntology();
    return effective.relations.find((relation) => relation.relationType === normalized);
  }

  async listProposals(setId?: string): Promise<RelationProposal[]> {
    const state = await this.load();
    return state.proposals.filter((proposal) => !setId || proposal.setId === setId).map((proposal) => ({ ...proposal, chunkIds: [...proposal.chunkIds] }));
  }

  async recordProposal(input: ProposedRelationInput): Promise<RelationProposal> {
    return this.serialize(async () => {
      const state = await this.load();
      const relationType = RuntimeRelationNameSchema.parse(input.relationType.trim().toUpperCase());
      const existing = state.proposals.find(
        (proposal) =>
          proposal.status === 'PENDING' &&
          proposal.relationType === relationType &&
          proposal.sourceKind === input.sourceKind &&
          proposal.targetKind === input.targetKind &&
          proposal.setId === input.setId &&
          proposal.sourceSnapshotId === input.sourceSnapshotId &&
          proposal.documentId === input.documentId &&
          proposal.sourceEntityName === input.sourceEntityName &&
          proposal.targetEntityName === input.targetEntityName
      );
      const now = new Date().toISOString();
      if (existing) {
        if (!existing.chunkIds.includes(input.chunkId)) existing.chunkIds.push(input.chunkId);
        existing.updatedAt = now;
        await this.persist();
        return { ...existing, chunkIds: [...existing.chunkIds] };
      }
      const proposal = RelationProposalSchema.parse({
        proposalId: randomUUID(),
        relationType,
        sourceEntityName: input.sourceEntityName,
        sourceKind: input.sourceKind,
        targetEntityName: input.targetEntityName,
        targetKind: input.targetKind,
        evidenceQuote: input.evidenceQuote,
        setId: input.setId,
        sourceSnapshotId: input.sourceSnapshotId,
        documentId: input.documentId,
        documentTitle: input.documentTitle,
        chunkIds: [input.chunkId],
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
      state.proposals.push(proposal);
      await this.persist();
      return proposal;
    });
  }

  async acceptProposal(proposalId: string): Promise<{ proposal: RelationProposal; affected: ProposalTarget }> {
    return this.serialize(async () => {
      const state = await this.load();
      const proposal = state.proposals.find((item) => item.proposalId === proposalId);
      if (!proposal) throw new Error('PROPOSAL_NOT_FOUND');
      if (proposal.status === 'REJECTED') throw new Error('PROPOSAL_ALREADY_REJECTED');

      let acceptedDef = state.accepted.find((item) => item.relationType === proposal.relationType);
      let changed = false;

      if (acceptedDef) {
        if (!acceptedDef.allowedSourceKinds.includes(proposal.sourceKind)) {
          acceptedDef.allowedSourceKinds.push(proposal.sourceKind);
          changed = true;
        }
        if (!acceptedDef.allowedTargetKinds.includes(proposal.targetKind)) {
          acceptedDef.allowedTargetKinds.push(proposal.targetKind);
          changed = true;
        }
      } else {
        const staticDef = staticOntologyDefinitions().find((item) => item.relationType === proposal.relationType);
        acceptedDef = {
          relationType: proposal.relationType,
          allowedSourceKinds: staticDef
            ? Array.from(new Set([...staticDef.allowedSourceKinds, proposal.sourceKind]))
            : [proposal.sourceKind],
          allowedTargetKinds: staticDef
            ? Array.from(new Set([...staticDef.allowedTargetKinds, proposal.targetKind]))
            : [proposal.targetKind],
          defaultDirection: staticDef ? staticDef.defaultDirection : 'OUTGOING',
          maxHops: staticDef ? staticDef.maxHops : 1,
          semanticSlot: staticDef ? staticDef.semanticSlot : 'ADDITIVE',
          runtime: true,
        };
        state.accepted.push(acceptedDef);
        changed = true;
      }

      if (changed) {
        state.version += 1;
      }
      proposal.status = 'ACCEPTED';
      proposal.error = undefined;
      proposal.updatedAt = new Date().toISOString();
      state.updatedAt = proposal.updatedAt;
      await this.persist();
      return {
        proposal: { ...proposal, chunkIds: [...proposal.chunkIds] },
        affected: {
          setId: proposal.setId,
          sourceSnapshotId: proposal.sourceSnapshotId,
          chunkIds: [...proposal.chunkIds],
        },
      };
    });
  }

  async rejectProposal(proposalId: string): Promise<RelationProposal> {
    return this.serialize(async () => {
      const state = await this.load();
      const proposal = state.proposals.find((item) => item.proposalId === proposalId);
      if (!proposal) throw new Error('PROPOSAL_NOT_FOUND');
      if (proposal.status === 'ACCEPTED' || proposal.status === 'APPLYING' || proposal.status === 'APPLIED') {
        throw new Error('PROPOSAL_ALREADY_ACCEPTED');
      }
      proposal.status = 'REJECTED';
      proposal.error = undefined;
      proposal.updatedAt = new Date().toISOString();
      state.updatedAt = proposal.updatedAt;
      await this.persist();
      return { ...proposal, chunkIds: [...proposal.chunkIds] };
    });
  }

  async markApplication(proposalId: string, status: 'APPLYING' | 'APPLIED' | 'RETRYABLE', error?: string): Promise<void> {
    await this.serialize(async () => {
      const state = await this.load();
      const proposal = state.proposals.find((item) => item.proposalId === proposalId);
      if (!proposal) throw new Error('PROPOSAL_NOT_FOUND');
      proposal.status = status;
      proposal.error = error?.slice(0, 400);
      proposal.updatedAt = new Date().toISOString();
      state.updatedAt = proposal.updatedAt;
      await this.persist();
    });
  }
}
