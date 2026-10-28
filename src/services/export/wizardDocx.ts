import { Packer } from 'docx';
import { z } from 'zod';
import { buildPl02Document, type Pl02DocxPayload } from './pl02Docx';
import { buildPl03bDocument, type Pl03bDocxPayload } from './pl03bDocx';
import { ReconciliationResultSchema } from '../wizard/reconciliation';

export type WizardDocxKind = 'PL02' | 'PL03B';

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

export async function buildWizardDocx(kind: WizardDocxKind, raw: unknown): Promise<Blob> {
  const schemas = { PL02: pl02PayloadSchema, PL03B: pl03bPayloadSchema } as const;
  const schema = schemas[kind];
  if (!schema) throw new WizardDocxBuildError('WIZARD_DOCX_KIND_UNSUPPORTED');
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new WizardDocxBuildError('WIZARD_DOCX_PAYLOAD_INVALID');
  const payload = parsed.data;
  if (payload.approvedRevision !== payload.draftRevision) {
    throw new WizardDocxBuildError('WIZARD_DOCX_REVISION_STALE');
  }
  if (payload.kind === 'PL02') return Packer.toBlob(buildPl02Document(payload as Pl02DocxPayload));
  return Packer.toBlob(buildPl03bDocument(payload as Pl03bDocxPayload));
}
