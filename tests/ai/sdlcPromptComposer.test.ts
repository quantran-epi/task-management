import { describe, expect, it } from 'vitest';
import {
  SDLC_ARTIFACT_CONTRACTS,
  SDLC_FEW_SHOT_EXAMPLES,
  SDLCS_STEP_CONTRACTS,
  SHARED_EVIDENCE_POLICY,
  STEP_LABELS,
  STEP_QUICK_PROMPTS,
} from '../../src/services/ai/sdlcPromptComposer';

const STEP_IDS = [
  'INTAKE',
  'SOLUTION',
  'CODE_GUIDE',
  'CHANGE_PACK',
  'TECH_DOCS',
  'CAB',
] as const;

describe('SDLC shared evidence policy (D-07, D-08)', () => {
  it('forbids invention, source conflicts, untrusted data as instructions, and approval claims', () => {
    expect(SHARED_EVIDENCE_POLICY).toContain('Không bịa đặt');
    expect(SHARED_EVIDENCE_POLICY).toContain('mâu thuẫn');
    expect(SHARED_EVIDENCE_POLICY).toContain('KHÔNG TIN CẬY');
    expect(SHARED_EVIDENCE_POLICY).toContain('phê duyệt');
    expect(SHARED_EVIDENCE_POLICY).toContain(
      'Không tạo bảng drift hoặc so sánh SOLUTION.md trong PL03B; mọi đối soát drift chỉ diễn ra trong TaskMate.'
    );
  });
});

describe('SDLC step contracts (D-10 through D-15)', () => {
  it('covers exactly the six SDLC steps', () => {
    expect(Object.keys(SDLCS_STEP_CONTRACTS).sort()).toEqual([...STEP_IDS].sort());
  });

  it('treats step 3 as an external coding handoff, not code executed by TaskMate', () => {
    const contract = SDLCS_STEP_CONTRACTS.CODE_GUIDE;
    expect(contract).toContain('node scripts/change-pack.mjs --cr <CR>');
    expect(contract).toContain('ngoài TaskMate');
    expect(contract).toContain('không');
  });

  it('keeps PL03B actual-implementation-only and PL07 verdict-free', () => {
    const contract = SDLCS_STEP_CONTRACTS.TECH_DOCS;
    expect(contract).toContain(
      'PL03B chỉ mô tả hệ thống đã triển khai thực tế theo bằng chứng Change Pack đã xác thực; KHÔNG có bảng drift và KHÔNG có phần so sánh với SOLUTION.md.'
    );
    expect(contract).toContain('PL07');
    expect(contract).toContain('Không gán PASS/FAIL/NOT-VERIFIED');
  });

  it('restricts CAB GoLive content to implemented evidence and forbids verified-rollback claims', () => {
    const contract = SDLCS_STEP_CONTRACTS.CAB;
    expect(contract).toContain('đã triển khai thực tế');
    expect(contract).toContain('rollback đã được kiểm chứng');
    expect(contract).toContain('loại trừ');
  });

  it('moves quick prompts away from PL03B-vs-SOLUTION comparison and production risk assertions', () => {
    const techDocs = STEP_QUICK_PROMPTS.TECH_DOCS.join(' ');
    const cab = STEP_QUICK_PROMPTS.CAB.join(' ');
    expect(techDocs).not.toMatch(/(khớp|so sánh).{0,40}SOLUTION/i);
    expect(techDocs).not.toMatch(/SOLUTION.{0,40}(khớp|so sánh)/i);
    expect(cab).not.toMatch(/rủi ro triển khai production/i);
    expect(STEP_QUICK_PROMPTS.TECH_DOCS.length).toBeGreaterThan(0);
    expect(STEP_QUICK_PROMPTS.CAB.length).toBeGreaterThan(0);
  });

  it('provides Vietnamese labels for each step', () => {
    expect(STEP_LABELS.INTAKE).toBe('1. Hồ sơ đầu vào');
    expect(STEP_LABELS.SOLUTION).toBe('2. Thiết kế giải pháp');
    expect(STEP_LABELS.CODE_GUIDE).toBe('3. Coding ngoài');
    expect(STEP_LABELS.CHANGE_PACK).toBe('4. Kiểm soát Change Pack');
    expect(STEP_LABELS.TECH_DOCS).toBe('5. Tài liệu kỹ thuật');
    expect(STEP_LABELS.CAB).toBe('6. Tờ trình CAB');
  });
});

describe('SDLC few-shot exemplars and artifact contracts (D-08, D-09, D-16)', () => {
  it('has at least one exemplar per step and none invents evidence, approvals, or verdicts', () => {
    for (const step of STEP_IDS) {
      const examples = SDLC_FEW_SHOT_EXAMPLES[step];
      expect(examples.length).toBeGreaterThan(0);
      const text = examples.map((e) => `${e.user}\n${e.assistant}`).join('\n');
      expect(text).not.toMatch(/PASS|FAIL|NOT-VERIFIED/);
      expect(text).not.toMatch(/đã (được )?phê duyệt/i);
      expect(text).not.toMatch(/đã (chạy|kiểm chứng) (thành công|rollback)/i);
    }
  });

  it('defines the four artifact output contracts as complete drafts', () => {
    expect(Object.keys(SDLC_ARTIFACT_CONTRACTS).sort()).toEqual([
      'CAB',
      'PL03B',
      'PL07',
      'SOLUTION',
    ]);
    for (const contract of Object.values(SDLC_ARTIFACT_CONTRACTS)) {
      expect(contract).toContain('đầy đủ');
      expect(contract).toContain('bản nháp');
    }
  });
});
