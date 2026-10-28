import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const uiSpec = fs.readFileSync(
  path.resolve('.planning/phases/25-interactive-sdlc-document-wizards/25-UI-SPEC.md'),
  'utf8'
);
const fixture = JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/wizard-reference.json'), 'utf8')
) as { cases: Array<{ id: string; inputs: Record<string, unknown>; expected: Record<string, unknown> }> };

describe('document wizard UI contract scaffold', () => {
  it('pins entry, review, export, skip, and lifecycle copy before components exist', () => {
    for (const copy of [
      'Soạn PL02',
      'Soạn PL03',
      'Checklist PL07',
      'Tờ trình CAB',
      'Bắt đầu soạn thảo',
      'Bỏ qua mục này',
      'Duyệt & Tải .docx',
      'Yêu cầu chỉnh sửa thêm',
      'Lưu SOLUTION.md',
      'Hủy Wizard',
    ]) {
      expect(uiSpec).toContain(copy);
    }
  });

  it('pins F16 actual-app lifecycle and truthful split outcomes', () => {
    const f16 = fixture.cases.find(({ id }) => id === 'F16');
    expect(f16?.inputs.flow).toEqual([
      'chip', 'metadata', 'questions', 'skip', 'preview', 'edit',
      'approval', 'save', 'pack', 'export', 'cancel', 'reopen',
    ]);
    expect(f16?.expected.effects).toEqual(expect.arrayContaining([
      'keyboard-usable',
      'truthful-download-save-outcomes',
      'retain-draft',
      'no-duplicates',
    ]));
  });
});

describe('document wizard component producer contracts', () => {
  it.todo('renders project-scoped skill chips with keyboard traversal and metadata validation');
  it.todo('renders gap cards where skip remains unknown and answered cards collapse');
  it.todo('keeps historical preview immutable when user requests another edit');
  it.todo('renders saved Note and download outcomes separately without false success');
  it.todo('restores or cancels a draft without deleting exported artifacts');
});
