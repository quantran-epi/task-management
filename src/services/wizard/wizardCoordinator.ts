import type { TaskPlannerDatabase } from '../../db';
import type { ChatMessage, Note } from '../../types/models';
import {
  assertWizardTransition,
  WizardSnapshotSchema,
  type WizardSkill,
  type WizardSnapshot,
  type WizardStatus,
} from '../ai/wizardSchemas';
import type { WizardEvidence, WizardEvidenceInput } from '../ai/wizardService';
import type { WizardGapResult } from '../ai/wizardPrompts';
import { generateId } from '../../utils/uuid';
import {
  ChangePackIdentitySchema,
  type ChangePackIdentity,
  type ChangePackManifest,
  validateChangePack,
} from './changePack';
import { reconcileSolutionWithPack, type ReconciliationResult } from './reconciliation';
import {
  loadCanonicalArtifactChain,
  persistConfirmedPack,
  type PersistedPackResult,
} from './artifactRepo';

export interface ChangePackConfirmation {
  packHash: string;
  identity: ChangePackIdentity;
}

export type ChangePackState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'invalid'; code: string }
  | { status: 'pending'; manifest: Readonly<ChangePackManifest> }
  | { status: 'confirmed'; manifest: Readonly<ChangePackManifest>; persisted: PersistedPackResult; reconciliation: ReconciliationResult };

export interface WizardPackTechnicalDocs {
  solution: { noteId: string; version: number; hash: string };
  packHash: string;
  coverageStatus: ReconciliationResult['status'];
  reconciliation: ReconciliationResult;
  pl03?: unknown;
  pl07?: unknown;
}

export interface WizardPackDeps {
  expectedPackIdentity?: () => ChangePackIdentity;
  validatePack?: (file: Blob, expectedIdentity: ChangePackIdentity) => Promise<Readonly<ChangePackManifest>>;
  persistPack?: (input: Parameters<typeof persistConfirmedPack>[0]) => Promise<PersistedPackResult>;
  loadCanonicalChain?: (projectId: string, threadId: string) => Promise<Note[]>;
  buildReconciliationInput?: (input: {
    manifest: Readonly<ChangePackManifest>;
    solution: Note;
    projectId: string;
    threadId: string;
  }) => unknown;
  reconcilePack?: (input: unknown) => ReconciliationResult;
  appendReviewSnapshot?: (input: WizardPackTechnicalDocs) => Promise<void>;
  runTechnicalStage?: (input: {
    kind: 'PL03' | 'PL07';
    projectId: string;
    threadId: string;
    sessionId: string;
    inputRevision: number;
    solution: { noteId: string; version: number; hash: string };
    packHash: string;
    reconciliation: ReconciliationResult;
  }) => Promise<unknown>;
}

export interface WizardCoordinatorDeps extends WizardPackDeps {
  projectId: string;
  threadId: string;
  db?: TaskPlannerDatabase;
  now?: () => string;
  createSessionId?: () => string;
  collectEvidence?: (input: WizardEvidenceInput) => Promise<WizardEvidence>;
  runStage?: (input: WizardStageInput) => Promise<unknown>;
  saveSnapshot?: (snapshot: WizardSnapshot) => Promise<void>;
  appendMessage?: (message: {
    role: 'assistant' | 'user';
    content: string;
    wizard: WizardSnapshot;
  }) => Promise<void>;
  loadMessages?: () => Promise<ChatMessage[]>;
  saveSolution?: (input: {
    projectId: string;
    threadId: string;
    sessionId: string;
    inputRevision: number;
    draftRevision: number;
    inputHash: string;
    markdown: string;
    exportPayload: unknown;
    approvedAt: string;
  }) => Promise<unknown>;
  hashText?: (text: string) => Promise<string>;
  resolveEvidenceInput?: (state: {
    skill: WizardSkill;
    metadata: WizardStartMetadata;
    inputRevision: number;
    context: string;
  }) => Promise<WizardEvidenceInput>;
}

export interface WizardStartMetadata {
  cr: string;
  featureName: string;
  requestingUnit: string;
  author: string;
  date: string;
}

