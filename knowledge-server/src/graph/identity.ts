import { sha256Hex } from '../indexing/chunkHashPolicy.js';
import {
  Urn,
  UrnSchema,
  FactKey,
  RelationType,
  RelationTypeSchema,
} from '../types/graphProtocol.js';
import { RELATION_QUALIFIER_ALLOWLIST, ONTOLOGY_VERSION } from './ontology.js';

/**
 * Encodes a string segment for safe inclusion in a URN.
 * Standard RFC 2141 / RFC 8141 URN characters allowed: a-zA-Z0-9()+,-.:=@;$_!*'
 * Percent-encodes characters that violate URN syntax.
 */
function encodeUrnSegment(str: string): string {
  return str.replace(/[^a-zA-Z0-9_.~%-]/g, (char) => {
    return encodeURIComponent(char);
  });
}

/**
 * Builds a collision-safe URN per D-05, D-06, D-07:
 * Format: urn:plannermate:<sourceSystem>:<nativeType>:<normalizedKey>[:<segments>...]
 *
 * Environment (SIT/UAT/PROD) is strictly EXCLUDED (evidence metadata only).
 */
export function buildUrn(
  sourceSystem: string,
  nativeType: string,
  normalizedKey: string,
  segments: readonly string[] = []
): Urn {
  const normSystem = sourceSystem.trim().toLowerCase();
  const normType = nativeType.trim();
  const normKey = encodeUrnSegment(normalizedKey.trim());

  let urnStr = `urn:plannermate:${normSystem}:${normType}:${normKey}`;
  if (segments.length > 0) {
    const encodedSegments = segments.map((seg) => encodeUrnSegment(seg.trim())).join(':');
    urnStr += `:${encodedSegments}`;
  }

  // Validate against schema
  return UrnSchema.parse(urnStr);
}

export interface ParsedUrn {
  sourceSystem: string;
  nativeType: string;
  normalizedKey: string;
  segments: string[];
}

/**
 * Parses a PlannerMate URN into component parts.
 */
export function parseUrn(urn: string): ParsedUrn {
  const parsed = UrnSchema.parse(urn);
  const parts = parsed.split(':');
  if (parts.length < 5 || parts[0] !== 'urn' || parts[1] !== 'plannermate') {
    throw new Error(`Invalid PlannerMate URN structure: ${urn}`);
  }

  const sourceSystem = parts[2]!;
  const nativeType = parts[3]!;
  const normalizedKey = decodeURIComponent(parts[4]!);
  const segments = parts.slice(5).map((s) => decodeURIComponent(s));

  return {
    sourceSystem,
    nativeType,
    normalizedKey,
    segments,
  };
}

export interface TechnicalIdentifierResult {
  qualifiedIdentifier: string;
  schema?: string;
  objectName: string;
  subObject?: string;
  isQuarantined: boolean;
  quarantineReason?: string;
}

/**
 * Normalizes technical identifiers (tables, packages, procedures, sequences) per D-08, D-16.
 *
 * Rules:
 * 1. Strips markdown backticks and trims whitespace.
 * 2. Unquoted Oracle tokens are uppercased.
 * 3. Preserves qualification dots (e.g. SCHEMA.PACKAGE.PROCEDURE or SCHEMA.TABLE).
 * 4. If identifier is unqualified and defaultSchema is provided, prepends defaultSchema.
 * 5. If identifier is unqualified and defaultSchema is NOT provided, flags quarantine per D-08, D-16.
 */
export function normalizeTechnicalIdentifier(
  raw: string,
  defaultSchema?: string
): TechnicalIdentifierResult {
  // Strip markdown formatting: backticks, bold, italic
  let cleaned = raw.replace(/[`*_]/g, (match, offset, full) => {
    // Keep internal underscores in SQL identifiers like FCL_CYCLE_COUNTER
    if (match === '`' || match === '*') return '';
    // If underscore is at edges, strip it; otherwise keep
    if (offset === 0 || offset === full.length - 1) return '';
    return match;
  }).trim();

  if (!cleaned) {
    return {
      qualifiedIdentifier: '',
      objectName: '',
      isQuarantined: true,
      quarantineReason: 'Empty identifier',
    };
  }

  const parts = cleaned.split('.').map((p) => p.trim());
  const normalizedParts = parts.map((part) => {
    // If enclosed in double quotes (Oracle quoted identifier), keep case; otherwise uppercase
    if (part.startsWith('"') && part.endsWith('"')) {
      return part.slice(1, -1);
    }
    return part.toUpperCase();
  });

  if (normalizedParts.length >= 2) {
    const schema = normalizedParts[0]!;
    const objectName = normalizedParts[1]!;
    const subObject = normalizedParts.slice(2).join('.');
    const qualified = normalizedParts.join('.');
    return {
      qualifiedIdentifier: qualified,
      schema,
      objectName,
      ...(subObject ? { subObject } : {}),
      isQuarantined: false,
    };
  }

  // Single unqualified part
  const singlePart = normalizedParts[0]!;
  if (defaultSchema && defaultSchema.trim()) {
    const normSchema = defaultSchema.trim().toUpperCase();
    return {
      qualifiedIdentifier: `${normSchema}.${singlePart}`,
      schema: normSchema,
      objectName: singlePart,
      isQuarantined: false,
    };
  }

  // Unqualified and no defaultSchema provided -> Quarantine per D-08 & D-16
  return {
    qualifiedIdentifier: singlePart,
    objectName: singlePart,
    isQuarantined: true,
    quarantineReason: 'Unqualified identifier without proven default schema context',
  };
}

export interface FactKeyInput {
  ontologyVersion: string;
  subjectUrn: string;
  relation: RelationType | string;
  objectUrn: string;
  qualifiers?: Record<string, string>;
}

/**
 * Computes deterministic semantic factKey per D-14, D-15.
 *
 * Generates SHA-256 of canonical JSON array:
 * [ontologyVersion, subjectUrn, relation, objectUrn, sortedAllowedQualifiers]
 *
 * Evidence fields (documents, line numbers, extraction methods, confidence, classification)
 * are strictly EXCLUDED from factKey calculation (D-14).
 *
 * Only qualifiers in RELATION_QUALIFIER_ALLOWLIST for this relation are included (D-15).
 */
export function buildFactKey(input: FactKeyInput): FactKey {
  const version = input.ontologyVersion.trim() || ONTOLOGY_VERSION;
  const subject = input.subjectUrn.trim();
  const rel = RelationTypeSchema.parse(input.relation.trim());
  const object = input.objectUrn.trim();

  // Filter qualifiers through allow-list and normalize/sort
  const allowList = RELATION_QUALIFIER_ALLOWLIST[rel] || [];
  const rawQualifiers = input.qualifiers || {};

  const filteredEntries: [string, string][] = [];
  for (const key of allowList) {
    if (Object.prototype.hasOwnProperty.call(rawQualifiers, key)) {
      const val = rawQualifiers[key];
      if (val !== undefined && val !== null) {
        filteredEntries.push([key, String(val).trim()]);
      }
    }
  }

  // Sort deterministically by qualifier key
  filteredEntries.sort(([k1], [k2]) => k1.localeCompare(k2));

  // Canonical JSON array
  const canonicalArray = [version, subject, rel, object, filteredEntries];
  const canonicalJson = JSON.stringify(canonicalArray);

  return sha256Hex(canonicalJson);
}
