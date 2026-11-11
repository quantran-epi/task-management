import Dexie, { type Table } from 'dexie';
import {
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  SCHEMA_V7,
  SCHEMA_V8,
  SCHEMA_V9,
  SCHEMA_V10,
  SCHEMA_V11,
  SCHEMA_V12,
  SCHEMA_V13,
  SCHEMA_V14,
  SCHEMA_V15,
  SCHEMA_V16,
  SCHEMA_V17,
  SCHEMA_V18,
  SCHEMA_V19,
  SCHEMA_V20,
  SCHEMA_V21,
  SCHEMA_V22,
} from './schema';
import type {
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  Setting,
  BackupMetadata,
  WorkSession,
  ActiveTimer,
  Note,
  NoteAttachment,
  ChatThread,
  ChatMessage,
  ChatTab,
  DocumentSet,
  PublishedDocumentMetadata,
  PublishAttemptCache,
  DlpAuditRecord,
  KnowledgeLink,
  TelegramSettingsRecord,
  TelegramWhitelistUser,
  TelegramSessionLog,
  System,
  ChangeRequest,
} from '../types/models';
import type {
  AiEmployee,
  AiLead,
  AiSkill,
  AiTeam,
  AiTeamMember,
  AiTeamLink,
  AiSkillVersion,
  AiTeamBatch,
  AiTeamAssignment,
} from '../types/aiOffice';

/**
 * Stable id of the recovery CR that parks tasks whose legacy project no longer resolves.
 * A real v4 UUID so the parked rows still satisfy the backup schema's `crId` check.
 */
const LEGACY_UNASSIGNED_CR_ID = '00000000-0000-4000-8000-000000000001';

export class TaskPlannerDatabase extends Dexie {
  tasks!: Table<Task, string>;
  capacityRules!: Table<CapacityRule, string>;
  capacityOverrides!: Table<CapacityOverride, string>;
  plannedAllocations!: Table<PlannedAllocation, string>;
  settings!: Table<Setting, string>;
  backupMetadata!: Table<BackupMetadata, string>;
  workSessions!: Table<WorkSession, string>;
  activeTimers!: Table<ActiveTimer, string>;
  notes!: Table<Note, string>;
  noteAttachments!: Table<NoteAttachment, string>;
  chatThreads!: Table<ChatThread, string>;
  chatMessages!: Table<ChatMessage, string>;
  chatTabs!: Table<ChatTab, string>;
  documentSets!: Table<DocumentSet, string>;
  publishedDocuments!: Table<PublishedDocumentMetadata, [string, string]>;
  publishAttempts!: Table<PublishAttemptCache, string>;
  dlpAudits!: Table<DlpAuditRecord, string>;
  knowledgeLinks!: Table<KnowledgeLink, string>;
  telegramSettings!: Table<TelegramSettingsRecord, string>;
  telegramWhitelist!: Table<TelegramWhitelistUser, string>;
  telegramSessionLogs!: Table<TelegramSessionLog, string>;
  systems!: Table<System, string>;
  changeRequests!: Table<ChangeRequest, string>;
  aiEmployees!: Table<AiEmployee, string>;
  aiLeads!: Table<AiLead, string>;
  aiSkills!: Table<AiSkill, string>;
  aiTeams!: Table<AiTeam, string>;
  aiTeamMembers!: Table<AiTeamMember, string>;
  aiTeamLinks!: Table<AiTeamLink, string>;
  aiSkillVersions!: Table<AiSkillVersion, string>;
  aiTeamBatches!: Table<AiTeamBatch, string>;
  aiTeamAssignments!: Table<AiTeamAssignment, string>;


