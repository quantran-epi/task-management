import type { ProjectionSnapshot } from './incrementalProjector.js';

export type CandidateState = 'Building' | 'Ready' | 'Failed' | 'Active';

export interface SnapshotCandidate {
  candidateId: string;
  attemptId: string;
  setId: string;
  state: CandidateState;
  snapshot?: ProjectionSnapshot | undefined;
  error?: Readonly<{
    code: string;
    message: string;
    documentId?: string | undefined;
    blockType?: string | undefined;
    line?: number | undefined;
    column?: number | undefined;
    limit?: number | undefined;
    remedy?: string | undefined;
  }> | undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class SnapshotStore {
  readonly #candidates = new Map<string, SnapshotCandidate>();
  readonly #candidateIdsBySet = new Map<string, string[]>();
  readonly #activeBySet = new Map<string, ProjectionSnapshot>();

  createCandidate(candidateId: string, attemptId: string, setId: string): SnapshotCandidate {
    const candidate: SnapshotCandidate = { candidateId, attemptId, setId, state: 'Building' };
    this.#candidates.set(candidateId, candidate);
    const candidateIds = this.#candidateIdsBySet.get(setId);
    if (candidateIds) candidateIds.push(candidateId);
    else this.#candidateIdsBySet.set(setId, [candidateId]);
    return clone(candidate);
  }

  completeCandidate(candidateId: string, snapshot: ProjectionSnapshot): SnapshotCandidate {
    const candidate = this.#requireCandidate(candidateId);
    candidate.state = 'Ready';
    candidate.snapshot = clone(snapshot);
    return clone(candidate);
  }

  failCandidate(candidateId: string, error: SnapshotCandidate['error']): SnapshotCandidate {
    const candidate = this.#requireCandidate(candidateId);
    candidate.state = 'Failed';
    candidate.error = error ? clone(error) : undefined;
    return clone(candidate);
  }

  promoteCandidate(candidateId: string): ProjectionSnapshot {
    const candidate = this.#requireCandidate(candidateId);
    if (candidate.state !== 'Ready' || !candidate.snapshot) {
      throw new Error('Only a complete candidate can be promoted');
    }
    const active = clone(candidate.snapshot);
    this.#activeBySet.set(candidate.setId, active);
    candidate.state = 'Active';
    return clone(active);
  }

  getActiveSnapshot(setId: string): ProjectionSnapshot | null {
    const snapshot = this.#activeBySet.get(setId);
    return snapshot ? clone(snapshot) : null;
  }

  listCandidates(setId: string): SnapshotCandidate[] {
    return (this.#candidateIdsBySet.get(setId) ?? []).map((id) => clone(this.#requireCandidate(id)));
  }

  #requireCandidate(candidateId: string): SnapshotCandidate {
    const candidate = this.#candidates.get(candidateId);
    if (!candidate) throw new Error(`Unknown candidate: ${candidateId}`);
    return candidate;
  }
}
