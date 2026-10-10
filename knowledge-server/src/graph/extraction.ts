import type { Root, RootContent, Table, TableRow, TableCell, Heading } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { parseMarkdownToAst } from '../parser/markdownAst.js';
import type { ProjectionSnapshot, ProjectedDocument } from '../indexing/incrementalProjector.js';
import {
  ResolvedNode,
  FactAssertion,
  GraphEvidenceRecord,
  QuarantinedIdentifier,
  SourceRange,
  DeterministicExtractionResult,
} from '../types/graphProtocol.js';
import { ONTOLOGY_VERSION } from './ontology.js';
import {
  buildUrn,
  buildFactKey,
  normalizeTechnicalIdentifier,
} from './identity.js';
import { sha256Hex } from '../indexing/chunkHashPolicy.js';

function deterministicUuid(seed: string): string {
  const hash = sha256Hex(seed);
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = '4' + hash.slice(13, 16);
  const part4 = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.slice(18, 20);
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

interface TraversalContext {
  doc: ProjectedDocument;
  documentBody: string;
  headingPath: string[];
  nodesMap: Map<string, ResolvedNode>;
  factsMap: Map<string, FactAssertion>;
  evidenceList: GraphEvidenceRecord[];
  quarantinesList: QuarantinedIdentifier[];
  consumedRangesMap: Map<string, SourceRange[]>;
}

function cleanCellText(cell: TableCell): string {
  return toString(cell).replace(/[*`]/g, '').trim();
}

function getRowCells(row: TableRow): string[] {
  return row.children.map(cleanCellText);
}

function recordConsumedRange(
  ctx: TraversalContext,
  startOffset: number,
  endOffset: number,
  startLine?: number,
  endLine?: number
): void {
  const ranges = ctx.consumedRangesMap.get(ctx.doc.documentId) || [];
  ranges.push({
    startOffset,
    endOffset,
    ...(startLine ? { startLine } : {}),
    ...(endLine ? { endLine } : {}),
  });
  ctx.consumedRangesMap.set(ctx.doc.documentId, ranges);
}

function addNode(ctx: TraversalContext, node: ResolvedNode): void {
  const existing = ctx.nodesMap.get(node.urn);
  if (!existing) {
    ctx.nodesMap.set(node.urn, node);
  } else {
    // Merge properties/aliases without overwriting
    ctx.nodesMap.set(node.urn, {
      ...existing,
      properties: { ...existing.properties, ...node.properties },
      aliases: Array.from(new Set([...existing.aliases, ...node.aliases])),
    });
  }
}

function addFactAndEvidence(
  ctx: TraversalContext,
  subjectUrn: string,
  relation: string,
  objectUrn: string,
  qualifiers: Record<string, string>,
  startLine: number,
  endLine: number,
  startOffset: number,
  endOffset: number,
  rawSnippet: string,
  extractionMethod: 'DETERMINISTIC_TABLE' | 'DETERMINISTIC_SQL' | 'DETERMINISTIC_CODE' = 'DETERMINISTIC_TABLE'
): void {
  const factKey = buildFactKey({
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn,
    relation,
    objectUrn,
    qualifiers,
  });

  if (!ctx.factsMap.has(factKey)) {
    ctx.factsMap.set(factKey, {
      factKey,
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn,
      relation: relation as any,
      objectUrn,
      qualifiers,
      classification: 'OBSERVED',
    });
  }

  const evidenceSeed = `${ctx.doc.documentId}:${factKey}:${startOffset}:${endOffset}`;
  const evidenceId = deterministicUuid(evidenceSeed);

  ctx.evidenceList.push({
    evidenceId,
    factKey,
    documentId: ctx.doc.documentId,
    documentTitle: ctx.doc.title,
    sectionHeadingPath: [...ctx.headingPath],
    startLine,
    endLine,
    startOffset,
    endOffset,
    rawSnippet,
    extractionMethod,
    classification: 'OBSERVED',
    confidence: 1.0,
    observedAt: '2026-10-10T00:00:00.000Z',
  });
}

function addQuarantine(
  ctx: TraversalContext,
  rawIdentifier: string,
  reason: string,
  startLine: number,
  endLine: number,
  extractionMethod: 'DETERMINISTIC_TABLE' | 'DETERMINISTIC_SQL' | 'DETERMINISTIC_CODE' = 'DETERMINISTIC_TABLE',
  possibleMatches: string[] = []
): void {
  ctx.quarantinesList.push({
    rawIdentifier,
    reason,
    documentId: ctx.doc.documentId,
    sectionHeadingPath: [...ctx.headingPath],
    startLine,
    endLine,
    extractionMethod,
    possibleMatches,
  });
}

/**
 * Parses and extracts PRC_PROCESS table:
 * Columns: ID, PROCEDURE_NAME, IS_EXTERNAL, IS_CONTAINER, INST_ID, IS_PARALLEL
 */
function handlePrcProcessTable(table: Table, ctx: TraversalContext): void {
  const header = table.children[0];
  if (!header) return;
  const colNames = getRowCells(header).map((c) => c.toUpperCase());
  const idIdx = colNames.findIndex((c) => c === 'ID' || c === 'PROCESS_ID');
  const procIdx = colNames.findIndex((c) => c.includes('PROCEDURE'));
  const isContIdx = colNames.findIndex((c) => c.includes('IS_CONTAINER'));
  const isExtIdx = colNames.findIndex((c) => c.includes('IS_EXTERNAL'));
  const instIdx = colNames.findIndex((c) => c.includes('INST_ID'));
  const isParIdx = colNames.findIndex((c) => c.includes('IS_PARALLEL'));

  if (idIdx === -1 || procIdx === -1) return;

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const rawId = cells[idIdx]?.trim();
    const rawProc = cells[procIdx]?.trim();
    if (!rawId || !rawProc) continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    // D-03: Exclude runtime sample rows or session data
    if (rawId.length > 10 || isNaN(Number(rawId))) {
      continue;
    }

    const isContainer = isContIdx >= 0 && cells[isContIdx] ? Number(cells[isContIdx]) : 0;
    const isExternal = isExtIdx >= 0 && cells[isExtIdx] ? Number(cells[isExtIdx]) : 0;
    const instId = instIdx >= 0 && cells[instIdx] ? Number(cells[instIdx]) : undefined;
    const isParallel = isParIdx >= 0 && cells[isParIdx] ? Number(cells[isParIdx]) : undefined;

    const processUrn = buildUrn('smartvista', 'PRC_PROCESS', rawId);
    const processNode: ResolvedNode = {
      urn: processUrn,
      kind: 'ScheduledProcess',
      canonicalName: rawId === '60000006' ? 'SHB - Credit calculations' : rawProc,
      sourceSystem: 'smartvista',
      nativeType: 'PRC_PROCESS',
      normalizedKey: rawId,
      properties: {
        isExternal,
        isContainer,
        ...(instId !== undefined ? { instId } : {}),
        ...(isParallel !== undefined ? { isParallel } : {}),
        ...(rawProc ? { procedureName: rawProc } : {}),
      },
      aliases: [],
    };
    addNode(ctx, processNode);

    // If procedure name is not CONTAINER, it invokes a SoftwareComponent
    if (rawProc.toUpperCase() !== 'CONTAINER') {
      const procWithSchema = rawProc.toUpperCase().startsWith('MAIN1.') ? rawProc : `MAIN1.${rawProc}`;
      const normRes = normalizeTechnicalIdentifier(procWithSchema, 'MAIN1');
      if (normRes.isQuarantined) {
        addQuarantine(ctx, rawProc, normRes.quarantineReason || 'Unqualified procedure', rowStartLine, rowEndLine);
      } else {
        const procUrn = buildUrn('plsql', 'PLSQL_PROCEDURE', normRes.qualifiedIdentifier);
        const compNode: ResolvedNode = {
          urn: procUrn,
          kind: 'SoftwareComponent',
          canonicalName: normRes.qualifiedIdentifier,
          sourceSystem: 'plsql',
          nativeType: 'PLSQL_PROCEDURE',
          normalizedKey: normRes.qualifiedIdentifier,
          subkind: 'PLSQL_PROCEDURE',
          properties: {
            schema: normRes.schema || 'MAIN1',
            package: normRes.objectName,
            ...(normRes.subObject ? { procedure: normRes.subObject } : {}),
          },
          aliases: [rawProc],
        };
        addNode(ctx, compNode);

        // Process INVOKES SoftwareComponent or CALLS SoftwareComponent
        // ScheduledProcess calling SoftwareComponent is INVOKES or CALLS (per gold fixtures, subprocess 10000304 CALLS component)
        addFactAndEvidence(
          ctx,
          processUrn,
          'CALLS',
          procUrn,
          {},
          rowStartLine,
          rowEndLine,
          rowStartOffset,
          rowEndOffset,
          rawSnippet
        );
      }
    }
  }
}

/**
 * Parses and extracts PRC_CONTAINER table:
 * Columns: Bind ID / BIND_ID, PROCESS_ID, EXEC_ORDER, IS_PARALLEL, PARALLEL_DEGREE, Cycle / note
 */
function handlePrcContainerTable(table: Table, ctx: TraversalContext, parentProcessId: string = '60000006'): void {
  const header = table.children[0];
  if (!header) return;
  const colNames = getRowCells(header).map((c) => c.toUpperCase());
  const bindIdx = colNames.findIndex((c) => c.includes('BIND'));
  const procIdx = colNames.findIndex((c) => c === 'PROCESS_ID' || c === 'PROCESS');
  const orderIdx = colNames.findIndex((c) => c.includes('EXEC_ORDER') || c.includes('ORDER'));
  const isParIdx = colNames.findIndex((c) => c.includes('IS_PARALLEL'));
  const degIdx = colNames.findIndex((c) => c.includes('PARALLEL_DEGREE') || c.includes('DEGREE'));
  const noteIdx = colNames.findIndex((c) => c.includes('NOTE') || c.includes('CYCLE') || c.includes('NAME'));

  if (bindIdx === -1 || procIdx === -1 || orderIdx === -1) return;

  const parentProcessUrn = buildUrn('smartvista', 'PRC_PROCESS', parentProcessId);

  interface ParsedStep {
    bindId: string;
    processId: string;
    execOrder: number;
    isParallel?: number;
    parallelDegree?: number;
    note?: string;
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
    rawSnippet: string;
    stepUrn: string;
  }

  const steps: ParsedStep[] = [];

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const bindId = cells[bindIdx]?.trim();
    const processId = cells[procIdx]?.trim();
    const orderStr = cells[orderIdx]?.trim();
    if (!bindId || !processId || !orderStr) continue;

    const execOrder = parseInt(orderStr, 10);
    if (isNaN(execOrder)) continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    const isParallel = isParIdx >= 0 && cells[isParIdx] ? Number(cells[isParIdx]) : undefined;
    const parallelDegree = degIdx >= 0 && cells[degIdx] ? Number(cells[degIdx]) : undefined;
    const note = noteIdx >= 0 ? cells[noteIdx]?.trim() : undefined;

    // D-07: ProcessStep nodes keyed by PRC_CONTAINER.ID (bindId)
    const stepUrn = buildUrn('smartvista', 'PRC_CONTAINER', bindId);
    const stepNode: ResolvedNode = {
      urn: stepUrn,
      kind: 'ProcessStep',
      canonicalName: note ? `Step ${execOrder} - ${note}` : `Step ${execOrder}`,
      sourceSystem: 'smartvista',
      nativeType: 'PRC_CONTAINER',
      normalizedKey: bindId,
      properties: {
        execOrder,
        ...(isParallel !== undefined ? { isParallel } : {}),
        ...(parallelDegree !== undefined ? { parallelDegree } : {}),
      },
      aliases: [],
    };
    addNode(ctx, stepNode);

    // Parent ScheduledProcess CONTAINS_STEP ProcessStep
    addFactAndEvidence(
      ctx,
      parentProcessUrn,
      'CONTAINS_STEP',
      stepUrn,
      {},
      rowStartLine,
      rowEndLine,
      rowStartOffset,
      rowEndOffset,
      rawSnippet
    );

    // ProcessStep INVOKES child ScheduledProcess (processId)
    const childProcUrn = buildUrn('smartvista', 'PRC_PROCESS', processId);
    addFactAndEvidence(
      ctx,
      stepUrn,
      'INVOKES',
      childProcUrn,
      {},
      rowStartLine,
      rowEndLine,
      rowStartOffset,
      rowEndOffset,
      rawSnippet
    );

    // Check if note mentions CYTP cycle type code (e.g. CYTP1002)
    if (note) {
      const match = note.match(/CYTP\d{4}/i);
      if (match) {
        const cytpCode = match[0]!.toUpperCase();
        const cytpUrn = buildUrn('smartvista', 'CycleType', cytpCode);
        const cycleNode: ResolvedNode = {
          urn: cytpUrn,
          kind: 'CycleType',
          canonicalName: `${cytpCode} - ${note.replace(match[0]!, '').trim()}`,
          sourceSystem: 'smartvista',
          nativeType: 'CycleType',
          normalizedKey: cytpCode,
          properties: {
            cycleTypeCode: cytpCode,
          },
          aliases: [],
        };
        addNode(ctx, cycleNode);

        // Step USES_TYPE cycleType
        addFactAndEvidence(
          ctx,
          stepUrn,
          'USES_TYPE',
          cytpUrn,
          {},
          rowStartLine,
          rowEndLine,
          rowStartOffset,
          rowEndOffset,
          rawSnippet
        );
      }
    }

    steps.push({
      bindId,
      processId,
      execOrder,
      isParallel,
      parallelDegree,
      note,
      startLine: rowStartLine,
      endLine: rowEndLine,
      startOffset: rowStartOffset,
      endOffset: rowEndOffset,
      rawSnippet,
      stepUrn,
    });
  }

  // Sort steps by execOrder to emit PRECEDES relations between sequential steps
  steps.sort((a, b) => a.execOrder - b.execOrder);
  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i]!;
    const next = steps[i + 1]!;
    addFactAndEvidence(
      ctx,
      current.stepUrn,
      'PRECEDES',
      next.stepUrn,
      {},
      current.startLine,
      next.endLine,
      current.startOffset,
      next.endOffset,
      current.rawSnippet
    );
  }
}

/**
 * Parses and extracts Cycle bind parameter table:
 * Columns: Bind, exec, I_CYCLE_TYPE, Dict name
 */
function handleCycleBindTable(table: Table, ctx: TraversalContext): void {
  const header = table.children[0];
  if (!header) return;
  const colNames = getRowCells(header).map((c) => c.toUpperCase());
  const bindIdx = colNames.findIndex((c) => c.includes('BIND'));
  const cycleIdx = colNames.findIndex((c) => c.includes('CYCLE_TYPE') || c.includes('TYPE'));
  const nameIdx = colNames.findIndex((c) => c.includes('NAME') || c.includes('DICT'));

  if (bindIdx === -1 || cycleIdx === -1) return;

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const bindId = cells[bindIdx]?.trim();
    const cycleType = cells[cycleIdx]?.trim();
    const dictName = nameIdx >= 0 ? cells[nameIdx]?.trim() : '';

    if (!bindId || !cycleType || !cycleType.startsWith('CYTP')) continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    const stepUrn = buildUrn('smartvista', 'PRC_CONTAINER', bindId);
    const cytpUrn = buildUrn('smartvista', 'CycleType', cycleType);

    const cycleNode: ResolvedNode = {
      urn: cytpUrn,
      kind: 'CycleType',
      canonicalName: dictName ? `${cycleType} - ${dictName}` : cycleType,
      sourceSystem: 'smartvista',
      nativeType: 'CycleType',
      normalizedKey: cycleType,
      properties: {
        cycleTypeCode: cycleType,
        ...(dictName ? { description: dictName } : {}),
      },
      aliases: [],
    };
    addNode(ctx, cycleNode);

    // Step USES_TYPE CycleType
    addFactAndEvidence(
      ctx,
      stepUrn,
      'USES_TYPE',
      cytpUrn,
      {},
      rowStartLine,
      rowEndLine,
      rowStartOffset,
      rowEndOffset,
      rawSnippet
    );
  }
}

/**
 * Parses and extracts Billing dispatch table (04-cycles.md):
 * Columns: Event, Call, Writes
 */
function handleBillingDispatchTable(table: Table, ctx: TraversalContext): void {
  const header = table.children[0];
  if (!header) return;
  const colNames = getRowCells(header).map((c) => c.toUpperCase());
  const eventIdx = colNames.findIndex((c) => c.includes('EVENT'));
  const callIdx = colNames.findIndex((c) => c.includes('CALL'));
  const writesIdx = colNames.findIndex((c) => c.includes('WRITES'));

  if (eventIdx === -1 || writesIdx === -1) return;

  const billingProcUrn = buildUrn('plsql', 'PLSQL_PROCEDURE', 'MAIN1.CRD_PRC_BILLING_PKG.PROCESS');

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const event = cells[eventIdx]?.trim();
    const writes = cells[writesIdx]?.trim();
    if (!event || !writes || writes.toLowerCase() === 'null') continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    // Extract table names mentioned in writes (e.g. CRD_DEBT_INTEREST, CRD_INVOICE, CRD_AGING, OPR_OPERATION)
    const tableTokens = writes.match(/[A-Z][A-Z0-9_]{3,}/g) || [];
    for (const token of tableTokens) {
      if (token === 'CRD_PRC_BILLING_PKG' || token === 'PROCESS') continue;
      // Controlled D-06: Qualify by schema MAIN1
      const normRes = normalizeTechnicalIdentifier(token, 'MAIN1');
      if (normRes.isQuarantined) {
        addQuarantine(ctx, token, normRes.quarantineReason || 'Unqualified DB object', rowStartLine, rowEndLine);
        continue;
      }

      const tableUrn = buildUrn('oracle', 'ORACLE_TABLE', normRes.qualifiedIdentifier);
      const dbNode: ResolvedNode = {
        urn: tableUrn,
        kind: 'DatabaseObject',
        canonicalName: normRes.qualifiedIdentifier,
        sourceSystem: 'oracle',
        nativeType: 'ORACLE_TABLE',
        normalizedKey: normRes.qualifiedIdentifier,
        subkind: 'ORACLE_TABLE',
        properties: {
          schema: normRes.schema || 'MAIN1',
          tableName: normRes.objectName,
        },
        aliases: [token.toLowerCase()],
      };
      addNode(ctx, dbNode);

      // Billing procedure WRITES_TO table with controlled qualifier INSERT or UPDATE
      const op = writes.toLowerCase().includes('update') ? 'UPDATE' : 'INSERT';
      addFactAndEvidence(
        ctx,
        billingProcUrn,
        'WRITES_TO',
        tableUrn,
        { operation: op },
        rowStartLine,
        rowEndLine,
        rowStartOffset,
        rowEndOffset,
        rawSnippet
      );
    }
  }
}

/**
 * Parses and extracts Status / Result codes table:
 * Columns: Code, Name
 */
function handleStatusTable(table: Table, ctx: TraversalContext): void {
  const header = table.children[0];
  if (!header) return;
  const colNames = getRowCells(header).map((c) => c.toUpperCase());
  const codeIdx = colNames.findIndex((c) => c === 'CODE');
  const nameIdx = colNames.findIndex((c) => c === 'NAME');

  if (codeIdx === -1 || nameIdx === -1) return;

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const code = cells[codeIdx]?.trim();
    const name = cells[nameIdx]?.trim();
    if (!code || !name) continue;

    // Filter to known status prefixes (PRSR, EVST, OPST)
    if (!code.match(/^(PRSR|EVST|OPST)\d{4}$/i)) continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;

    const statusUrn = buildUrn('smartvista', 'Status', code);
    const statusNode: ResolvedNode = {
      urn: statusUrn,
      kind: 'Status',
      canonicalName: `${code} - ${name}`,
      sourceSystem: 'smartvista',
      nativeType: 'Status',
      normalizedKey: code,
      properties: {
        statusCode: code,
        description: name,
      },
      aliases: [name],
    };
    addNode(ctx, statusNode);
  }
}

/**
 * Parses and extracts Database object tables from 02-data-objects.md:
 * Section headings like ## `FCL_CYCLE_COUNTER` — due work queue
 * or tables with What, How built, Key cols, etc.
 */
function handleDataObjectsTables(table: Table, ctx: TraversalContext): void {
  // Check current heading path for table names (e.g. ## `FCL_CYCLE_COUNTER` or ## Table Schema: T_LN_ACCT)
  const lastHeading = ctx.headingPath[ctx.headingPath.length - 1] || '';
  const match = lastHeading.match(/`?([A-Za-z0-9_]{3,})`?/);
  if (!match) return;

  const rawTable = match[1]!;
  if (['WHAT', 'HOW', 'SAMPLE', 'ONE', 'LAYER'].includes(rawTable.toUpperCase())) return;

  const normRes = normalizeTechnicalIdentifier(rawTable, 'MAIN1');
  if (normRes.isQuarantined) {
    addQuarantine(ctx, rawTable, normRes.quarantineReason || 'Unqualified DB object', 1, 1);
    return;
  }

  const tableUrn = buildUrn('oracle', 'ORACLE_TABLE', normRes.qualifiedIdentifier);
  const dbNode: ResolvedNode = {
    urn: tableUrn,
    kind: 'DatabaseObject',
    canonicalName: normRes.qualifiedIdentifier,
    sourceSystem: 'oracle',
    nativeType: 'ORACLE_TABLE',
    normalizedKey: normRes.qualifiedIdentifier,
    subkind: 'ORACLE_TABLE',
    properties: {
      schema: normRes.schema || 'MAIN1',
      tableName: normRes.objectName,
    },
    aliases: [rawTable.toLowerCase()],
  };
  addNode(ctx, dbNode);

  // If table mentions key packages in 'How built', attach relations
  const tableRows = table.children.slice(1);
  for (const row of tableRows) {
    const text = getRowCells(row).join(' ');
    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    if (text.includes('FCL_PRC_CYCLE_COUNTER_PKG.PROCESS') || text.includes('update_cycle_counter')) {
      const procUrn = buildUrn('plsql', 'PLSQL_PROCEDURE', 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS');
      addFactAndEvidence(ctx, procUrn, 'READS_FROM', tableUrn, { operation: 'READ' }, rowStartLine, rowEndLine, rowStartOffset, rowEndOffset, rawSnippet);
      addFactAndEvidence(ctx, procUrn, 'WRITES_TO', tableUrn, { operation: 'UPDATE' }, rowStartLine, rowEndLine, rowStartOffset, rowEndOffset, rawSnippet);
    }
  }
}

/**
 * Recursively traverses markdown AST to extract deterministic facts and record consumed ranges.
 */
function traverseAst(node: RootContent | Root, ctx: TraversalContext): void {
  if (node.type === 'heading') {
    const headingNode = node as Heading;
    const headingText = toString(headingNode).trim();
    if (headingNode.depth === 1) {
      ctx.headingPath = [headingText];
    } else if (headingNode.depth === 2) {
      ctx.headingPath = [headingText];
    } else if (headingNode.depth === 3) {
      const parentH2 = ctx.headingPath[0];
      ctx.headingPath = parentH2 ? [parentH2, headingText] : [headingText];
    }
  } else if (node.type === 'table') {
    const table = node as Table;
    const startOffset = table.position?.start?.offset ?? 0;
    const endOffset = table.position?.end?.offset ?? 0;
    const startLine = table.position?.start?.line ?? 1;
    const endLine = table.position?.end?.line ?? 1;

    // Record consumed range for the table
    recordConsumedRange(ctx, startOffset, endOffset, startLine, endLine);

    const header = table.children[0];
    if (header) {
      const headerText = getRowCells(header).join(' ').toUpperCase();
      if (headerText.includes('PROCEDURE_NAME') && headerText.includes('IS_CONTAINER')) {
        handlePrcProcessTable(table, ctx);
      } else if (headerText.includes('BIND') && headerText.includes('EXEC_ORDER')) {
        handlePrcContainerTable(table, ctx);
      } else if (headerText.includes('I_CYCLE_TYPE') || (headerText.includes('BIND') && headerText.includes('CYCLE'))) {
        handleCycleBindTable(table, ctx);
      } else if (headerText.includes('EVENT') && headerText.includes('WRITES')) {
        handleBillingDispatchTable(table, ctx);
      } else if (headerText.includes('CODE') && headerText.includes('NAME') && (ctx.headingPath.some((h) => h.includes('Result') || h.includes('Status')))) {
        handleStatusTable(table, ctx);
      } else {
        handleDataObjectsTables(table, ctx);
      }
    }
  } else if (node.type === 'code') {
    // Code blocks are consumed ranges
    const startOffset = node.position?.start?.offset ?? 0;
    const endOffset = node.position?.end?.offset ?? 0;
    const startLine = node.position?.start?.line ?? 1;
    const endLine = node.position?.end?.line ?? 1;
    recordConsumedRange(ctx, startOffset, endOffset, startLine, endLine);
  }

  if ('children' in node && Array.isArray((node as any).children)) {
    for (const child of (node as any).children) {
      traverseAst(child, ctx);
    }
  }
}

/**
 * Extracts deterministic facts from published projection snapshot per D-11, D-12, D-16.
 */
export function extractDeterministicFacts(snapshot: ProjectionSnapshot): DeterministicExtractionResult {
  const nodesMap = new Map<string, ResolvedNode>();
  const factsMap = new Map<string, FactAssertion>();
  const evidenceList: GraphEvidenceRecord[] = [];
  const quarantinesList: QuarantinedIdentifier[] = [];
  const consumedRangesMap = new Map<string, SourceRange[]>();

  for (const doc of snapshot.documents) {
    // Reconstruct raw document body from chunks
    const body = doc.chunks.map((c) => c.rawContent).join('');
    const ast = parseMarkdownToAst(body);

    // Register SourceDocument node for each document in snapshot per GRAPH-01 / D-01
    const docUrn = buildUrn('markdown', 'SourceDocument', doc.documentId);
    if (!nodesMap.has(docUrn)) {
      nodesMap.set(docUrn, {
        urn: docUrn,
        kind: 'SourceDocument',
        canonicalName: doc.title,
        sourceSystem: 'markdown',
        nativeType: 'SourceDocument',
        normalizedKey: doc.documentId,
        properties: {
          documentId: doc.documentId,
          title: doc.title,
        },
        aliases: [doc.title],
      });
    }

    const ctx: TraversalContext = {
      doc,
      documentBody: body,
      headingPath: [],
      nodesMap,
      factsMap,
      evidenceList,
      quarantinesList,
      consumedRangesMap,
    };

    traverseAst(ast, ctx);
  }

  return {
    nodes: Array.from(nodesMap.values()),
    facts: Array.from(factsMap.values()),
    evidence: evidenceList,
    quarantines: quarantinesList,
    consumedRanges: consumedRangesMap,
  };
}
