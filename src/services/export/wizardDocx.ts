import { Packer } from 'docx';
import { z } from 'zod';
import { buildPl02Document, type Pl02DocxPayload } from './pl02Docx';
import { buildPl03bDocument, type Pl03bDocxPayload } from './pl03bDocx';
import { buildPl07Document, type Pl07DocxPayload } from './pl07Docx';
import { buildCabDocument, type CabDocxPayload } from './cabDocx';
import { ReconciliationResultSchema } from '../wizard/reconciliation';

export type WizardDocxKind = 'PL02' | 'PL03B' | 'PL07' | 'CAB';

export class WizardDocxBuildError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'WizardDocxBuildError';
  }
}

const metadataSchema = z.strictObject({
  crCode: z.string().trim().min(1),
  featureName: z.string().trim().min(1),
  requestingUnit: z.string(),
  author: z.string().trim().min(1),
  createdDate: z.string().trim().min(1),
});
const fileLayoutSchema = z.strictObject({
  column: z.string(),
  format: z.string(),
  required: z.string(),
  description: z.string(),
});
const inputRuleSchema = z.strictObject({ field: z.string(), rule: z.string() });
const flowStepSchema = z.strictObject({
  actor: z.string(),
  target: z.string(),
  action: z.string(),
});
const featureSchema = z.strictObject({
  name: z.string().trim().min(1),
  description: z.string(),
  formName: z.string().optional(),
  application: z.string().optional(),
  approvalRequirement: z.string().optional(),
  targetTable: z.string().optional(),
  templateImageDescription: z.string().optional(),
  fileLayout: z.array(fileLayoutSchema),
  inputRules: z.array(inputRuleSchema),
  processingRules: z.array(z.string()),
  flowSteps: z.array(flowStepSchema),
});

const approvedEnvelopeSchema = {
  schemaVersion: z.literal(1),
  status: z.literal('approved'),
  inputRevision: z.number().int().nonnegative(),
  draftRevision: z.number().int().positive(),
  approvedRevision: z.number().int().positive(),
};

const pl02PayloadSchema = z.strictObject({
  ...approvedEnvelopeSchema,
  kind: z.literal('PL02'),
  metadata: metadataSchema,
  introduction: z.strictObject({
    purpose: z.string(),
    users: z.string(),
    deploymentScope: z.string(),
    risks: z.array(z.strictObject({
      type: z.string(),
      description: z.string(),
      mitigation: z.string(),
      owner: z.string(),
    })),
    glossary: z.array(z.strictObject({
      abbreviation: z.string(),
      explanation: z.string(),
    })),
  }),
  features: z.array(featureSchema),
  permissions: z.array(z.string()),
  notifications: z.array(z.strictObject({
    content: z.string(),
    push: z.string(),
    m4u: z.string(),
  })),
  apiContracts: z.array(z.strictObject({
    field: z.string(),
    dataType: z.string(),
    description: z.string(),
  })),
  staffing: z.array(z.strictObject({
    workItem: z.string(),
    fromDate: z.string(),
    toDate: z.string(),
    businessOwner: z.string(),
    deliveryOwner: z.string(),
  })),
});

const pl03bApiSchema = z.strictObject({
  method: z.string(),
  path: z.string(),
  description: z.string(),
  request: z.array(z.strictObject({ field: z.string(), dataType: z.string(), description: z.string() })),
  response: z.array(z.strictObject({ field: z.string(), dataType: z.string(), description: z.string() })),
});
const pl03bPayloadSchema = z.strictObject({
  ...approvedEnvelopeSchema,
  kind: z.literal('PL03B'),
  metadata: z.strictObject({
    crCode: z.string().trim().min(1),
    featureName: z.string().trim().min(1),
    author: z.string().trim().min(1),
    createdDate: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }),
  introduction: z.strictObject({
    purpose: z.string(), users: z.string(), databases: z.array(z.string()), k8sServices: z.array(z.string()),
  }),
  technical: z.strictObject({
    overview: z.string(),
    techStack: z.string(),
    flows: z.array(z.strictObject({ name: z.string(), steps: z.array(flowStepSchema) })),
    services: z.array(z.strictObject({ name: z.string(), sourceCode: z.string().optional(), apis: z.array(pl03bApiSchema) })),
    databases: z.array(z.strictObject({
      name: z.string(), description: z.string(),
      columns: z.array(z.strictObject({ column: z.string(), dataType: z.string(), description: z.string() })),
    })),
    integrations: z.array(z.strictObject({ name: z.string(), method: z.string(), path: z.string(), description: z.string() })),
    notifications: z.array(z.strictObject({ code: z.string(), name: z.string(), channel: z.string() })),
  }),
  reconciliation: ReconciliationResultSchema,
});

