import { Packer } from 'docx';
import { z } from 'zod';
import { buildPl02Document, type Pl02DocxPayload } from './pl02Docx';

export type WizardDocxKind = 'PL02';

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

const pl02PayloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('PL02'),
  status: z.literal('approved'),
  inputRevision: z.number().int().nonnegative(),
  draftRevision: z.number().int().positive(),
  approvedRevision: z.number().int().positive(),
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

export async function buildWizardDocx(kind: WizardDocxKind, raw: unknown): Promise<Blob> {
  if (kind !== 'PL02') throw new WizardDocxBuildError('WIZARD_DOCX_KIND_UNSUPPORTED');
  const parsed = pl02PayloadSchema.safeParse(raw);
  if (!parsed.success) throw new WizardDocxBuildError('WIZARD_DOCX_PAYLOAD_INVALID');
  const payload: Pl02DocxPayload = parsed.data;
  if (payload.approvedRevision !== payload.draftRevision) {
    throw new WizardDocxBuildError('WIZARD_DOCX_REVISION_STALE');
  }
  return Packer.toBlob(buildPl02Document(payload));
}
