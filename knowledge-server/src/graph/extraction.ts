import type { Root, RootContent, Table, TableRow, TableCell, Heading, Code, InlineCode } from 'mdast';
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

/**
 * Strips Vietnamese and Latin diacritics using Unicode NFD decomposition.
 */
export function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
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
  containerProcessId?: string;
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
 * Normalizes header string by stripping accents and non-alphanumeric chars for role matching.
 */
function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
}

/**
 * Standard column roles for schema-driven table detection.
 */
export interface TableSchemaRoles {
  idIdx: number;
  nameIdx: number;
  actionIdx: number;
  targetIdx: number;
  orderIdx: number;
  descIdx: number;
  typeIdx: number;
  writesIdx: number;
  isContIdx: number;
  isExtIdx: number;
  instIdx: number;
  isParIdx: number;
  parallelDegreeIdx: number;
}

export function detectTableSchema(headers: string[]): TableSchemaRoles {
  const norm = headers.map(normalizeHeader);

  const findIdx = (patterns: RegExp[], excludeIndices: number[] = []): number => {
    return norm.findIndex((col, idx) => !excludeIndices.includes(idx) && patterns.some((p) => p.test(col)));
  };

  // Step bind / row ID vs target process ID disambiguation
  const hasBindCol = norm.some((col) => /BIND_ID|^BIND$|MA_BUOC|STEP_ID/.test(col));
  const idPatterns = hasBindCol
    ? [/BIND_ID/, /^BIND$/, /STEP_ID/, /MA_BUOC/, /^ID$/]
    : [/^ID$/, /^CODE$/, /PROCESS_ID/, /STEP_ID/, /BIND_ID/, /^BIND$/, /MA_BUOC/, /MA_TIEN_TRINH/, /MA_SO/, /MA/];

  const idIdx = findIdx(idPatterns);

  const targetIdx = findIdx(
    [/TARGET/, /DOI_TUONG/, /DICH/, /RECEIVER/, /COMPONENT/, /PROCESS_ID/, /MA_TIEN_TRINH/],
    idIdx !== -1 ? [idIdx] : []
  );

  const nameIdx = findIdx(
    [/PROCEDURE_NAME/, /PROCEDURE/, /^NAME$/, /TEN_BUOC/, /TEN/, /DISPLAY_NAME/, /TITLE/],
    idIdx !== -1 ? [idIdx] : []
  );

  const actionIdx = findIdx([
    /ACTION/,
    /THAO_TAC/,
    /HANH_DONG/,
    /CALL/,
    /GOI/,
    /METHOD/,
    /OPERATION/,
  ]);

  const orderIdx = findIdx([
    /EXEC_ORDER/,
    /^ORDER$/,
    /^EXEC$/,
    /THU_TU/,
    /THU_TU_CHAY/,
    /SEQUENCE/,
    /STEP_NO/,
  ]);

  const descIdx = findIdx([
    /DESC/,
    /DESCRIPTION/,
    /GHI_CHU/,
    /MO_TA/,
    /NOTE/,
    /CYCLE.*NOTE/,
  ]);

  const typeIdx = findIdx([
    /CYCLE_TYPE/,
    /^TYPE$/,
    /LOAI/,
    /I_CYCLE_TYPE/,
  ]);

  const writesIdx = findIdx([
    /^WRITES$/,
    /WRITE_TO/,
    /WRITES_TO/,
    /^TARGET_TABLE$/,
    /^BANG_DICH$/,
  ]);

  const isContIdx = findIdx([
    /IS_CONTAINER/,
    /CONTAINER/,
  ]);

  const isExtIdx = findIdx([
    /IS_EXTERNAL/,
    /EXTERNAL/,
  ]);

  const instIdx = findIdx([
    /INST_ID/,
    /INSTANCE/,
  ]);

  const isParIdx = findIdx([
    /IS_PARALLEL/,
    /PARALLEL/,
  ]);

  const parallelDegreeIdx = findIdx([
    /PARALLEL_DEGREE/,
    /DEGREE/,
  ]);

  return {
    idIdx,
    nameIdx,
    actionIdx,
    targetIdx,
    orderIdx,
    descIdx,
    typeIdx,
    writesIdx,
    isContIdx,
    isExtIdx,
    instIdx,
    isParIdx,
    parallelDegreeIdx,
  };
}

/**
 * Handles Process Table: Identified by idIdx and nameIdx or isContIdx.
 */
