import { z } from 'zod';
import { isValidUuid } from '../utils/uuid';

/**
 * Zod boundary schemas for the AI Office entities (Phase 34).
 *
 * Mirrors the `SystemInputSchema` / `SystemUpdateSchema` pair convention in
 * `src/validation/schemas.ts`: the `*Input` variant is the create payload (repo
 * generates `id`/`createdAt`/`updatedAt`), the `*Update` variant is all-optional.
 *
 * Length caps come from the UI-SPEC: name 60, role 60, capability 300, skill
 * description 300. `skillId` is a scalar so "at most one skill per agent" (D-25)
 * is structural rather than a runtime check.
 */

const uuidSchema = z.string().refine(isValidUuid, {
  message: 'Must be a valid RFC 4122 v4 UUID',
});

const nameSchema = z.string().trim().min(1, 'Name is required').max(60, 'Name must be 60 characters or less');
const roleSchema = z.string().trim().min(1, 'Role is required').max(60, 'Role must be 60 characters or less');
const capabilitySchema = z
  .string()
  .trim()
  .min(1, 'Capability is required')
  .max(300, 'Capability must be 300 characters or less');
const personaSchema = z.string().trim().min(1, 'Persona is required');
const modelSchema = z.string().trim().min(1, 'Model is required');
const skillDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(300, 'Description must be 300 characters or less');
const budgetSchema = z.number().int().nonnegative('Budget must be zero or greater');

const AiTeamStatusSchema = z.enum(['active', 'idle']);
const AiTeamMemberRoleSchema = z.enum(['lead', 'employee']);
const AiTeamLinkItemTypeSchema = z.enum(['cr', 'task', 'system', 'note', 'document']);

export const AiEmployeeInputSchema = z.object({
  name: nameSchema,
  role: roleSchema,
  capability: capabilitySchema,
  persona: personaSchema,
  model: modelSchema,
  skillId: uuidSchema.optional(),
});

export const AiEmployeeUpdateSchema = z.object({
  name: nameSchema.optional(),
  role: roleSchema.optional(),
  capability: capabilitySchema.optional(),
  persona: personaSchema.optional(),
  model: modelSchema.optional(),
  skillId: uuidSchema.nullable().optional(),
});

export const AiLeadInputSchema = z.object({
  name: nameSchema,
  role: roleSchema,
  capability: capabilitySchema,
  persona: personaSchema,
  model: modelSchema,
});

export const AiLeadUpdateSchema = z.object({
  name: nameSchema.optional(),
  role: roleSchema.optional(),
  capability: capabilitySchema.optional(),
  persona: personaSchema.optional(),
  model: modelSchema.optional(),
});

export const AiSkillInputSchema = z.object({
  name: nameSchema,
  description: skillDescriptionSchema,
  body: z.string().trim().min(1, 'Body is required'),
});

export const AiSkillUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: skillDescriptionSchema.optional(),
  body: z.string().trim().min(1, 'Body is required').optional(),
});

export const AiTeamInputSchema = z.object({
  name: nameSchema,
  leadId: uuidSchema,
  status: AiTeamStatusSchema.default('active'),
  budgetTokens: budgetSchema,
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
});

export const AiTeamUpdateSchema = z.object({
  name: nameSchema.optional(),
  leadId: uuidSchema.optional(),
  status: AiTeamStatusSchema.optional(),
  budgetTokens: budgetSchema.optional(),
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
});

export const AiTeamMemberInputSchema = z.object({
  teamId: uuidSchema,
  agentId: uuidSchema,
  role: AiTeamMemberRoleSchema,
  budgetTokens: budgetSchema,
  usedTokens: budgetSchema.default(0),
});

export const AiTeamLinkInputSchema = z.object({
  teamId: uuidSchema,
  itemType: AiTeamLinkItemTypeSchema,
  itemId: uuidSchema,
});

/** Phase 36 (D-16, D-22): defined once and reused by the backup record schema. */
export const AiSkillVersionStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const AiSkillVersionInputSchema = z.object({
  skillId: uuidSchema,
  status: AiSkillVersionStatusSchema.default('pending'),
  name: nameSchema,
  description: skillDescriptionSchema,
  body: z.string().trim().min(1, 'Body is required'),
  evidence: z.string().optional(),
});

export type AiEmployeeInput = z.infer<typeof AiEmployeeInputSchema>;
export type AiEmployeeUpdate = z.infer<typeof AiEmployeeUpdateSchema>;
export type AiLeadInput = z.infer<typeof AiLeadInputSchema>;
export type AiLeadUpdate = z.infer<typeof AiLeadUpdateSchema>;
export type AiSkillInput = z.infer<typeof AiSkillInputSchema>;
export type AiSkillUpdate = z.infer<typeof AiSkillUpdateSchema>;
export type AiTeamInput = z.infer<typeof AiTeamInputSchema>;
export type AiTeamUpdate = z.infer<typeof AiTeamUpdateSchema>;
export type AiTeamMemberInput = z.infer<typeof AiTeamMemberInputSchema>;
export type AiTeamLinkInput = z.infer<typeof AiTeamLinkInputSchema>;
export type AiSkillVersionInput = z.infer<typeof AiSkillVersionInputSchema>;
