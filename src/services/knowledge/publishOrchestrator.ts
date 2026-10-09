import type { TaskPlannerDatabase } from '../../db';
import { buildDlpAuditRecord } from '../dlp/dlpAudit';
import { scanOutboundUserText } from '../dlp/dlpScanner';
import type { DlpFinding } from '../../types/dlp';
import { generateId } from '../../utils/uuid';
import {
  buildChangePreview,
  sha256Text,
  type BuildChangePreviewInput,
  type ChangePreview,
  type FrozenPublishSnapshot,
} from './changePreview';
import type { KnowledgeClient } from './knowledgeClient';

interface Confirmation {
  nonce: string;
  attemptKey: string;
  bindingHash: string;
}

export interface PublishSessionOptions {
  client: KnowledgeClient;
  db: TaskPlannerDatabase;
}

export interface SubmitResult {
  attemptId?: string;
  status: 'Publishing';
  conflict?: boolean;
}

function snapshotBinding(snapshot: FrozenPublishSnapshot, attemptKey: string): string {
  return JSON.stringify({
    attemptKey,
    setId: snapshot.setId,
    setName: snapshot.setName,
    policy: snapshot.chunkingPolicyVersion,
    documents: snapshot.documents.map((document) => ({
      documentId: document.documentId,
      title: document.title,
      body: document.body,
      tags: [...document.tags],
      contentHash: document.contentHash,
      chunks: document.chunks.map((chunk) => ({
        occurrenceId: chunk.occurrenceId,
        chunkKey: chunk.chunkKey,
        contentHash: chunk.contentHash,
        headingPath: [...chunk.headingPath],
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      })),
    })),
  });
}

export class PublishSession {
  private preview: ChangePreview | null = null;
  private removalConfirmed = false;
  private findings: readonly DlpFinding[] | null = null;
  private confirmation: Confirmation | null = null;
  private acceptedAttemptId: string | null = null;
  private pollController: AbortController | null = null;

  constructor(private readonly options: PublishSessionOptions) {}

  async buildPreview(input: BuildChangePreviewInput): Promise<ChangePreview> {
    this.invalidate();
    this.preview = await buildChangePreview(input);
    return this.preview;
  }

  confirmRemoval(): void {
    if (!this.preview?.hasRemovals) return;
    this.removalConfirmed = true;
    this.findings = null;
    this.confirmation = null;
  }

  cancelRemoval(): void {
    this.removalConfirmed = false;
    this.findings = null;
    this.confirmation = null;
  }

  async scan(): Promise<readonly DlpFinding[]> {
    const preview = this.requirePreview();
    if (preview.hasRemovals && !this.removalConfirmed) {
      throw new Error('Publish removal requires current removal consent');
    }
    this.confirmation = null;
    this.findings = Object.freeze(
      scanOutboundUserText({
        setName: preview.snapshot.setName,
        documents: preview.snapshot.documents.map((document) => ({
          documentId: document.documentId,
          title: document.title,
          body: document.body,
          tags: [...document.tags],
        })),
      })
    );
    return this.findings;
  }

  async confirmFindings(overrideApproved: boolean): Promise<{ nonce: string }> {
    const preview = this.requirePreview();
    if (!this.findings) throw new Error('Publish requires a completed DLP scan');
    if (this.findings.length > 0 && !overrideApproved) {
      this.confirmation = null;
      throw new Error('Sensitive-data findings require explicit approval');
    }
    const attemptKey = generateId();
    const nonce = generateId();
    this.confirmation = {
      nonce,
      attemptKey,
      bindingHash: await sha256Text(snapshotBinding(preview.snapshot, attemptKey)),
    };
    return { nonce };
  }

  async submitConfirmedAttempt(nonce: string): Promise<SubmitResult> {
    const preview = this.requirePreview();
    const confirmation = this.confirmation;
    if (!confirmation || nonce !== confirmation.nonce || !this.findings) {
      throw new Error('Publish requires current confirmation');
    }
    const bindingHash = await sha256Text(
      snapshotBinding(preview.snapshot, confirmation.attemptKey)
    );
    if (bindingHash !== confirmation.bindingHash) {
      this.confirmation = null;
      throw new Error('Publish confirmation is stale');
    }
    this.confirmation = null;

    const audit = buildDlpAuditRecord({
      setId: preview.snapshot.setId,
      attemptId: confirmation.attemptKey,
      documentIds: preview.snapshot.documents.map((document) => document.documentId),
      contentHashes: preview.snapshot.documents.map((document) => document.contentHash),
      findingCategories: this.findings.map((finding) => finding.category),
      userAction: this.findings.length > 0 ? 'confirmed' : 'auto_passed',
    });
    await this.options.db.dlpAudits.add(audit);

    try {
      const resource = await this.options.client.createPublishAttempt(
        preview.snapshot,
        confirmation.attemptKey
      );
      this.acceptedAttemptId = resource.attemptId;
      return { attemptId: resource.attemptId, status: 'Publishing' };
    } catch (error: unknown) {
      const conflict = error as { code?: string; status?: number };
      if (conflict.code === 'SET_PUBLISH_IN_PROGRESS' || conflict.status === 409) {
        return { status: 'Publishing', conflict: true };
      }
      throw error;
    }
  }

  async pollAcceptedAttempt(attemptId?: string) {
    const targetAttemptId = attemptId ?? this.acceptedAttemptId;
    if (!targetAttemptId) throw new Error('No accepted publish attempt to poll');
    this.acceptedAttemptId = targetAttemptId;
    this.pollController = new AbortController();
    return this.options.client.pollAttempt(targetAttemptId, {
      signal: this.pollController.signal,
    });
  }

  closePreview(): void {
    this.preview = null;
    this.removalConfirmed = false;
    this.findings = null;
    this.confirmation = null;
    this.pollController?.abort();
  }

  private requirePreview(): ChangePreview {
    if (!this.preview) throw new Error('Publish requires exact preview first');
    return this.preview;
  }

  private invalidate(): void {
    this.preview = null;
    this.removalConfirmed = false;
    this.findings = null;
    this.confirmation = null;
    this.acceptedAttemptId = null;
    this.pollController?.abort();
    this.pollController = null;
  }
}