  constructor(databaseName = 'PersonalTaskPlannerDB') {
    super(databaseName);

    this.version(1).stores(SCHEMA_V1);

    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        await tx
          .table('projects')
          .toCollection()
          .modify((proj: Record<string, unknown>) => {
            if (!proj.opsOwners) proj.opsOwners = [];
            if (!proj.businessAnalysts) proj.businessAnalysts = [];
          });

        await tx
          .table('milestones')
          .toCollection()
          .modify((ms: Record<string, unknown>) => {
            if (!ms.opsOwners) ms.opsOwners = [];
            if (!ms.businessAnalysts) ms.businessAnalysts = [];
          });

        await tx
          .table('tasks')
          .toCollection()
          .modify((task: Record<string, unknown>) => {
            if (!task.opsOwners) task.opsOwners = [];
            if (!task.businessAnalysts) task.businessAnalysts = [];
            if (!task.workType) task.workType = 'code';
          });
      });

    this.version(3).stores(SCHEMA_V3);

    this.version(4).stores(SCHEMA_V4);

    this.version(5).stores(SCHEMA_V5);

    this.version(6)
      .stores(SCHEMA_V6)
      .upgrade(async (tx) => {
        const generateUuid = () =>
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

        const migrateReminders = (record: Record<string, unknown>) => {
          if (!Array.isArray(record.reminders)) {
            if (record.reminderDate && typeof record.reminderDate === 'string') {
              record.reminders = [
                {
                  id: generateUuid(),
                  date: record.reminderDate,
                  note: record.reminderNote ? String(record.reminderNote) : undefined,
                },
              ];
            } else {
              record.reminders = [];
            }
          }
        };

        await tx.table('projects').toCollection().modify(migrateReminders);
        await tx.table('milestones').toCollection().modify(migrateReminders);
        await tx.table('tasks').toCollection().modify(migrateReminders);
      });

    this.version(7)
      .stores(SCHEMA_V7)
      .upgrade(async (tx) => {
        // Migration: populate segments for existing activeTimers and workSessions (D-01)
        await tx
          .table('activeTimers')
          .toCollection()
          .modify((timer: Record<string, unknown>) => {
            if (!Array.isArray(timer.segments)) {
              timer.segments = timer.startedAt
                ? [{ startTime: new Date(Number(timer.startedAt)).toISOString() }]
                : [];
            }
          });

        await tx
          .table('workSessions')
          .toCollection()
          .modify((ws: Record<string, unknown>) => {
            if (!Array.isArray(ws.segments)) {
              ws.segments = [
                {
                  startTime: String(ws.startTime),
                  endTime: ws.endTime ? String(ws.endTime) : undefined,
                },
              ];
            }
          });
      });

    this.version(8).stores(SCHEMA_V8);

    this.version(9)
      .stores(SCHEMA_V9)
      .upgrade(async (tx) => {
        // Migration: populate default type and tags for existing notes (D-01, D-02)
        await tx
          .table('notes')
          .toCollection()
          .modify((note: Record<string, unknown>) => {
            if (!note.type) {
              note.type = 'quick_note';
            }
            if (!Array.isArray(note.tags)) {
              note.tags = [];
            }
          });
      });

    this.version(10).stores(SCHEMA_V10);

    this.version(11).stores(SCHEMA_V11);

    this.version(12).stores(SCHEMA_V12);

    this.version(13)
      .stores(SCHEMA_V13)
      .upgrade(async (tx) => {
        await tx
          .table('telegramSettings')
          .toCollection()
          .modify((settings: Record<string, unknown>) => {
            if (settings.maxHistoryTurns === undefined) {
              settings.maxHistoryTurns = 5;
            }
          });

        await tx
          .table('telegramWhitelist')
          .toCollection()
          .modify((user: Record<string, unknown>) => {
            if (user.maxHistoryTurns === undefined) {
              user.maxHistoryTurns = 5;
            }
          });
      });

    this.version(14)
      .stores(SCHEMA_V14)
      .upgrade(async (tx) => {
        const threads = await tx.table('chatThreads').toCollection().toArray();
        const tabs = tx.table('chatTabs');
        const now = new Date().toISOString();
        const nextOrder = new Map<string, number>();

        for (const thread of threads as Array<Record<string, unknown>>) {
          const scopeKey = typeof thread.scopeKey === 'string' ? thread.scopeKey : '';
          const threadId = typeof thread.id === 'string' ? thread.id : '';
          if (!scopeKey || !threadId) continue;
          const existing = await tabs.where('threadId').equals(threadId).first();
          if (existing) continue;

          const isSdlc = scopeKey.endsWith(':sdlc') && scopeKey.startsWith('project:');
          const baseScopeKey = isSdlc ? scopeKey.slice(0, -':sdlc'.length) : scopeKey;
          const order = nextOrder.get(baseScopeKey) ?? 0;
          nextOrder.set(baseScopeKey, order + 1);
          const title = typeof thread.title === 'string' && thread.title.trim()
            ? thread.title
            : isSdlc
              ? '⚙️ SDLC Workflow'
              : `💬 Cuộc trò chuyện #${order + 1}`;
          await tabs.add({
            id: crypto.randomUUID(),
            threadId,
            scopeKey: baseScopeKey,
            type: isSdlc ? 'sdlc' : 'chat',
            title,
            order,
            active: false,
            createdAt: typeof thread.createdAt === 'string' ? thread.createdAt : now,
            updatedAt: typeof thread.updatedAt === 'string' ? thread.updatedAt : now,
          });
        }

        const scopeKeys = new Set<string>();
        for (const tab of await tabs.toCollection().toArray()) {
          scopeKeys.add(tab.scopeKey);
        }
        for (const scopeKey of scopeKeys) {
          const scopeTabs = await tabs.where('scopeKey').equals(scopeKey).sortBy('order');
          const active = scopeTabs.find((tab) => tab.active) ?? scopeTabs[0];
          if (active) await tabs.update(active.id, { active: true });
          for (const tab of scopeTabs) {
            if (tab.id !== active?.id && tab.active) await tabs.update(tab.id, { active: false });
          }
        }
      });

    this.version(15)
      .stores(SCHEMA_V15)
      .upgrade(async (tx) => {
        // Phase 31.1: Copy existing projects into changeRequests table (ENT-SYS-01, ENT-CR-01)
        const projects = await tx.table('projects').toCollection().toArray();
        const changeRequests = tx.table('changeRequests');

        for (const proj of projects as Array<Record<string, unknown>>) {
          const id = typeof proj.id === 'string' ? proj.id : '';
          if (!id) continue;
          const existing = await changeRequests.get(id);
          if (existing) continue;

          await changeRequests.add({
            id,
            name: typeof proj.name === 'string' ? proj.name : 'Untitled CR',
            description: typeof proj.description === 'string' ? proj.description : undefined,
            deadline: typeof proj.deadline === 'string' ? proj.deadline : undefined,
            status: typeof proj.status === 'string' ? proj.status : 'Open',
            type: 'ENHANCEMENT',
            targetSystemIds: [],
            jiraEpicKey: typeof proj.jiraEpicKey === 'string' ? proj.jiraEpicKey : undefined,
            opsOwners: Array.isArray(proj.opsOwners) ? proj.opsOwners : undefined,
            businessAnalysts: Array.isArray(proj.businessAnalysts) ? proj.businessAnalysts : undefined,
            documentLinks: Array.isArray(proj.documentLinks) ? proj.documentLinks : undefined,
            reminderDate: typeof proj.reminderDate === 'string' ? proj.reminderDate : undefined,
            reminderNote: typeof proj.reminderNote === 'string' ? proj.reminderNote : undefined,
            reminders: Array.isArray(proj.reminders) ? proj.reminders : undefined,
            createdAt: typeof proj.createdAt === 'string' ? proj.createdAt : new Date().toISOString(),
            updatedAt: typeof proj.updatedAt === 'string' ? proj.updatedAt : new Date().toISOString(),
          });
        }
      });

    // Phase 31.2 (D-27, D-48, D-49): drop `projects`/`milestones`, re-axis tasks onto
    // crId/systemId, convert CR targets, and purge legacy chat scopes + SSH/repo settings.
    //
    // The V2/V6/V15 hooks above intentionally reference the pre-V16 `projects` and
    // `milestones` stores by name. A hook only runs when a user upgrades *from* that
    // version, and Dexie materialises the store for the duration of the hook, so those
    // calls resolve against the pre-V16 schema of that step — not against SCHEMA_V16.
    this.version(16)
      .stores(SCHEMA_V16)
      .upgrade(async (tx) => {
        const changeRequestsTable = tx.table('changeRequests');
        const tasksTable = tx.table('tasks');

        // 1. Collect the surviving CR ids so tasks can be resolved against them.
        const crRows = (await changeRequestsTable.toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const crIds = new Set<string>();
        for (const cr of crRows) {
          if (typeof cr.id === 'string') crIds.add(cr.id);
        }

        // 2. Re-axis tasks: projectId -> crId. A task whose project no longer resolves is
        //    parked under a recovery CR rather than deleted — losing rows silently is worse
        //    than showing them in a clearly-named bucket (data-safety goal).
        const taskRows = (await tasksTable.toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const now = new Date().toISOString();
        // `code` is a unique index: a legacy CR may already own the recovery code.
        const takenCodes = new Set<string>();
        for (const cr of crRows) {
          if (typeof cr.code === 'string' && cr.code.trim() !== '') takenCodes.add(cr.code);
        }
        let recoveryCode = 'CR-LEGACY-UNASSIGNED';
        for (let suffix = 2; takenCodes.has(recoveryCode); suffix += 1) {
          recoveryCode = `CR-LEGACY-UNASSIGNED-${suffix}`;
        }
        let parkedTasks = 0;
        for (const task of taskRows) {
          const id = typeof task.id === 'string' ? task.id : '';
          const projectId = typeof task.projectId === 'string' ? task.projectId : undefined;
          if (projectId !== undefined && crIds.has(projectId)) {
            task.crId = projectId;
          } else {
            if (!crIds.has(LEGACY_UNASSIGNED_CR_ID)) {
              const recoveryCr = {
                id: LEGACY_UNASSIGNED_CR_ID,
                name: 'Legacy unassigned tasks',
                code: recoveryCode,
                status: 'Open',
                type: 'ENHANCEMENT',
                targets: [],
                createdAt: now,
                updatedAt: now,
              };
              await changeRequestsTable.add(recoveryCr);
              crIds.add(LEGACY_UNASSIGNED_CR_ID);
              takenCodes.add(recoveryCode);
              crRows.push(recoveryCr);
            }
            task.crId = LEGACY_UNASSIGNED_CR_ID;
            parkedTasks += 1;
          }
          delete task.projectId;
          delete task.milestoneId;
          if (id) await tasksTable.put(task);
        }
        if (parkedTasks > 0) {
          console.warn(`[db v16] parked ${parkedTasks} tasks under ${recoveryCode}`);
        }

        // 3. Convert targetSystemIds -> targets, dropping ids that are not live subsystems
        //    (D-25: a parent or a deleted system must never enter `targets`), then backfill a
        //    deterministic legacy code (T-31.2-04: the legacy array never survives the upgrade).
        const systemRows = (await tx.table('systems').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const subsystemIds = new Set<string>();
        for (const system of systemRows) {
          if (typeof system.id === 'string' && system.type !== 'LOGICAL_GROUP') {
            subsystemIds.add(system.id);
          }
        }
        for (const cr of crRows) {
          if (cr.targets === undefined) {
            cr.targets = Array.isArray(cr.targetSystemIds)
              ? (cr.targetSystemIds as unknown[])
                  .filter((systemId): systemId is string => typeof systemId === 'string')
                  .filter((systemId) => subsystemIds.has(systemId))
                  .map((systemId) => ({ systemId }))
              : [];
          }
          delete cr.targetSystemIds;
        }
        const crsByCodeOrder = [...crRows].sort((a, b) =>
          String(a.id ?? '').localeCompare(String(b.id ?? ''))
        );
        let legacyCodeCounter = 0;
        for (const cr of crsByCodeOrder) {
          if (typeof cr.code !== 'string' || cr.code.trim() === '') {
            let code: string;
            do {
              legacyCodeCounter += 1;
              code = `CR-LEGACY-${legacyCodeCounter}`;
            } while (takenCodes.has(code));
            takenCodes.add(code);
            cr.code = code;
          }
        }
        for (const cr of crRows) {
          if (typeof cr.id === 'string') await changeRequestsTable.put(cr);
        }

        // 3b. Legacy project:/milestone: entity references would fail the v11 backup schema
        //     (`entityType` only accepts task/cr/system). Detach notes and re-point links.
        await tx
          .table('notes')
          .toCollection()
          .modify((note: Record<string, unknown>) => {
            if (note.entityType === 'project' || note.entityType === 'milestone') {
              delete note.entityType;
              delete note.entityId;
            }
          });
        await tx
          .table('knowledgeLinks')
          .toCollection()
          .modify((link: Record<string, unknown>) => {
            if (link.taskMateEntityType === 'project' || link.taskMateEntityType === 'milestone') {
              link.taskMateEntityType = 'cr';
            }
          });

        // 4. Purge legacy project:/milestone: chat threads, their tabs and messages.
        const threadRows = (await tx.table('chatThreads').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const legacyThreadIds = threadRows
          .filter(
            (thread) =>
              typeof thread.scopeKey === 'string' &&
              (thread.scopeKey.startsWith('project:') ||
                thread.scopeKey.startsWith('milestone:'))
          )
          .map((thread) => (typeof thread.id === 'string' ? thread.id : ''))
          .filter((threadId) => threadId !== '');
        for (const threadId of legacyThreadIds) {
          await tx.table('chatMessages').where('threadId').equals(threadId).delete();
          await tx.table('chatTabs').where('threadId').equals(threadId).delete();
          await tx.table('chatThreads').delete(threadId);
        }

        // 5. Purge legacy project SSH/repo bindings so the removed config surface cannot
        //    be re-read after the upgrade (T-31.2-05).
        const settingRows = (await tx.table('settings').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        for (const setting of settingRows) {
          const key = typeof setting.key === 'string' ? setting.key : '';
          if (key.startsWith('project_ssh_repo:') || key.startsWith('project_repo_ssh_binding:')) {
            await tx.table('settings').delete(key);
          }
        }
      });

    // Phase 34 (D-18, D-23, D-25, D-32): AI Office stores. Purely additive — nothing to
    // backfill, so no `.upgrade()` hook.
    this.version(17).stores(SCHEMA_V17);

    // Phase 35 (C-16, D-05): SDLC is deleted. Purge its rows — tab, thread, message, and
    // workflow-state settings — so no removed surface can be re-read after the upgrade.
    this.version(18)
      .stores(SCHEMA_V18)
      .upgrade(async (tx) => {
        // 1. SDLC tabs. Bulk-collect then delete by id — the V16 hook's convention.
        const tabRows = (await tx.table('chatTabs').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const sdlcTabIds = tabRows
          .filter((tab) => tab.type === 'sdlc')
          .map((tab) => (typeof tab.id === 'string' ? tab.id : ''))
          .filter((tabId) => tabId !== '');
        for (const tabId of sdlcTabIds) {
          await tx.table('chatTabs').delete(tabId);
        }

        // 2. SDLC threads and everything hanging off them. Messages go first so the
        //    backup schema's `threadId ∈ chatThreads` invariant holds afterwards (L5).
        const threadRows = (await tx.table('chatThreads').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const sdlcThreadIds = threadRows
          .filter((thread) => typeof thread.scopeKey === 'string' && thread.scopeKey.endsWith(':sdlc'))
          .map((thread) => (typeof thread.id === 'string' ? thread.id : ''))
          .filter((threadId) => threadId !== '');
        for (const threadId of sdlcThreadIds) {
          await tx.table('chatMessages').where('threadId').equals(threadId).delete();
          await tx.table('chatTabs').where('threadId').equals(threadId).delete();
          await tx.table('chatThreads').delete(threadId);
        }

        // 3. Retired document-set SDLC metadata. DocumentSetSchema is strict, so a surviving
        //    `sdlc` key makes every updateDocumentSet/updatePresentationOrder throw. Strip the
        //    key only — the set, its id, and the notes it references are preserved untouched.
        await tx
          .table('documentSets')
          .toCollection()
          .modify((documentSet: Record<string, unknown>) => {
            if ('sdlc' in documentSet) delete documentSet.sdlc;
          });

        // 4. Workflow-state settings written by the removed SDLC surface.
        const settingRows = (await tx.table('settings').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        for (const setting of settingRows) {
          const key = typeof setting.key === 'string' ? setting.key : '';
          if (key.startsWith('sdlc_workflow:')) await tx.table('settings').delete(key);
        }
      });

    // Phase 36 (D-16, D-22): skill revisions. Purely additive — nothing to backfill, so no
    // `.upgrade()` hook. The V18 purge hook above stays attached to version(18) only.
    this.version(19).stores(SCHEMA_V19);

    // Repair (post-36): the V16 purge filtered on `scopeKey` prefix only, but the pre-31.2
    // `buildScopeKey` collapsed a project/milestone scope with no entityId to `scopeKey:
    // 'global'`. Those rows kept `scopeType: 'project' | 'milestone'` and made the app's own
    // export unrestorable (BackupChatThreadRecordSchema rejects the enum value). Rewrite the
    // value from the scope key; an unrecognized key becomes `global`, its entityId dropped.
    this.version(20)
      .stores(SCHEMA_V20)
      .upgrade(async (tx) => {
        const valid = new Set(['global', 'task', 'cr', 'system', 'document', 'team']);
        await tx
          .table('chatThreads')
          .toCollection()
          .modify((thread: Record<string, unknown>) => {
            if (typeof thread.scopeType !== 'string' || valid.has(thread.scopeType)) return;
            const scopeKey = typeof thread.scopeKey === 'string' ? thread.scopeKey : '';
            const prefix = scopeKey === 'global' ? 'global' : scopeKey.split(':', 1)[0] || '';
            const entityId = scopeKey.split(':')[1];
            thread.scopeType = valid.has(prefix) ? prefix : 'global';
            if (thread.scopeType === 'global' || !entityId) delete thread.entityId;
            else thread.entityId = entityId;
          });
      });

    // Repair (post-36, second pass): a real export still failed import with
    // `ChatTab references threadId … not found`. Two leaks the earlier purges missed:
    //  1. `sdlc:`-PREFIXED threads — V18 matched only the `:sdlc` SUFFIX, so 13 legacy rows
    //     survived and were exported.
    //  2. Tabs whose thread was deleted without them (`project:…` scopes), which no surface can
    //     display and the backup validator refuses.
    // Messages go first so the exporter's own `threadId ∈ chatThreads` invariant holds.
    this.version(21)
      .stores(SCHEMA_V21)
      .upgrade(async (tx) => {
        const threadRows = (await tx.table('chatThreads').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        const deadThreadIds = new Set<string>();
        for (const thread of threadRows) {
          const scopeKey = typeof thread.scopeKey === 'string' ? thread.scopeKey : '';
          const id = typeof thread.id === 'string' ? thread.id : '';
          if (!id) continue;
          if (scopeKey.startsWith('sdlc:') || scopeKey.endsWith(':sdlc')) deadThreadIds.add(id);
        }

        for (const threadId of deadThreadIds) {
          await tx.table('chatMessages').where('threadId').equals(threadId).delete();
          await tx.table('chatTabs').where('threadId').equals(threadId).delete();
          await tx.table('chatThreads').delete(threadId);
        }

        const survivingThreadIds = new Set(
          ((await tx.table('chatThreads').toCollection().toArray()) as Array<Record<string, unknown>>)
            .map((thread) => (typeof thread.id === 'string' ? thread.id : ''))
            .filter((id) => id !== '')
        );
        const tabRows = (await tx.table('chatTabs').toCollection().toArray()) as Array<
          Record<string, unknown>
        >;
        for (const tab of tabRows) {
          const threadId = typeof tab.threadId === 'string' ? tab.threadId : '';
          const id = typeof tab.id === 'string' ? tab.id : '';
          if (id && threadId && !survivingThreadIds.has(threadId)) {
            await tx.table('chatTabs').delete(id);
          }
        }
      });

    // Phase 37 (D-22): run ledger. Purely additive — nothing to backfill, so no
    // `.upgrade()` hook. The V20/V21 repair hooks stay attached to their own versions.
    this.version(22).stores(SCHEMA_V22);

    // Multi-tab concurrency handlers (DATA-04, D-09, D-10)
    this.on('blocked', () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
      }
    });

    this.on('versionchange', (event) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('db-version-changed', { detail: event }));
      }
      this.close();
    });
  }
}

export const db = new TaskPlannerDatabase();