export interface WizardGap {
  sectionId: string;
  fieldId: string;
  question: string;
  citationIds: string[];
  suggestions: string[];
}

export interface WizardRuntimeState {
  snapshot: WizardSnapshot;
  metadata: WizardStartMetadata;
  evidence: WizardEvidence;
  gaps: WizardGap[];
  answers: Record<string, string>;
  skippedFieldIds: string[];
  restored: boolean;
}

export interface WizardStageInput {
  kind: WizardSkill;
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  payload: unknown;
  evidence: WizardEvidence;
  knownFieldIds: readonly string[];
  skippedFieldIds: readonly string[];
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export type ActiveWizardSelector = WizardSnapshot & { restored?: boolean };

const EMPTY_EVIDENCE: WizardEvidence = { items: [], coverage: 'EMPTY_SCOPE', degraded: [] };

function defaultPayload(skill: WizardSkill, metadata: WizardStartMetadata): WizardSnapshot['renderPayload'] {
  return {
    title: `${skill} — ${metadata.featureName}`,
    markdown: `# ${skill} — ${metadata.featureName}\n\n- Mã dự án/CR: ${metadata.cr}\n- Đơn vị yêu cầu: ${metadata.requestingUnit || '(chưa cung cấp)'}\n- Người lập: ${metadata.author || '(chưa cung cấp)'}\n- Ngày lập: ${metadata.date}`,
  };
}

function renderStageResult(
  skill: WizardSkill,
  fallback: WizardSnapshot['renderPayload'],
  result: unknown,
): WizardSnapshot['renderPayload'] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return fallback;
  const proposal = result as Record<string, unknown>;
  const title = typeof proposal.title === 'string' && proposal.title.trim()
    ? proposal.title.trim()
    : fallback.title;
  const markdown = `# ${title}\n\n\`\`\`json\n${JSON.stringify(proposal, null, 2)}\n\`\`\``;
  if (skill === 'SOLUTION' && proposal.featureMode === 'existing') {
    const affectedSurfaces = [proposal.affectedScreens, proposal.affectedApis, proposal.affectedTables]
      .flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (typeof proposal.currentSystem !== 'string' || !proposal.currentSystem.trim() || affectedSurfaces.length === 0) {
      throw new Error('WIZARD_EXISTING_SOLUTION_DETAILS_REQUIRED');
    }
    return { title, featureMode: 'existing', currentSystem: proposal.currentSystem, affectedSurfaces, markdown };
  }
  if (skill === 'SOLUTION' && proposal.featureMode === 'new') return { title, featureMode: 'new', markdown };
  return { title, markdown };
}

function stepContent(snapshot: WizardSnapshot, gaps: readonly WizardGap[]): string {
  if (snapshot.status === 'collecting') return `Đã bắt đầu ${snapshot.skill} cho ${snapshot.renderPayload.title}.`;
  if (snapshot.status === 'gap_fill') {
    return gaps.map((gap) => `Cần làm rõ: ${gap.fieldId}\n${gap.question}`).join('\n\n');
  }
  if (snapshot.status === 'review') return `Bản nháp ${snapshot.skill} đã sẵn sàng để soát xét.`;
  if (snapshot.status === 'approved') return `Đã duyệt bản nháp ${snapshot.skill}.`;
  if (snapshot.status === 'completed') return `Đã lưu ${snapshot.skill}.`;
  return `Wizard ${snapshot.status}.`;
}

function messageSnapshot(message: ChatMessage | WizardSnapshot): WizardSnapshot | undefined {
  return 'role' in message ? message.wizard : message;
}

export function deriveActiveWizard(
  messages: readonly (ChatMessage | WizardSnapshot)[],
  projectId: string,
  threadId: string,
): ActiveWizardSelector | undefined {
  const candidates = messages
    .map(messageSnapshot)
    .filter((snapshot): snapshot is WizardSnapshot => Boolean(snapshot))
    .filter((snapshot) => snapshot.projectId === projectId && snapshot.threadId === threadId)
    .filter((snapshot) => snapshot.status !== 'completed')
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const latest = candidates.at(-1);
  if (!latest) return undefined;
  return { ...latest, restored: latest.status === 'abandoned' || latest.status === 'collecting' || latest.status === 'gap_fill' };
}