function handleProcessTable(table: Table, roles: TableSchemaRoles, ctx: TraversalContext): void {
  const { idIdx, nameIdx, isContIdx, isExtIdx, instIdx, isParIdx } = roles;
  if (idIdx === -1 || nameIdx === -1) return;

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const rawId = cells[idIdx]?.trim();
    const rawProc = cells[nameIdx]?.trim();
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

    if (isContainer === 1) {
      ctx.containerProcessId = rawId;
    }

    const processUrn = buildUrn('smartvista', 'PRC_PROCESS', rawId);
    const processNode: ResolvedNode = {
      urn: processUrn,
      kind: 'ScheduledProcess',
      canonicalName: rawProc,
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
 * Handles Step Table: Columns with orderIdx and (idIdx or nameIdx), plus optional target/writes.
 */
function handleStepTable(table: Table, roles: TableSchemaRoles, ctx: TraversalContext): void {
  const { idIdx, nameIdx, orderIdx, isParIdx, parallelDegreeIdx, descIdx, targetIdx, writesIdx } = roles;
  if (orderIdx === -1 || (idIdx === -1 && nameIdx === -1)) return;

  const parentProcessId = ctx.containerProcessId;
  const parentProcessUrn = parentProcessId
    ? buildUrn('smartvista', 'PRC_PROCESS', parentProcessId)
    : null;

  interface ParsedStep {
    stepId: string;
    targetId?: string | undefined;
    execOrder: number;
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
    const orderStr = orderIdx >= 0 ? cells[orderIdx]?.trim() : undefined;
    const rawStepId = idIdx >= 0 ? cells[idIdx]?.trim() : '';
    // Never invent generic dummy steps like STEP_1, STEP_2 when id is missing
    if (!rawStepId || rawStepId.length < 2) continue;

    const execOrder = orderStr ? parseInt(orderStr, 10) : r;
    if (isNaN(execOrder)) continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    const isParallel = isParIdx >= 0 && cells[isParIdx] ? Number(cells[isParIdx]) : undefined;
    const parallelDegree = parallelDegreeIdx >= 0 && cells[parallelDegreeIdx] ? Number(cells[parallelDegreeIdx]) : undefined;
    const note = descIdx >= 0 ? cells[descIdx]?.trim() : undefined;
    const target = targetIdx >= 0 ? cells[targetIdx]?.trim() : undefined;
    const stepName = nameIdx >= 0 ? cells[nameIdx]?.trim() : undefined;
    const writes = writesIdx >= 0 ? cells[writesIdx]?.trim() : undefined;

    const canonicalName = stepName || (note ? `Step ${execOrder} - ${note}` : `Step ${execOrder}`);

    const aliasesSet = new Set<string>();
    if (rawStepId) aliasesSet.add(rawStepId);
    if (stepName) {
      aliasesSet.add(stepName);
      const diacriticFree = removeVietnameseDiacritics(stepName).toLowerCase().trim();
      if (diacriticFree) aliasesSet.add(diacriticFree);
    }
    if (note) {
      aliasesSet.add(note);
      const diacriticFreeNote = removeVietnameseDiacritics(note).toLowerCase().trim();
      if (diacriticFreeNote) aliasesSet.add(diacriticFreeNote);
    }

    const stepUrn = buildUrn('smartvista', 'PRC_CONTAINER', rawStepId);
    const stepNode: ResolvedNode = {
      urn: stepUrn,
      kind: 'ProcessStep',
      canonicalName,
      sourceSystem: 'smartvista',
      nativeType: 'PRC_CONTAINER',
      normalizedKey: rawStepId,
      properties: {
        execOrder,
        ...(stepName ? { stepName } : {}),
        ...(isParallel !== undefined ? { isParallel } : {}),
        ...(parallelDegree !== undefined ? { parallelDegree } : {}),
        ...(note !== undefined ? { note } : {}),
      },
      aliases: Array.from(aliasesSet),
    };
    addNode(ctx, stepNode);

    if (parentProcessUrn) {
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
    }

    let compUrn: string | null = null;
    if (target) {
      // Check if target is a process ID (all numeric)
      if (/^\d+$/.test(target)) {
        const childProcUrn = buildUrn('smartvista', 'PRC_PROCESS', target);
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
      } else {
        // Target is a service or component
        compUrn = buildUrn('system', 'SoftwareComponent', target);
        const compNode: ResolvedNode = {
          urn: compUrn,
          kind: 'SoftwareComponent',
          canonicalName: target,
          sourceSystem: 'system',
          nativeType: 'Service',
          normalizedKey: target,
          properties: {},
          aliases: [],
        };
        addNode(ctx, compNode);

        addFactAndEvidence(
          ctx,
          stepUrn,
          'INVOKES',
          compUrn,
          {},
          rowStartLine,
          rowEndLine,
          rowStartOffset,
          rowEndOffset,
          rawSnippet
        );
      }
    }

    // Process WRITES column if present
    if (writes && writes.toLowerCase() !== 'null' && writes.toLowerCase() !== '-') {
      // Split tokens by comma, semicolon, or whitespace, matching explicit table identifiers
      const rawTokens = writes.match(/\b(?:([A-Za-z0-9_]{2,}\.[A-Za-z0-9_]{2,})|((?:TBL|ACC|OPR|CRD|AUT|PRC|FCL|NPS|VIS|MCW|EVT)_[A-Z0-9_]+))\b/gi) || [];
      for (const token of rawTokens) {
        if (token.toUpperCase().includes('PKG') || token.toUpperCase() === 'PROCESS') continue;

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

        if (compUrn) {
          const op = writes.toLowerCase().includes('update') ? 'UPDATE' : 'INSERT';
          addFactAndEvidence(
            ctx,
            compUrn,
            'WRITES_TO',
            tableUrn,
            { operation: op },
            rowStartLine,
            rowEndLine,
            rowStartOffset,
            rowEndOffset,
            rawSnippet,
            'DETERMINISTIC_TABLE'
          );
        }
      }
    }

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
      stepId: rawStepId,
      targetId: target,
      execOrder,
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
 * Handles Cycle parameter bind table: idIdx/bindIdx, typeIdx, optional name.
 */
function handleCycleBindTable(table: Table, roles: TableSchemaRoles, ctx: TraversalContext): void {
  const { idIdx, typeIdx, nameIdx, descIdx } = roles;
  if (idIdx === -1 || typeIdx === -1) return;

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const bindId = cells[idIdx]?.trim();
    const cycleType = cells[typeIdx]?.trim();
    const dictName = nameIdx >= 0 ? cells[nameIdx]?.trim() : (descIdx >= 0 ? cells[descIdx]?.trim() : '');

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
 * Handles Dispatch/Write tables: actionIdx/callIdx, writesIdx.
 * Uses section heading context to dynamically identify the caller SoftwareComponent.
 */
function handleDispatchTable(table: Table, roles: TableSchemaRoles, ctx: TraversalContext): void {
  const { writesIdx } = roles;
  if (writesIdx === -1) return;

  // Derives caller component from current section heading context
  let callerProcUrn: string | null = null;
  for (const h of ctx.headingPath) {
    const tokenMatch = h.match(/`?([A-Za-z0-9_]{3,}\.[A-Za-z0-9_.]+)`?/);
    if (tokenMatch) {
      const normRes = normalizeTechnicalIdentifier(tokenMatch[1]!, 'MAIN1');
      if (!normRes.isQuarantined) {
        callerProcUrn = buildUrn('plsql', 'PLSQL_PROCEDURE', normRes.qualifiedIdentifier);
        break;
      }
    }
  }

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const writes = cells[writesIdx]?.trim();
    if (!writes || writes.toLowerCase() === 'null') continue;

    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    const tableTokens = writes.match(/\b(?:([A-Za-z0-9_]{2,}\.[A-Za-z0-9_]{2,})|((?:TBL|ACC|OPR|CRD|AUT|PRC|FCL|NPS|VIS|MCW|EVT)_[A-Z0-9_]+))\b/gi) || [];
    for (const token of tableTokens) {
      if (token.includes('PKG') || token === 'PROCESS') continue;

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

      if (callerProcUrn) {
        const op = writes.toLowerCase().includes('update') ? 'UPDATE' : 'INSERT';
        addFactAndEvidence(
          ctx,
          callerProcUrn,
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
}

/**
 * Handles status / result code tables.
 */
function handleStatusTable(table: Table, roles: TableSchemaRoles, ctx: TraversalContext): void {
  const { idIdx, nameIdx } = roles;
  if (idIdx === -1 || nameIdx === -1) return;

  for (let r = 1; r < table.children.length; r++) {
    const row = table.children[r]!;
    const cells = getRowCells(row);
    const code = cells[idIdx]?.trim();
    const name = cells[nameIdx]?.trim();
    if (!code || !name) continue;

    if (!code.match(/^(PRSR|EVST|OPST)\d{4}$/i) && code !== 'READY') continue;

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
 * Handles data object description tables whose subject is derived from heading context.
 */
function handleDataObjectsTables(table: Table, ctx: TraversalContext): void {
  const lastHeading = ctx.headingPath[ctx.headingPath.length - 1] || '';
  // Only accept explicit backticked identifiers, schema-qualified tables (e.g. MAIN1.ACC_ENTRY),
  // or known table prefix naming patterns (e.g. TBL_*, ACC_*, OPR_*, CRD_*, AUT_*, PRC_*, FCL_*).
  const match =
    lastHeading.match(/`([^`]+)`/) ||
    lastHeading.match(/\b([A-Za-z0-9_]{2,}\.[A-Za-z0-9_]{2,}(?:\.[A-Za-z0-9_]+)*)\b/) ||
    lastHeading.match(/\b((?:TBL|ACC|OPR|CRD|AUT|PRC|FCL|NPS|VIS|MCW|EVT)_[A-Z0-9_]+)\b/i);
  if (!match) return;

  const rawTable = match[1]!;
  if (['WHAT', 'HOW', 'SAMPLE', 'ONE', 'LAYER', 'ID', 'MAP'].includes(rawTable.toUpperCase())) return;

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

  // Inspect table rows for mentions of procedure packages in 'How built' or descriptions
  const tableRows = table.children.slice(1);
  for (const row of tableRows) {
    const text = getRowCells(row).join(' ');
    const rowStartLine = row.position?.start?.line ?? table.position?.start?.line ?? 1;
    const rowEndLine = row.position?.end?.line ?? table.position?.end?.line ?? rowStartLine;
    const rowStartOffset = row.position?.start?.offset ?? table.position?.start?.offset ?? 0;
    const rowEndOffset = row.position?.end?.offset ?? table.position?.end?.offset ?? 0;
    const rawSnippet = ctx.documentBody.slice(rowStartOffset, rowEndOffset);

    // Look for package procedures, including source prose that abbreviates later calls to an unqualified method.
    const qualifiedProcMatches = text.match(/([A-Z0-9_]+_PKG)\.([A-Z0-9_]+)/gi) || [];
    const packagePrefix = qualifiedProcMatches[0]?.match(/^([A-Z0-9_]+_PKG)\./i)?.[1];
    const procMatches = [...qualifiedProcMatches];
    if (packagePrefix) {
      for (const match of text.matchAll(/\/\s*`?([a-z][a-z0-9_]+)`?/g)) {
        procMatches.push(`${packagePrefix}.${match[1]}`);
      }
    }
    for (const procMatch of procMatches) {
      const procNorm = normalizeTechnicalIdentifier(procMatch, 'MAIN1');
      if (!procNorm.isQuarantined) {
        const procedureKey = procNorm.subObject
          ? `${procNorm.objectName}.${procNorm.subObject}`
          : procNorm.qualifiedIdentifier;
        const procUrn = buildUrn('plsql', 'PLSQL_PROCEDURE', procedureKey);
        addNode(ctx, {
          urn: procUrn,
          kind: 'SoftwareComponent',
          canonicalName: procedureKey,
          sourceSystem: 'plsql',
          nativeType: 'PLSQL_PROCEDURE',
          normalizedKey: procedureKey,
          subkind: 'PLSQL_PROCEDURE',
          properties: {
            schema: procNorm.schema || 'MAIN1',
            package: procNorm.objectName,
            ...(procNorm.subObject ? { procedure: procNorm.subObject } : {}),
          },
          aliases: [procMatch],
        });
        addFactAndEvidence(
          ctx,
          procUrn,
          'READS_FROM',
          tableUrn,
          { operation: 'READ' },
          rowStartLine,
          rowEndLine,
          rowStartOffset,
          rowEndOffset,
          rawSnippet
        );
        addFactAndEvidence(
          ctx,
          procUrn,
          'WRITES_TO',
          tableUrn,
          { operation: 'UPDATE' },
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
 * Extracts DatabaseObject and SoftwareComponent entities from text inside code blocks or inline code spans.
 */
function extractTechnicalEntitiesFromText(
  text: string,
  ctx: TraversalContext,
  _startLine?: number,
  _endLine?: number
): void {
  if (!text || text.trim().length === 0) return;

  // 1. Table patterns: SCHEMA.TBL_[A-Z0-9_]+ or standalone TBL_[A-Z0-9_]+
  const tableRegex = /\b(?:([A-Za-z0-9_]+)\.)?(TBL_[A-Za-z0-9_]+)\b/gi;
  for (const match of text.matchAll(tableRegex)) {
    const raw = match[0];
    const normRes = normalizeTechnicalIdentifier(raw, 'MAIN1');
    if (!normRes.isQuarantined) {
      const tableUrn = buildUrn('oracle', 'ORACLE_TABLE', normRes.qualifiedIdentifier);
      if (!ctx.nodesMap.has(tableUrn)) {
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
          aliases: [raw.toLowerCase()],
        };
        addNode(ctx, dbNode);
      }
    }
  }

  // 2. Package / Procedure patterns:
  // Any dotted technical identifier containing PKG, e.g. SCHEMA.PKG.PROC or PKG.PROC or SCHEMA.PKG
  const pkgProcRegex = /\b[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+\b/g;
  for (const match of text.matchAll(pkgProcRegex)) {
    const raw = match[0];
    if (!raw.toUpperCase().includes('PKG') || raw.toUpperCase().includes('TBL_')) continue;
    const normRes = normalizeTechnicalIdentifier(raw, 'MAIN1');
    if (!normRes.isQuarantined) {
      const procedureKey = normRes.qualifiedIdentifier;
      const procUrn = buildUrn('plsql', 'PLSQL_PROCEDURE', procedureKey);
      if (!ctx.nodesMap.has(procUrn)) {
        const compNode: ResolvedNode = {
          urn: procUrn,
          kind: 'SoftwareComponent',
          canonicalName: procedureKey,
          sourceSystem: 'plsql',
          nativeType: 'PLSQL_PROCEDURE',
          normalizedKey: procedureKey,
          subkind: 'PLSQL_PROCEDURE',
          properties: {
            schema: normRes.schema || 'MAIN1',
            package: normRes.objectName,
            ...(normRes.subObject ? { procedure: normRes.subObject } : {}),
          },
          aliases: [raw.toLowerCase()],
        };
        addNode(ctx, compNode);
      }
    }
  }
}

/**
 * Traverses markdown AST to extract deterministic facts and record consumed ranges.
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

    recordConsumedRange(ctx, startOffset, endOffset, startLine, endLine);

    const header = table.children[0];
    if (header) {
      const headers = getRowCells(header);
      const roles = detectTableSchema(headers);

      if (roles.idIdx !== -1 && roles.nameIdx !== -1 && roles.orderIdx === -1 && roles.isContIdx !== -1) {
        handleProcessTable(table, roles, ctx);
      } else if (roles.orderIdx !== -1 && (roles.idIdx !== -1 || roles.nameIdx !== -1)) {
        handleStepTable(table, roles, ctx);
      } else if (roles.typeIdx !== -1 && roles.idIdx !== -1) {
        handleCycleBindTable(table, roles, ctx);
      } else if (roles.writesIdx !== -1) {
        handleDispatchTable(table, roles, ctx);
      } else if (roles.idIdx !== -1 && roles.nameIdx !== -1 && ctx.headingPath.some((h) => /Result|Status|Trang_thai/i.test(h))) {
        handleStatusTable(table, roles, ctx);
      } else {
        handleDataObjectsTables(table, ctx);
      }
    }
  } else if (node.type === 'code') {
    const codeNode = node as Code;
    const startOffset = codeNode.position?.start?.offset ?? 0;
    const endOffset = codeNode.position?.end?.offset ?? 0;
    const startLine = codeNode.position?.start?.line ?? 1;
    const endLine = codeNode.position?.end?.line ?? 1;
    recordConsumedRange(ctx, startOffset, endOffset, startLine, endLine);

    extractTechnicalEntitiesFromText(codeNode.value, ctx, startLine, endLine);
  } else if (node.type === 'inlineCode') {
    const inlineNode = node as InlineCode;
    const startLine = inlineNode.position?.start?.line ?? 1;
    const endLine = inlineNode.position?.end?.line ?? 1;
    extractTechnicalEntitiesFromText(inlineNode.value, ctx, startLine, endLine);
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
    const body = doc.chunks.map((c) => c.rawContent).join('');
    const ast = parseMarkdownToAst(body);

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
