import fs from 'node:fs';
import path from 'node:path';
import type { ProjectionSnapshot } from './incrementalProjector.js';
import type { GraphApprovalRecord } from '../types/graphProtocol.js';

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

export interface SnapshotStoreOptions {
  storageDir?: string | undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export class SnapshotStore {
  readonly #candidates = new Map<string, SnapshotCandidate>();
  readonly #candidateIdsBySet = new Map<string, string[]>();
  readonly #activeBySet = new Map<string, ProjectionSnapshot>();
  readonly #approvalsBySet = new Map<string, Map<string, GraphApprovalRecord>>();
  readonly #storageDir?: string | undefined;

  constructor(options: SnapshotStoreOptions = {}) {
    this.#storageDir = options.storageDir;
    if (this.#storageDir) {
      this.#loadPersistedState();
    }
  }

  #loadPersistedState(): void {
    if (!this.#storageDir || !fs.existsSync(this.#storageDir)) return;

    // Load active snapshots
    const snapshotsDir = path.join(this.#storageDir, 'snapshots');
    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(snapshotsDir, file), 'utf-8');
            const snapshot = JSON.parse(content) as ProjectionSnapshot;
            if (snapshot && snapshot.setId) {
              this.#activeBySet.set(snapshot.setId, snapshot);
            }
          } catch {
            // Ignore corrupted or partial snapshot on load
          }
        }
      }
    }

    // Load approval ledger
    const approvalsDir = path.join(this.#storageDir, 'approvals');
    if (fs.existsSync(approvalsDir)) {
      const files = fs.readdirSync(approvalsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const setId = file.replace(/\.json$/, '');
            const content = fs.readFileSync(path.join(approvalsDir, file), 'utf-8');
            const records = JSON.parse(content) as GraphApprovalRecord[];
            if (Array.isArray(records)) {
              const map = new Map<string, GraphApprovalRecord>();
              for (const record of records) {
                map.set(record.factKey, record);
              }
              this.#approvalsBySet.set(setId, map);
            }
          } catch {
            // Ignore invalid approval file
          }
        }
      }
    }
  }

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

    if (this.#storageDir) {
      const filePath = path.join(this.#storageDir, 'snapshots', `${candidate.setId}.json`);
      atomicWriteJson(filePath, active);
    }

    return clone(active);
  }

  getActiveSnapshot(setId: string): ProjectionSnapshot | null {
    const snapshot = this.#activeBySet.get(setId);
    return snapshot ? clone(snapshot) : null;
  }

  listCandidates(setId: string): SnapshotCandidate[] {
    return (this.#candidateIdsBySet.get(setId) ?? []).map((id) => clone(this.#requireCandidate(id)));
  }

  recordApproval(setId: string, approval: GraphApprovalRecord): void {
    let map = this.#approvalsBySet.get(setId);
    if (!map) {
      map = new Map();
      this.#approvalsBySet.set(setId, map);
    }
    map.set(approval.factKey, clone(approval));

    if (this.#storageDir) {
      const filePath = path.join(this.#storageDir, 'approvals', `${setId}.json`);
      atomicWriteJson(filePath, Array.from(map.values()));
    }
  }

  getApprovals(setId: string): GraphApprovalRecord[] {
    const map = this.#approvalsBySet.get(setId);
    if (!map) return [];
    return Array.from(map.values()).map(clone);
  }

  #requireCandidate(candidateId: string): SnapshotCandidate {
    const candidate = this.#candidates.get(candidateId);
    if (!candidate) throw new Error(`Unknown candidate: ${candidateId}`);
    return candidate;
  }
}