const pl07MarkSchema = z.strictObject({
  sectionId: z.enum(['I', 'II', 'III', 'IV', 'V']),
  itemNumber: z.string().trim().min(1),
  status: z.enum(['pass', 'fail', 'not_applicable', 'unknown']),
  evidenceIds: z.array(z.string().trim().min(1)),
  note: z.string(),
}).superRefine((mark, ctx) => {
  if ((mark.status === 'pass' || mark.status === 'not_applicable') && mark.evidenceIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['evidenceIds'], message: 'PL07_POSITIVE_STATUS_REQUIRES_EVIDENCE' });
  }
});
const pl07PayloadSchema = z.strictObject({
  ...approvedEnvelopeSchema,
  kind: z.literal('PL07'),
  metadata: z.strictObject({
    applicationName: z.string().trim().min(1),
    applicationVersion: z.string(),
    summary: z.string(),
    reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    developer: z.string(),
    approver: z.string(),
  }),
  marks: z.array(pl07MarkSchema),
  findings: z.array(z.strictObject({
    number: z.string().trim().min(1),
    text: z.string().trim().min(1),
    evidenceIds: z.array(z.string().trim().min(1)).min(1),
    file: z.string().trim().min(1),
    hunk: z.string().trim().min(1),
  })),
});

const cabSourceSchema = z.strictObject({
  kind: z.enum(['PL02', 'PL03B', 'PL07']),
  artifactId: z.string().uuid(),
  version: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  approved: z.boolean(),
});
const cabPayloadSchema = z.strictObject({
  ...approvedEnvelopeSchema,
  kind: z.literal('CAB'),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  sourceArtifactIds: z.object({ PL02: z.string().uuid(), PL03B: z.string().uuid(), PL07: z.string().uuid() }),
  sources: z.array(cabSourceSchema).length(3),
  expectedVersions: z.object({ PL02: z.number().int().positive(), PL03B: z.number().int().positive(), PL07: z.number().int().positive() }),
  expectedHashes: z.object({ PL02: z.string().regex(/^[a-f0-9]{64}$/), PL03B: z.string().regex(/^[a-f0-9]{64}$/), PL07: z.string().regex(/^[a-f0-9]{64}$/) }),
  title: z.string().trim().min(1).max(200),
  contextObjective: z.string().max(4000),
  businessChanges: z.array(z.string().max(600)).max(12),
  technicalChanges: z.array(z.string().max(600)).max(12),
  sit: z.string().max(4000).nullable(),
  uat: z.string().max(4000).nullable(),
  risks: z.array(z.string().max(1000)).max(50),
  unresolvedDrift: z.array(z.string().max(1000)).max(50),
  rollback: z.strictObject({ summary: z.string().max(2000), verified: z.boolean() }),
  caveats: z.array(z.string().max(1000)).max(50),
});

function validateCabSources(payload: z.infer<typeof cabPayloadSchema>): void {
  const kinds = new Set(['PL02', 'PL03B', 'PL07']);
  if (payload.sources.some((source) => {
    if (!kinds.delete(source.kind)) return true;
    return source.projectId !== payload.projectId
      || source.threadId !== payload.threadId
      || !source.approved
      || source.artifactId !== payload.sourceArtifactIds[source.kind]
      || source.version !== payload.expectedVersions[source.kind]
      || source.hash !== payload.expectedHashes[source.kind];
  }) || kinds.size !== 0) {
    throw new WizardDocxBuildError('WIZARD_DOCX_CAB_SOURCE_INVALID');
  }
}

export async function buildWizardDocx(kind: WizardDocxKind, raw: unknown): Promise<Blob> {
  const schemas = { PL02: pl02PayloadSchema, PL03B: pl03bPayloadSchema, PL07: pl07PayloadSchema, CAB: cabPayloadSchema } as const;
  const schema = schemas[kind];
  if (!schema) throw new WizardDocxBuildError('WIZARD_DOCX_KIND_UNSUPPORTED');
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new WizardDocxBuildError('WIZARD_DOCX_PAYLOAD_INVALID');
  const payload = parsed.data;
  if (payload.approvedRevision !== payload.draftRevision) {
    throw new WizardDocxBuildError('WIZARD_DOCX_REVISION_STALE');
  }
  if (payload.kind === 'PL02') return Packer.toBlob(buildPl02Document(payload as Pl02DocxPayload));
  if (payload.kind === 'PL03B') return Packer.toBlob(buildPl03bDocument(payload as Pl03bDocxPayload));
  if (payload.kind === 'PL07') return Packer.toBlob(buildPl07Document(payload as Pl07DocxPayload));
  validateCabSources(payload);
  return Packer.toBlob(buildCabDocument(payload as CabDocxPayload));
}