async function defaultHashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createWizardCoordinator(deps: WizardCoordinatorDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const createSessionId = deps.createSessionId ?? generateId;
  const hashText = deps.hashText ?? defaultHashText;
  let state: WizardRuntimeState | undefined;
  let disposed = false;
  let stageController: AbortController | undefined;
  let generation = 0;
  let approvalPromise: Promise<unknown> | undefined;
  let packState: ChangePackState = { status: 'idle' };
  let packFile: File | undefined;
  let packConfirmationPromise: Promise<unknown> | undefined;
  let confirmedPackResult: { persisted: PersistedPackResult; reconciliation: ReconciliationResult } | undefined;
  let technicalDocs: WizardPackTechnicalDocs | undefined;

  const packIdentity = () => ChangePackIdentitySchema.parse(deps.expectedPackIdentity?.() ?? {
    cr: state?.metadata.cr ?? '',
    base: '',
    head: '',
    branch: '',
  });

  const packSession = () => {
    if (!state) throw new Error('PACK_WIZARD_SESSION_REQUIRED');
    return state;
  };

  const findSolution = async (manifest: Readonly<ChangePackManifest>): Promise<{ note: Note; pin: WizardPackTechnicalDocs['solution'] }> => {
    const chain = deps.loadCanonicalChain
      ? await deps.loadCanonicalChain(deps.projectId, deps.threadId)
      : deps.db
        ? await loadCanonicalArtifactChain(deps.projectId, deps.threadId, deps.db)
        : [];
    const solution = chain
      .filter((note) => note.sdlcArtifact?.kind === 'SOLUTION')
      .sort((left, right) => (right.sdlcArtifact?.version ?? 0) - (left.sdlcArtifact?.version ?? 0))[0];
    if (!solution?.sdlcArtifact || solution.sdlcArtifact.kind !== 'SOLUTION') throw new Error('PACK_SOLUTION_REQUIRED');
    const pin = { noteId: solution.id, version: solution.sdlcArtifact.version, hash: solution.sdlcArtifact.inputHash };
    if (solution.sdlcArtifact.projectId !== deps.projectId || solution.sdlcArtifact.threadId !== deps.threadId) throw new Error('PACK_SOLUTION_MISMATCH');
    void manifest;
    return { note: solution, pin };
  };

  const reconcileConfirmedPack = async (manifest: Readonly<ChangePackManifest>, persisted: PersistedPackResult): Promise<WizardPackTechnicalDocs> => {
    const { note: solution, pin } = await findSolution(manifest);
    const input = deps.buildReconciliationInput
      ? deps.buildReconciliationInput({ manifest, solution, projectId: deps.projectId, threadId: deps.threadId })
      : { projectId: deps.projectId, threadId: deps.threadId, solutionNoteId: pin.noteId, solutionVersion: pin.version, solutionHash: pin.hash, packHash: manifest.packHash, cr: manifest.identity.cr, base: manifest.identity.base, head: manifest.identity.head, solution: JSON.parse(solution.body), pack: { packHash: manifest.packHash, identity: manifest.identity, entries: manifest.entries.map((entry) => ({ path: entry.path, status: entry.status, coverage: entry.coverage, hunks: [] })) }, evidence: [], proposedDrift: [] };
    const reconciliation = (deps.reconcilePack ?? reconcileSolutionWithPack)(input);
    const docs: WizardPackTechnicalDocs = { solution: pin, packHash: manifest.packHash, coverageStatus: reconciliation.status, reconciliation };
    technicalDocs = docs;
    void persisted;
    return docs;
  };

  const selectChangePack = async (file: File): Promise<ChangePackState> => {
    if (!state) throw new Error('PACK_WIZARD_SESSION_REQUIRED');
    packState = { status: 'validating' };
    packFile = file;
    try {
      const manifest = await (deps.validatePack ?? ((input, expected) => validateChangePack(input, expected)))(file, packIdentity());
      if (disposed) throw new Error('STALE_RESULT');
      packState = { status: 'pending', manifest };
      return packState;
    } catch (error) {
      packFile = undefined;
      const code = (error as { code?: unknown })?.code;
      packState = { status: 'invalid', code: typeof code === 'string' ? code : 'PACK_CORRUPT' };
      return packState;
    }
  };

  const replaceChangePack = (): void => {
    packFile = undefined;
    packConfirmationPromise = undefined;
    confirmedPackResult = undefined;
    technicalDocs = undefined;
    packState = { status: 'idle' };
  };

  const confirmChangePack = async (confirmation: ChangePackConfirmation) => {
    if (confirmedPackResult && packState.status === 'confirmed') return confirmedPackResult;
    if (packConfirmationPromise) return packConfirmationPromise;
    if (packState.status !== 'pending' || !packFile) throw new Error('PACK_CONFIRMATION_REQUIRED');
    const manifest = packState.manifest;
    const expected = ChangePackIdentitySchema.parse(confirmation.identity);
    if (confirmation.packHash !== manifest.packHash || JSON.stringify(expected) !== JSON.stringify(manifest.identity)) throw new Error('PACK_CONFIRMATION_MISMATCH');
    const current = packSession();
    packConfirmationPromise = (async () => {
      const { pin } = await findSolution(manifest);
      const input = { projectId: deps.projectId, threadId: deps.threadId, sessionId: current.snapshot.sessionId, inputRevision: current.snapshot.inputRevision, draftRevision: current.snapshot.draftRevision ?? 1, idempotencyKey: `${current.snapshot.sessionId}:${current.snapshot.draftRevision ?? 1}:PACK:${manifest.packHash}`, manifest, confirmation: expected, solution: pin, confirmedAt: now() };
      const persisted = await (deps.persistPack ?? ((value) => persistConfirmedPack(value, deps.db)))(input);
      const reconciliation = await reconcileConfirmedPack(manifest, persisted);
      await deps.appendReviewSnapshot?.(reconciliation);
      packState = { status: 'confirmed', manifest, persisted, reconciliation: reconciliation.reconciliation };
      confirmedPackResult = { persisted, reconciliation: reconciliation.reconciliation };
      packFile = undefined;
      return confirmedPackResult;
    })().finally(() => { packConfirmationPromise = undefined; });
    return packConfirmationPromise;
  };

  const generateTechnicalDocs = async (): Promise<WizardPackTechnicalDocs> => {
    if (packState.status !== 'confirmed' || !technicalDocs) throw new Error('PACK_RECONCILIATION_REQUIRED');
    if (!deps.runTechnicalStage) return technicalDocs;
    const current = packSession();
    const input = { projectId: deps.projectId, threadId: deps.threadId, sessionId: current.snapshot.sessionId, inputRevision: current.snapshot.inputRevision, solution: technicalDocs.solution, packHash: technicalDocs.packHash, reconciliation: technicalDocs.reconciliation };
    const [pl03, pl07] = await Promise.all([
      deps.runTechnicalStage({ ...input, kind: 'PL03' }),
      deps.runTechnicalStage({ ...input, kind: 'PL07' }),
    ]);
    const docs = { ...technicalDocs, pl03, pl07 };
    technicalDocs = docs;
    await deps.appendReviewSnapshot?.(docs);
    return docs;
  };

  const isCurrent = (sessionId: string, revision: number, controller: AbortController) =>
    !disposed && !controller.signal.aborted && generation > 0 && state?.snapshot.sessionId === sessionId && state.snapshot.inputRevision === revision;

  const persist = async (snapshot: WizardSnapshot, content?: string) => {
    if (deps.saveSnapshot) await deps.saveSnapshot(snapshot);
    if (content !== undefined && deps.appendMessage) {
      await deps.appendMessage({ role: 'assistant', content, wizard: snapshot });
    }
  };

  const transition = async (status: WizardStatus, patch: Partial<WizardSnapshot> = {}, content?: string) => {
    if (!state) throw new Error('WIZARD_NOT_STARTED');
    const next = WizardSnapshotSchema.parse({ ...state.snapshot, ...patch, status, updatedAt: now() });
    assertWizardTransition(state.snapshot, next);
    state = { ...state, snapshot: next };
    await persist(next, content ?? stepContent(next, state.gaps));
    return next;
  };

  const runStage = async (context: string) => {
    if (!state || !deps.runStage) return;
    stageController?.abort();
    const controller = new AbortController();
    stageController = controller;
    const snapshot = state.snapshot;
    const revision = snapshot.inputRevision;
    const sessionId = snapshot.sessionId;
    const evidenceInput = deps.resolveEvidenceInput
      ? await deps.resolveEvidenceInput({ skill: snapshot.skill, metadata: state.metadata, inputRevision: revision, context })
      : {
          projectId: deps.projectId,
          threadId: deps.threadId,
          sessionId,
          inputRevision: revision,
          query: `${state.metadata.cr} ${state.metadata.featureName} ${context}`.trim(),
          resolvedSetIds: [],
          signal: controller.signal,
        };
    if (!isCurrent(sessionId, revision, controller)) return;
    const evidence = deps.collectEvidence ? await deps.collectEvidence({ ...evidenceInput, signal: controller.signal }) : EMPTY_EVIDENCE;
    if (!isCurrent(sessionId, revision, controller)) return;
    state = { ...state, evidence };
    const result = await deps.runStage({
      kind: snapshot.skill,
      projectId: deps.projectId,
      threadId: deps.threadId,
      sessionId,
      inputRevision: revision,
      payload: snapshot.renderPayload,
      evidence,
      knownFieldIds: Object.keys(state.answers),
      skippedFieldIds: state.skippedFieldIds,
      signal: controller.signal,
      isCurrent: () => isCurrent(sessionId, revision, controller),
    });
    if (!isCurrent(sessionId, revision, controller)) return;
    const gaps = (result as Partial<WizardGapResult>).gaps ?? [];
    state = { ...state, gaps: gaps as WizardGap[] };
    if (gaps.length > 0) {
      await transition('gap_fill', {}, stepContent({ ...snapshot, status: 'gap_fill' }, gaps as WizardGap[]));
      return;
    }
    const draftRevision = Math.max(1, snapshot.draftRevision ?? 1);
    const reviewPayload = renderStageResult(snapshot.skill, snapshot.renderPayload, result);
    if (snapshot.status === 'collecting') {
      await transition('gap_fill', {}, `Đã thu thập đủ dữ liệu cho ${snapshot.skill}.`);
    }
    await transition('review', { draftRevision, renderPayload: reviewPayload }, `Bản nháp ${snapshot.skill} đã sẵn sàng để soát xét.`);
  };

  const start = async (skill: WizardSkill, metadata: WizardStartMetadata): Promise<WizardSnapshot> => {
    if (deps.projectId === '' || deps.threadId === '') throw new Error('WIZARD_PROJECT_THREAD_REQUIRED');
    if (state && !['completed', 'abandoned'].includes(state.snapshot.status)) throw new Error('WIZARD_SESSION_ACTIVE');
    stageController?.abort();
    generation += 1;
    const sessionId = createSessionId();
    const timestamp = now();
    const snapshot = WizardSnapshotSchema.parse({
      schemaVersion: 1,
      sessionId,
      projectId: deps.projectId,
      threadId: deps.threadId,
      skill,
      status: 'collecting',
      inputRevision: 0,
      draftRevision: null,
      approvedAt: null,
      artifactId: null,
      artifactHash: null,
      renderPayload: defaultPayload(skill, metadata),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    state = { snapshot, metadata, evidence: EMPTY_EVIDENCE, gaps: [], answers: {}, skippedFieldIds: [], restored: false };
    await persist(snapshot, stepContent(snapshot, []));
    await runStage('');
    return state?.snapshot ?? snapshot;
  };

  const answerGap = async (fieldId: string, answer: string) => {
    if (!state || state.snapshot.status !== 'gap_fill') return;
    const value = answer.trim();
    if (!value) return;
    state = { ...state, answers: { ...state.answers, [fieldId]: value }, gaps: state.gaps.filter((gap) => gap.fieldId !== fieldId) };
    await addContext(`${fieldId}: ${value}`);
  };

  const skipGap = async (fieldId: string) => {
    if (!state || state.snapshot.status !== 'gap_fill') return;
    if (!state.skippedFieldIds.includes(fieldId)) state = { ...state, skippedFieldIds: [...state.skippedFieldIds, fieldId], gaps: state.gaps.filter((gap) => gap.fieldId !== fieldId) };
    await addContext(`Bỏ qua mục ${fieldId}`);
  };

  const addContext = async (context: string) => {
    if (!state) return;
    stageController?.abort();
    const snapshot = state.snapshot;
    const nextInputRevision = snapshot.inputRevision + 1;
    const next = WizardSnapshotSchema.parse({ ...snapshot, status: snapshot.status === 'review' || snapshot.status === 'approved' ? 'gap_fill' : snapshot.status, inputRevision: nextInputRevision, draftRevision: null, approvedAt: null, artifactId: null, artifactHash: null, updatedAt: now() });
    if (next.status !== snapshot.status) assertWizardTransition(snapshot, next);
    state = { ...state, snapshot: next, restored: false };
    generation += 1;
    await persist(next, `Đã bổ sung ngữ cảnh: ${context}`);
    await runStage(context);
  };

  const requestEdit = async (context = '') => addContext(context);

  const approveSolution = async () => {
    if (approvalPromise) return approvalPromise;
    if (!state || state.snapshot.skill !== 'SOLUTION' || state.snapshot.status !== 'review' || !deps.saveSolution) return;
    const localState = state;
    approvalPromise = (async () => {
      const markdown = 'markdown' in localState.snapshot.renderPayload && localState.snapshot.renderPayload.markdown
        ? localState.snapshot.renderPayload.markdown
        : `# ${localState.metadata.featureName}\n\n${localState.metadata.cr}`;
      const inputHash = await hashText(markdown);
      if (disposed || state?.snapshot.sessionId !== localState.snapshot.sessionId || state.snapshot.inputRevision !== localState.snapshot.inputRevision) return;
      const approvedAt = now();
      const saveSolution = deps.saveSolution;
      if (!saveSolution) return;
      await transition('approved', { draftRevision: localState.snapshot.draftRevision ?? 1, artifactHash: inputHash, approvedAt, renderPayload: { ...localState.snapshot.renderPayload, markdown } });
      if (disposed || state?.snapshot.sessionId !== localState.snapshot.sessionId) return;
      return saveSolution({ projectId: deps.projectId, threadId: deps.threadId, sessionId: localState.snapshot.sessionId, inputRevision: localState.snapshot.inputRevision, draftRevision: localState.snapshot.draftRevision ?? 1, inputHash, markdown, exportPayload: localState.snapshot.renderPayload, approvedAt });
    })().finally(() => { approvalPromise = undefined; });
    return approvalPromise;
  };

  const cancel = async () => {
    generation += 1;
    stageController?.abort();
    if (!state || state.snapshot.status === 'completed' || state.snapshot.status === 'abandoned') return;
    await transition('abandoned');
  };

  const restore = async () => {
    if (!deps.loadMessages) return state?.snapshot;
    const messages = await deps.loadMessages();
    const active = deriveActiveWizard(messages, deps.projectId, deps.threadId);
    if (!active) return undefined;
    const metadata = { cr: active.renderPayload.title, featureName: active.renderPayload.title, requestingUnit: '', author: '', date: active.createdAt.slice(0, 10) };
    state = { snapshot: active, metadata, evidence: EMPTY_EVIDENCE, gaps: [], answers: {}, skippedFieldIds: [], restored: true };
    generation += 1;
    return active;
  };

  const dispose = () => { disposed = true; generation += 1; stageController?.abort(); stageController = undefined; packFile = undefined; };

  return {
    start,
    answerGap,
    skipGap,
    addContext,
    requestEdit,
    approveSolution,
    cancel,
    restore,
    dispose,
    selectChangePack,
    replaceChangePack,
    confirmChangePack,
    generateTechnicalDocs,
    getState: () => state,
    getSnapshot: () => state?.snapshot,
    getPackState: () => packState,
  };
}
