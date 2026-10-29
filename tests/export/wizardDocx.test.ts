import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildPl02Document, type Pl02DocxPayload } from '../../src/services/export/pl02Docx';
import { buildPl03bDocument, type Pl03bDocxPayload } from '../../src/services/export/pl03bDocx';
import { PL07_BASELINE, PL07_BASELINE_SOURCE_SHA256 } from '../../src/services/export/pl07Baseline';
import { buildPl07Document, type Pl07DocxPayload } from '../../src/services/export/pl07Docx';
import { buildWizardDocx } from '../../src/services/export/wizardDocx';
import { createWizardCoordinator } from '../../src/services/wizard/wizardCoordinator';
import { downloadBlob } from '../../src/utils/fileExport';
import type { ChatMessage, Note } from '../../src/types/models';

const root = resolve(import.meta.dirname, '../..');
const manifestPath = resolve(root, 'tests/fixtures/ai/pl-template-manifest.json');
const baselinePath = resolve(root, 'tests/fixtures/ai/pl07-baseline.json');
const structureKeys = ['pl02', 'pl03b', 'pl07'] as const;

type Manifest = {
  schemaVersion: number;
  extractionVersion: string;
  templates: Record<string, { path: string; sha256: string; sizeBytes: number }>;
};

type Baseline = {
  sourcePath: string;
  sourceSha256: string;
  extractionVersion: string;
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      number: string;
      text: string;
      subItems?: Array<{ number: string; text: string }>;
    }>;
  }>;
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

describe('wizard source fixtures', () => {
  it('pins exactly three source templates with byte hashes and sizes', async () => {
    const manifest = await readJson<Manifest>(manifestPath);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.extractionVersion).toMatch(/^ooXML-/);
    expect(Object.keys(manifest.templates).sort()).toEqual([...structureKeys].sort());

    for (const key of structureKeys) {
      const entry = manifest.templates[key];
      expect(entry).toBeDefined();
      if (!entry) throw new Error(`Missing manifest template: ${key}`);
      expect(entry.path).toMatch(/^docs\/pl-templates\/.+\.docx$/);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
      const sourcePath = resolve(root, entry.path);
      expect(await sha256(sourcePath)).toBe(entry.sha256);
      expect((await readFile(sourcePath)).byteLength).toBe(entry.sizeBytes);
    }
  });

  it('keeps PL07 sections I-V and II.5 sub-items verbatim and excludes generated VI', async () => {
    const manifest = await readJson<Manifest>(manifestPath);
    const baseline = await readJson<Baseline>(baselinePath);
    const pl07 = manifest.templates.pl07;
    expect(pl07).toBeDefined();
    if (!pl07) throw new Error('Missing PL07 manifest template');
    expect(baseline.sourcePath).toBe(pl07.path);
    expect(baseline.sourceSha256).toBe(pl07.sha256);
    expect(baseline.extractionVersion).toBe(manifest.extractionVersion);
    expect(baseline.sections.map(section => section.id)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(baseline.sections.some(section => section.id === 'VI')).toBe(false);

    const passwordSection = baseline.sections.find(section => section.id === 'II');
    const passwordPolicy = passwordSection?.items.find(item => item.number === '5');
    expect(passwordPolicy?.subItems).toEqual([
      { number: 'a', text: '- Độ dài mật khẩu tối thiểu là 7 ký tự.' },
      { number: 'b', text: '- Độ phức tạp của mật khẩu: Bao gồm các ký tự số, chữ và các ký tự đặc biệt khác.' },
      { number: 'c', text: '- Không hiển thị mật khẩu người dùng dưới dạng clear-text khi đăng nhập.' },
      { number: 'd', text: '- Khi người dùng nhập sai quá 3 lần phải yêu cầu nhập captcha trước khi đăng nhập, và sai quá 5 lần sẽ khóa tài khoản trong vòng 15 phút.' },
    ]);
    expect(baseline.sections.reduce((count, section) => count + section.items.length, 0)).toBe(27);
  });

  it('keeps each observed structure fixture tied to its source hash', async () => {
    const manifest = await readJson<Manifest>(manifestPath);
    for (const key of structureKeys) {
      const fixture = await readJson<{
        sourcePath: string;
        sourceSha256: string;
        sectionOrder: string[];
        tables: Array<{ columnCount: number; headerText: string[]; mergeSpans: number[] }>;
        numbering: { definitions: unknown[] };
        pageMargins: Record<string, number>;
        headers: unknown[];
        footers: unknown[];
        toc: { present: boolean };
        revisionTable: { present: boolean; columns: string[] };
        signature: { present: boolean };
        resolvedFindings: string[];
      }>(resolve(root, `tests/fixtures/docx/${key}-structure.json`));
      const entry = manifest.templates[key];
      expect(entry).toBeDefined();
      if (!entry) throw new Error(`Missing manifest template: ${key}`);
      expect(fixture.sourcePath).toBe(entry.path);
      expect(fixture.sourceSha256).toBe(entry.sha256);
      expect(fixture.sectionOrder.length).toBeGreaterThan(0);
      expect(fixture.tables.length).toBeGreaterThan(0);
      expect(fixture.tables.every(table => table.columnCount > 0)).toBe(true);
      expect(fixture.numbering.definitions.length).toBeGreaterThan(0);
      expect(Object.keys(fixture.pageMargins)).toEqual(expect.arrayContaining(['top', 'right', 'bottom', 'left']));
      expect(fixture.headers.length).toBeGreaterThan(0);
      expect(fixture.footers.length).toBeGreaterThan(0);
      expect(fixture.resolvedFindings.length).toBeGreaterThan(0);
    }
  });

  describe('PL02 dedicated builder', () => {
    const approvedPayload: Pl02DocxPayload = {
      schemaVersion: 1,
      kind: 'PL02',
      status: 'approved',
      inputRevision: 3,
      draftRevision: 2,
      approvedRevision: 2,
      metadata: {
        crCode: 'CR_ĐIỀU_CHỈNH_537962',
        featureName: 'Quản lý spending limit thẻ TDDN',
        requestingUnit: 'Khối Ngân hàng số',
        author: 'Nguyễn Văn A',
        createdDate: '2026-10-28',
      },
      introduction: {
        purpose: 'Điều chỉnh MA_CTUD và TRANG_THAI_CT theo yêu cầu nghiệp vụ.',
        users: 'User maker và User checker',
        deploymentScope: 'Portal doanh nghiệp',
        risks: [{
          type: 'Rủi ro dữ liệu',
          description: 'Sai hạn mức',
          mitigation: 'Đối soát trước ghi nhận',
          owner: 'Đơn vị vận hành',
        }],
        glossary: [{ abbreviation: 'TDDN', explanation: 'Thẻ doanh nghiệp' }],
      },
      features: [{
        name: 'Upload spending limit',
        description: 'Portal => Tiện ích => Quản lý thẻ => Thêm mới',
        formName: 'Biểu mẫu hạn mức',
        application: 'PORTAL_TDDN',
        approvalRequirement: 'Maker-checker',
        targetTable: 'SPENDING_LIMIT',
        fileLayout: [{
          column: 'MA_CTUD',
          format: 'VARCHAR2(20)',
          required: 'Có',
          description: 'Mã chương trình ưu đãi',
        }],
        inputRules: [{ field: 'MA_CTUD', rule: 'Không được để trống' }],
        processingRules: ['Hệ thống check MA_CTUD.', 'Chặn không cho upload khi dữ liệu sai.'],
        flowSteps: [
          { actor: 'User maker', target: 'Portal', action: 'Tải biểu mẫu' },
          { actor: 'Portal', target: 'Core', action: 'Ghi nhận TRANG_THAI_CT' },
        ],
      }],
      permissions: ['User maker', 'User checker'],
      notifications: [{ content: 'Thông báo hoàn tất', push: 'Có', m4u: 'Không' }],
      apiContracts: [{
        field: 'TRANG_THAI_CT',
        dataType: 'VARCHAR2',
        description: 'Trạng thái chứng từ',
      }],
      staffing: [{
        workItem: 'Phát triển và kiểm thử',
        fromDate: '2026-10-29',
        toDate: '2026-11-05',
        businessOwner: 'Khối Ngân hàng số',
        deliveryOwner: 'Trung tâm CNTT',
      }],
    };

    async function unpackBlob(blob: Blob) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const read = async (path: string) => {
        const file = zip.file(path);
        if (!file) throw new Error(`Missing OOXML part: ${path}`);
        return file.async('string');
      };
      return {
        document: await read('word/document.xml'),
        styles: await read('word/styles.xml'),
        numbering: await read('word/numbering.xml'),
        settings: await read('word/settings.xml'),
        header: await read('word/header1.xml'),
        footer: await read('word/footer1.xml'),
      };
    }

    async function unpackPl02(payload = approvedPayload) {
      return unpackBlob(await Packer.toBlob(buildPl02Document(payload)));
    }

    const xmlText = (xml: string) => xml
      .replace(/<w:tab\/?\s*>/g, '\t')
      .replace(/<w:br\/?\s*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    it('matches source-derived PL02 sections, tables, fonts, numbering, margins, and furniture', async () => {
      const fixture = await readJson<{
        sectionOrder: string[];
        tables: Array<{ headerText: string[] }>;
        pageMargins: Record<string, number>;
        headers: Array<{ text: string }>;
        toc: { present: boolean };
        revisionTable: { present: boolean };
        signature: { present: boolean };
      }>(resolve(root, 'tests/fixtures/docx/pl02-structure.json'));
      const xml = await unpackPl02();
      const text = xmlText(xml.document);

      let prior = -1;
      for (const sourceHeading of fixture.sectionOrder) {
        const heading = sourceHeading.replace(/^(?:I|II|III)\.\s+/, '');
        const index = text.indexOf(heading);
        expect(index).toBeGreaterThan(prior);
        prior = index;
      }
      const generatedHeaders = ['TRƯỜNG', ...fixture.tables.flatMap((table) => table.headerText)];
      for (const header of new Set(generatedHeaders)) expect(text).toContain(header);
      expect(xml.document).toContain('TOC');
      for (const [name, value] of Object.entries(fixture.pageMargins)) {
        expect(xml.document).toContain(`w:${name}="${value}"`);
      }
      expect(xml.styles).toContain('Times New Roman');
      expect(xml.styles).toMatch(/w:eastAsia="Times New Roman"/);
      expect(xml.numbering).toContain('upperRoman');
      expect(xml.numbering).toContain('lowerLetter');
      expect(xml.settings).toContain('w:updateFields');
      expect(xmlText(xml.header)).toContain(fixture.headers[0]?.text);
      expect(xmlText(xml.header)).toContain(approvedPayload.metadata.crCode);
      expect(xmlText(xml.footer)).toContain('NỘI BỘ');
      expect(text).toContain('CR_ĐIỀU_CHỈNH_537962');
      expect(text).toContain('MA_CTUD');
      expect(text).toContain('TRANG_THAI_CT');
      expect(text).toContain('BẢNG CÁC BƯỚC THỰC HIỆN');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('example');
      expect(fixture.toc.present).toBe(true);
      expect(fixture.revisionTable.present).toBe(false);
      expect(fixture.signature.present).toBe(false);
      expect(text).not.toContain('BẢNG THEO DÕI THAY ĐỔI TÀI LIỆU');
      expect(text).not.toContain('CÁN BỘ PHÊ DUYỆT');
    });

    it('omits optional image/source blocks and marks missing required content explicitly', async () => {
      const sparse: Pl02DocxPayload = {
        ...approvedPayload,
        introduction: { purpose: '', users: '', deploymentScope: '', risks: [], glossary: [] },
        features: [{
          name: 'Tính năng tối thiểu',
          description: '',
          fileLayout: [],
          inputRules: [],
          processingRules: [],
          flowSteps: [],
        }],
        permissions: [],
        notifications: [],
        apiContracts: [],
        staffing: [],
      };
      const text = xmlText((await unpackPl02(sparse)).document);
      expect(text).toContain('(chưa cung cấp)');
      expect(text).not.toContain('Template upload');
      expect(text).not.toContain('Source code:');
      expect(text).not.toContain('undefined');
    });

    it('keeps PL02 sources free of dynamic sandbox and generated script execution', async () => {
      const [sharedSource, builderSource, dispatcherSource] = await Promise.all([
        readFile(resolve(root, 'src/services/export/docxShared.ts'), 'utf8'),
        readFile(resolve(root, 'src/services/export/pl02Docx.ts'), 'utf8'),
        readFile(resolve(root, 'src/services/export/wizardDocx.ts'), 'utf8'),
      ]);
      expect(`${sharedSource}\n${builderSource}\n${dispatcherSource}`)
        .not.toMatch(/dynamicFileSandbox|executeDynamicFileScript|eval\(|new Function|AsyncFunction/);
    });

    it('strictly dispatches only current approved PL02 payloads before packing', async () => {
      const blob = await buildWizardDocx('PL02', approvedPayload);
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(blob.size).toBeGreaterThan(0);
      await expect(buildWizardDocx('PL02', { ...approvedPayload, extra: true }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      await expect(buildWizardDocx('PL02', { ...approvedPayload, status: 'review' }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      await expect(buildWizardDocx('PL02', { ...approvedPayload, approvedRevision: 1 }))
        .rejects.toThrow('WIZARD_DOCX_REVISION_STALE');
      await expect(buildWizardDocx('CAB', approvedPayload))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
    });

    it('builds semantically equal PL02 OOXML twice without network effects', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const normalize = (xml: string) => xml
        .replace(/w:rsid(?:R|RPr|Sect|Del|P|RDefault)="[0-9A-F]+"/g, '')
        .replace(/w14:(?:paraId|textId)="[0-9A-F]+"/g, '')
        .replace(/w:(?:numId|abstractNumId)="\d+"/g, 'w:numId="ID"')
        .replace(/w:(?:numId|abstractNumId) w:val="\d+"/g, 'w:numId w:val="ID"')
        .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, '')
        .replace(/PAGEREF _Toc\d+/g, 'PAGEREF _TocID')
        .replace(/<dcterms:(?:created|modified)[^>]*>.*?<\/dcterms:(?:created|modified)>/g, '');
      try {
        const first = await unpackBlob(await buildWizardDocx('PL02', approvedPayload));
        const second = await unpackBlob(await buildWizardDocx('PL02', approvedPayload));
        expect(xmlText(first.document).replace(/_Toc\d+/g, '_TocID'))
          .toBe(xmlText(second.document).replace(/_Toc\d+/g, '_TocID'));
        expect(xmlText(first.header)).toBe(xmlText(second.header));
        expect(xmlText(first.footer)).toBe(xmlText(second.footer));
        expect(normalize(first.styles)).toBe(normalize(second.styles));
        expect(normalize(first.settings)).toBe(normalize(second.settings));
        expect(first.numbering.replace(/\d+/g, 'N')).toBe(second.numbering.replace(/\d+/g, 'N'));
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('PL03B dedicated builder', () => {
    async function unpackBlob(blob: Blob) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const read = async (path: string) => {
        const file = zip.file(path);
        if (!file) throw new Error(`Missing OOXML part: ${path}`);
        return file.async('string');
      };
      return {
        document: await read('word/document.xml'),
        styles: await read('word/styles.xml'),
        numbering: await read('word/numbering.xml'),
        settings: await read('word/settings.xml'),
        header: await read('word/header1.xml'),
        footer: await read('word/footer1.xml'),
      };
    }
    const xmlText = (xml: string) => xml
      .replace(/<w:tab\/?\s*>/g, '\t')
      .replace(/<w:br\/?\s*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    const payload: Pl03bDocxPayload = {
      schemaVersion: 1,
      kind: 'PL03B',
      status: 'approved',
      inputRevision: 4,
      draftRevision: 3,
      approvedRevision: 3,
      metadata: {
        crCode: 'CR-PL03B-01',
        featureName: 'Tích hợp tokenization',
        author: 'Nguyễn Văn Dev',
        createdDate: '2026-10-28',
        version: '1.0',
      },
      introduction: {
        purpose: 'Thiết kế tích hợp dịch vụ tokenization.',
        users: 'Ứng dụng thẻ doanh nghiệp',
        databases: ['TOKEN_SCHEMA'],
        k8sServices: ['token-api'],
      },
      technical: {
        overview: 'Tích hợp API Gateway với Token Service.',
        techStack: 'TypeScript, Oracle, Kubernetes',
        flows: [{
          name: 'Manual Provisioning',
          steps: [{ actor: 'API Gateway', target: 'Token Service', action: 'Khởi tạo token' }],
        }],
        services: [{
          name: 'Token Service',
          sourceCode: 'https://git.example/token-service',
          apis: [{
            method: 'POST',
            path: '/tokens',
            description: 'Khởi tạo token',
            request: [{ field: 'cardId', dataType: 'string', description: 'Mã thẻ' }],
            response: [{ field: 'tokenId', dataType: 'string', description: 'Mã token' }],
          }],
        }],
        databases: [{
          name: 'TOKEN_TABLE',
          description: 'Lưu token đã cấp',
          columns: [{ column: 'TOKEN_ID', dataType: 'VARCHAR2(64)', description: 'Mã token' }],
        }],
        integrations: [{ name: 'Card Gateway', method: 'POST', path: '/provision', description: 'Gọi cấp token' }],
        notifications: [{ code: 'NTF_TOKEN_OK', name: 'Cấp token thành công', channel: 'PUSH' }],
      },
      reconciliation: {
        schemaVersion: 1,
        identity: {
          projectId: 'project-1', threadId: 'thread-1', solutionNoteId: 'note-1', solutionVersion: 2,
          solutionHash: 'a'.repeat(64), packHash: 'b'.repeat(64), cr: 'CR-PL03B-01', base: 'origin/develop', head: 'abc123',
        },
        status: 'PARTIAL_COVERAGE',
        approvedDesign: {
          currentSystem: 'Gateway gọi Core trực tiếp.', affectedScreens: ['Màn hình cấp token'],
          affectedApis: ['POST /tokens'], affectedTables: ['TOKEN_TABLE'],
        },
        actualImplementation: {
          affectedFiles: ['src/token.ts', 'assets/token.bin'], affectedScreens: [],
          affectedApis: ['POST /tokens'], affectedTables: ['TOKEN_TABLE'],
        },
        drift: [{
          requirementId: 'REQ-01', category: 'different', baselineRequirement: null,
          evidence: { evidenceId: 'ev-1', path: 'src/token.ts', startLine: 10, endLine: 15, text: 'uses retry' },
        }],
        dbChangesRollback: {
          affectedTables: ['TOKEN_TABLE'],
          changes: [{ path: 'sql/token.sql', evidenceIds: ['ev-sql'] }],
          rollback: { status: 'unknown', evidenceIds: [] },
        },
        regressionMatrix: [{ scenario: 'Cấp token hiện hữu', expected: 'Không đổi kết quả' }],
        coverage: [
          { path: 'src/token.ts', hunkId: 'h1', state: 'included', evidenceIds: ['ev-1'] },
          { path: 'assets/token.bin', state: 'binary', evidenceIds: [] },
          { path: 'src/deferred.ts', hunkId: 'h2', state: 'deferred', evidenceIds: [] },
        ],
      },
    };

    it('matches source furniture and preserves reconciliation caveats', async () => {
      const fixture = await readJson<{
        sectionOrder: string[]; pageMargins: Record<string, number>; revisionTable: { present: boolean; columns: string[] };
        signature: { present: boolean }; headers: Array<{ text: string }>;
      }>(resolve(root, 'tests/fixtures/docx/pl03b-structure.json'));
      const xml = await unpackBlob(await Packer.toBlob(buildPl03bDocument(payload)));
      const text = xmlText(xml.document);
      let prior = -1;
      for (const sourceHeading of fixture.sectionOrder) {
        const heading = sourceHeading.replace(/^\d+(?:\.\d+)*\.?\s+/, '');
        const index = text.indexOf(heading);
        expect(index).toBeGreaterThan(prior);
        prior = index;
      }
      for (const column of fixture.revisionTable.columns) expect(text).toContain(column);
      for (const [name, value] of Object.entries(fixture.pageMargins)) expect(xml.document).toContain(`w:${name}="${value}"`);
      expect(text).toContain('THIẾT KẾ NHƯ ĐÃ DUYỆT');
      expect(text).toContain('THỰC TẾ TRIỂN KHAI');
      expect(text).toContain('BẢNG DRIFT');
      expect(text).toContain('THAY ĐỔI DB VÀ ROLLBACK');
      expect(text).toContain('MA TRẬN REGRESSION TEST');
      expect(text).toContain('PARTIAL_COVERAGE');
      expect(text).toContain('binary');
      expect(text).toContain('deferred');
      expect(text).toContain('Rollback: unknown');
      expect(text).not.toContain('Không có drift');
      expect(text).toContain('API Gateway → Token Service: Khởi tạo token');
      expect(text).toContain('Source code: https://git.example/token-service');
      expect(text).not.toContain('CÁN BỘ REVIEW');
      expect(xmlText(xml.header)).toContain(fixture.headers[0]?.text);
      expect(xml.styles).toContain('Times New Roman');
      expect(fixture.revisionTable.present).toBe(true);
      expect(fixture.signature.present).toBe(false);
    });

    it('omits absent source code and emits clean drift only with complete coverage', async () => {
      const clean: Pl03bDocxPayload = {
        ...payload,
        technical: { ...payload.technical, services: [{ ...payload.technical.services[0]!, sourceCode: undefined }] },
        reconciliation: {
          ...payload.reconciliation,
          status: 'NO_DRIFT_COMPLETE', drift: [],
          coverage: [{ path: 'src/token.ts', hunkId: 'h1', state: 'included', evidenceIds: ['ev-1'] }],
        },
      };
      const text = xmlText((await unpackBlob(await Packer.toBlob(buildPl03bDocument(clean)))).document);
      expect(text).toContain('Không có drift');
      expect(text).not.toContain('Source code:');
      await expect(buildWizardDocx('PL03B', { ...payload, approvedRevision: 2 }))
        .rejects.toThrow('WIZARD_DOCX_REVISION_STALE');
      await expect(buildWizardDocx('PL03B', { ...payload, extra: true }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      expect((await buildWizardDocx('PL03B', payload)).size).toBeGreaterThan(0);
    });
  });

  describe('CAB minimal builder', () => {
    const sourceBase = {
      projectId: '25000000-0000-4000-8000-000000000009',
      threadId: '25000000-0000-4000-8000-000000000109',
    };
    const payload: CabDocxPayload = {
      schemaVersion: 1,
      kind: 'CAB',
      status: 'approved',
      inputRevision: 6,
      draftRevision: 4,
      approvedRevision: 4,
      projectId: sourceBase.projectId,
      threadId: sourceBase.threadId,
      sourceArtifactIds: {
        PL02: '25000000-0000-4000-8000-000000002009',
        PL03B: '25000000-0000-4000-8000-000000003009',
        PL07: '25000000-0000-4000-8000-000000007009',
      },
      sources: [
        { ...sourceBase, kind: 'PL02', artifactId: '25000000-0000-4000-8000-000000002009', version: 2, hash: '2'.repeat(64), approved: true },
        { ...sourceBase, kind: 'PL03B', artifactId: '25000000-0000-4000-8000-000000003009', version: 1, hash: '3'.repeat(64), approved: true },
        { ...sourceBase, kind: 'PL07', artifactId: '25000000-0000-4000-8000-000000007009', version: 1, hash: '7'.repeat(64), approved: true },
      ],
      expectedVersions: { PL02: 2, PL03B: 1, PL07: 1 },
      expectedHashes: { PL02: '2'.repeat(64), PL03B: '3'.repeat(64), PL07: '7'.repeat(64) },
      title: 'TÓM TẮT TRÌNH CAB - CR TOKENIZATION',
      contextObjective: 'Điều chỉnh cấp token theo luồng đã thống nhất.',
      businessChanges: ['Bổ sung kênh cấp token cho thẻ doanh nghiệp.'],
      technicalChanges: ['Thêm POST /tokens.', 'Thay đổi TOKEN_TABLE.'],
      sit: null,
      uat: null,
      risks: ['REQ-DIFF còn chưa xử lý.'],
      unresolvedDrift: ['REQ-DIFF'],
      rollback: { summary: 'Chưa có bằng chứng rollback.', verified: false },
      caveats: ['Coverage mã nguồn còn PARTIAL.'],
    };

    const xmlText = (xml: string) => xml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    async function unpack(blob: Blob) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const file = zip.file('word/document.xml');
      if (!file) throw new Error('Missing OOXML part: word/document.xml');
      return file.async('string');
    }

    it('builds bounded CAB summary with explicit test, drift, rollback caveats and one sign-off table', async () => {
      const document = await unpack(await Packer.toBlob(buildCabDocument(payload)));
      const text = xmlText(document);
      expect(text).toContain(payload.title);
      expect(text).toContain('BỐI CẢNH VÀ MỤC TIÊU');
      expect(text).toContain('THAY ĐỔI NGHIỆP VỤ CHÍNH');
      expect(text).toContain('THAY ĐỔI KỸ THUẬT CHÍNH');
      expect(text).toContain('SIT: chưa cung cấp');
      expect(text).toContain('UAT: chưa cung cấp');
      expect(text).toContain('REQ-DIFF');
      expect(text).toContain('Rollback chưa được kiểm chứng');
      expect(text).toContain('CÁN BỘ PHÁT TRIỂN');
      expect(text).toContain('CÁN BỘ PHÊ DUYỆT');
      expect((document.match(/<w:tbl>/g) ?? [])).toHaveLength(1);
      expect((document.match(/<w:tc>/g) ?? [])).toHaveLength(4);
      expect(document).not.toContain('TOC');
      expect(text).not.toContain('BẢNG THEO DÕI THAY ĐỔI TÀI LIỆU');
      expect(text).not.toContain('MỤC LỤC');
      expect(text).not.toContain('Đã phê duyệt');
      expect(text).not.toContain('Sẵn sàng triển khai');
      expect(text.length).toBeLessThanOrEqual(12_000);
      expect((document.match(/<w:p[ >]/g) ?? []).length).toBeLessThanOrEqual(60);
    });

    it('rejects missing, mixed, unapproved, stale, or hash-mismatched CAB sources before packing', async () => {
      await expect(buildWizardDocx('CAB', { ...payload, sources: payload.sources.slice(0, 2) }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      await expect(buildWizardDocx('CAB', {
        ...payload,
        sources: payload.sources.map((source) => source.kind === 'PL03B' ? { ...source, threadId: '25000000-0000-4000-8000-000000009999' } : source),
      })).rejects.toThrow('WIZARD_DOCX_CAB_SOURCE_INVALID');
      await expect(buildWizardDocx('CAB', {
        ...payload,
        sources: payload.sources.map((source) => source.kind === 'PL07' ? { ...source, approved: false } : source),
      })).rejects.toThrow('WIZARD_DOCX_CAB_SOURCE_INVALID');
      await expect(buildWizardDocx('CAB', { ...payload, expectedVersions: { ...payload.expectedVersions, PL02: 1 } }))
        .rejects.toThrow('WIZARD_DOCX_CAB_SOURCE_INVALID');
      await expect(buildWizardDocx('CAB', { ...payload, expectedHashes: { ...payload.expectedHashes, PL03B: '9'.repeat(64) } }))
        .rejects.toThrow('WIZARD_DOCX_CAB_SOURCE_INVALID');
      await expect(buildWizardDocx('CAB', { ...payload, approvedRevision: 3 }))
        .rejects.toThrow('WIZARD_DOCX_REVISION_STALE');
    });

    it('dispatches CAB into semantic deterministic Word blobs without network effects', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const firstBlob = await buildWizardDocx('CAB', payload);
        const secondBlob = await buildWizardDocx('CAB', payload);
        expect(firstBlob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(firstBlob.size).toBeGreaterThan(0);
        expect(xmlText(await unpack(firstBlob))).toBe(xmlText(await unpack(secondBlob)));
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('four-kind DOCX dispatcher', () => {
    const cabBase = {
      schemaVersion: 1 as const,
      kind: 'CAB' as const,
      status: 'approved' as const,
      inputRevision: 2,
      draftRevision: 1,
      approvedRevision: 1,
      projectId: '25000000-0000-4000-8000-000000000015',
      threadId: '25000000-0000-4000-8000-000000000115',
      sourceArtifactIds: {
        PL02: '25000000-0000-4000-8000-000000002015',
        PL03B: '25000000-0000-4000-8000-000000003015',
        PL07: '25000000-0000-4000-8000-000000007015',
      },
      expectedVersions: { PL02: 1, PL03B: 1, PL07: 1 },
      expectedHashes: { PL02: '2'.repeat(64), PL03B: '3'.repeat(64), PL07: '7'.repeat(64) },
      title: 'CAB F15',
      contextObjective: 'Synthetic approved payload.',
      businessChanges: [],
      technicalChanges: [],
      sit: null,
      uat: null,
      risks: [],
      unresolvedDrift: [],
      rollback: { summary: 'Chưa cung cấp.', verified: false },
      caveats: [],
    };
    const cab: CabDocxPayload = {
      ...cabBase,
      sources: [
        { kind: 'PL02', artifactId: cabBase.sourceArtifactIds.PL02, version: 1, hash: cabBase.expectedHashes.PL02, projectId: cabBase.projectId, threadId: cabBase.threadId, approved: true },
        { kind: 'PL03B', artifactId: cabBase.sourceArtifactIds.PL03B, version: 1, hash: cabBase.expectedHashes.PL03B, projectId: cabBase.projectId, threadId: cabBase.threadId, approved: true },
        { kind: 'PL07', artifactId: cabBase.sourceArtifactIds.PL07, version: 1, hash: cabBase.expectedHashes.PL07, projectId: cabBase.projectId, threadId: cabBase.threadId, approved: true },
      ],
    };

    it('has no pending markers and rejects wrong kind, raw shape, and content without leaking it', async () => {
      const dispatcherSource = await readFile(resolve(root, 'src/services/export/wizardDocx.ts'), 'utf8');
      const forbiddenSourcePatterns = ['TO' + 'DO', 'it.' + 'todo', 'dynamicFileSandbox', 'executeDynamicFileScript', 'eval(', 'new Function', 'AsyncFunction'];
      for (const pattern of forbiddenSourcePatterns) expect(dispatcherSource).not.toContain(pattern);
      await expect(buildWizardDocx('PL02', { kind: 'PL03B', secret: 'RAW_CANARY_DO_NOT_LEAK' }))
        .rejects.toMatchObject({ name: 'WizardDocxBuildError', message: 'WIZARD_DOCX_PAYLOAD_INVALID' });
      try {
        await buildWizardDocx('PL02', { kind: 'PL03B', secret: 'RAW_CANARY_DO_NOT_LEAK' });
      } catch (error) {
        expect(String(error)).not.toContain('RAW_CANARY_DO_NOT_LEAK');
        expect((error as Error).stack).not.toContain('RAW_CANARY_DO_NOT_LEAK');
      }
      await expect(buildWizardDocx('UNKNOWN' as never, cab)).rejects.toThrow('WIZARD_DOCX_KIND_UNSUPPORTED');
    });

    it('builds all four kinds twice as nonempty deterministic semantic Word blobs without network or script paths', async () => {
      const cases = [
        ['PL02', {
          schemaVersion: 1, kind: 'PL02', status: 'approved', inputRevision: 1, draftRevision: 1, approvedRevision: 1,
          metadata: { crCode: 'F15', featureName: 'Fixture', requestingUnit: '', author: 'Dev', createdDate: '2026-10-29' },
          introduction: { purpose: '', users: '', deploymentScope: '', risks: [], glossary: [] },
          features: [], permissions: [], notifications: [], apiContracts: [], staffing: [],
        }],
        ['PL03B', {
          schemaVersion: 1, kind: 'PL03B', status: 'approved', inputRevision: 1, draftRevision: 1, approvedRevision: 1,
          metadata: { crCode: 'F15', featureName: 'Fixture', author: 'Dev', createdDate: '2026-10-29', version: '1.0' },
          introduction: { purpose: '', users: '', databases: [], k8sServices: [] },
          technical: { overview: '', techStack: '', flows: [], services: [], databases: [], integrations: [], notifications: [] },
          reconciliation: {
            schemaVersion: 1,
            identity: { projectId: 'p', threadId: 't', solutionNoteId: 'n', solutionVersion: 1, solutionHash: 'a'.repeat(64), packHash: 'b'.repeat(64), cr: 'F15', base: 'a', head: 'b' },
            status: 'PARTIAL_COVERAGE',
            approvedDesign: { currentSystem: '', affectedScreens: [], affectedApis: [], affectedTables: [] },
            actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
            drift: [], dbChangesRollback: { affectedTables: [], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
            regressionMatrix: [], coverage: [{ path: 'optional.bin', state: 'binary', evidenceIds: [] }],
          },
        }],
        ['PL07', {
          schemaVersion: 1, kind: 'PL07', status: 'approved', inputRevision: 1, draftRevision: 1, approvedRevision: 1,
          metadata: { applicationName: 'Fixture', applicationVersion: '', summary: '', reviewDate: '2026-10-29', developer: '', approver: '' },
          marks: [], findings: [],
        }],
        ['CAB', cab],
      ] as const;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        for (const [kind, raw] of cases) {
          const first = await buildWizardDocx(kind, raw);
          const second = await buildWizardDocx(kind, raw);
          expect(first.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          expect(first.size).toBeGreaterThan(0);
          const firstZip = await JSZip.loadAsync(await first.arrayBuffer());
          const secondZip = await JSZip.loadAsync(await second.arrayBuffer());
          const firstDocument = await firstZip.file('word/document.xml')!.async('string');
          const secondDocument = await secondZip.file('word/document.xml')!.async('string');
          const normalize = (xml: string) => xml
            .replace(/_Toc\d+/g, '_TocID')
            .replace(/w:(?:numId|abstractNumId)="?\d+"?/g, 'w:numId="ID"')
            .replace(/w:id="\d+"/g, 'w:id="ID"')
            .replace(/w14:(?:paraId|textId)="[0-9A-F]+"/g, '')
            .replace(/w:rsid(?:R|RPr|Sect|Del|P|RDefault)="[0-9A-F]+"/g, '')
            .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, '');
          expect(normalize(firstDocument)).toBe(normalize(secondDocument));
        }
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('approved export orchestration', () => {
    const projectId = '25000000-0000-4000-8000-000000000016';
    const threadId = '25000000-0000-4000-8000-000000000116';
    const sessionId = '25000000-0000-4000-8000-000000000216';
    const messageId = '25000000-0000-4000-8000-000000000316';
    const approvedAt = '2026-10-29T02:00:00.000Z';
    const hash = 'a'.repeat(64);
    const payload = {
      schemaVersion: 1 as const, kind: 'PL02' as const, status: 'approved' as const,
      inputRevision: 1, draftRevision: 1, approvedRevision: 1,
      metadata: { crCode: 'CR-EXPORT', featureName: 'Export', requestingUnit: '', author: 'Dev', createdDate: '2026-10-29' },
      introduction: { purpose: '', users: '', deploymentScope: '', risks: [], glossary: [] },
      features: [], permissions: [], notifications: [], apiContracts: [], staffing: [],
    };
    const snapshot = {
      schemaVersion: 1 as const, sessionId, projectId, threadId, skill: 'PL02' as const,
      status: 'review' as const, inputRevision: 1, draftRevision: 1, approvedAt: null,
      artifactId: null, artifactHash: null,
      renderPayload: { title: 'PL02 Export', markdown: '# PL02 Export' },
      createdAt: approvedAt, updatedAt: approvedAt,
    };
    const message: ChatMessage = { id: messageId, threadId, role: 'assistant', content: 'review', createdAt: approvedAt, wizard: snapshot };

    function coordinator(overrides: Record<string, unknown> = {}) {
      let current = snapshot;
      const saveArtifact = vi.fn(async () => ({
        created: true,
        note: { id: '25000000-0000-4000-8000-000000000416' } as Note,
      }));
      const appendExportResult = vi.fn(async () => undefined);
      const instance = createWizardCoordinator({
        projectId, threadId,
        now: () => approvedAt,
        loadMessages: async () => [{ ...message, wizard: current }],
        hashText: async () => hash,
        buildDocx: vi.fn(async () => new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
        saveArtifact,
        downloadFile: vi.fn(async () => ({ kind: 'download_initiated', filename: 'PL02-Export.docx' })),
        appendExportResult,
        ...overrides,
      } as any);
      (instance as any).__setCurrent = (value: typeof snapshot) => { current = value; };
      return { instance, saveArtifact, appendExportResult };
    }

    it('builds, saves canonical Note, then reports truthful anchor initiation once', async () => {
      const { instance, saveArtifact, appendExportResult } = coordinator();
      await instance.restore();
      const first = await instance.approveAndExport(messageId, payload);
      const second = await instance.approveAndExport(messageId, payload);
      expect(first).toMatchObject({ blobBuilt: true, noteSaved: true, downloadInitiated: true, savePickerSaved: false, errorCode: null });
      expect(second).toEqual(first);
      expect(saveArtifact).toHaveBeenCalledTimes(1);
      expect(appendExportResult).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['build', { buildDocx: vi.fn(async () => { throw new Error('BUILD'); }) }, { blobBuilt: false, noteSaved: false, errorCode: 'WIZARD_EXPORT_BUILD_FAILED' }],
      ['note', { saveArtifact: vi.fn(async () => { throw new Error('SAVE'); }) }, { blobBuilt: true, noteSaved: false, errorCode: 'WIZARD_EXPORT_NOTE_SAVE_FAILED' }],
      ['download', { downloadFile: vi.fn(async () => ({ kind: 'cancelled', filename: 'PL02-Export.docx' })) }, { blobBuilt: true, noteSaved: true, downloadInitiated: false, savePickerSaved: false, errorCode: 'WIZARD_EXPORT_DOWNLOAD_CANCELLED' }],
    ])('separates %s failure flags', async (_name, overrides, expected) => {
      const { instance } = coordinator(overrides);
      await instance.restore();
      expect(await instance.approveAndExport(messageId, payload)).toMatchObject(expected);
    });

    it('returns zero effects when approval becomes stale after build', async () => {
      let resolveBuild!: (blob: Blob) => void;
      const buildDocx = vi.fn(() => new Promise<Blob>((resolve) => { resolveBuild = resolve; }));
      const { instance, saveArtifact } = coordinator({ buildDocx });
      await instance.restore();
      const pending = instance.approveAndExport(messageId, payload);
      await vi.waitFor(() => expect(buildDocx).toHaveBeenCalledTimes(1));
      (instance as any).__setCurrent({ ...snapshot, inputRevision: 2, updatedAt: '2026-10-29T02:00:01.000Z' });
      resolveBuild(new Blob(['docx']));
      expect(await pending).toMatchObject({ blobBuilt: true, noteSaved: false, downloadInitiated: false, errorCode: 'WIZARD_EXPORT_STALE' });
      expect(saveArtifact).not.toHaveBeenCalled();
    });

    it('distinguishes save picker success, cancellation, anchor initiation, and failure', async () => {
      const blob = new Blob(['x']);
      const originalPicker = (window as any).showSaveFilePicker;
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      try {
        (window as any).showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => ({ write: vi.fn(), close: vi.fn() }) }));
        await expect(downloadBlob(blob, 'safe.docx')).resolves.toEqual({ kind: 'save_picker_saved', filename: 'safe.docx' });
        (window as any).showSaveFilePicker = vi.fn(async () => { throw new DOMException('cancel', 'AbortError'); });
        await expect(downloadBlob(blob, 'safe.docx')).resolves.toEqual({ kind: 'cancelled', filename: 'safe.docx' });
        delete (window as any).showSaveFilePicker;
        await expect(downloadBlob(blob, 'safe.docx')).resolves.toEqual({ kind: 'download_initiated', filename: 'safe.docx' });
        createObjectURL.mockImplementationOnce(() => { throw new Error('URL'); });
        await expect(downloadBlob(blob, 'safe.docx')).resolves.toEqual({ kind: 'failed', filename: 'safe.docx', errorCode: 'DOWNLOAD_FAILED' });
      } finally {
        (window as any).showSaveFilePicker = originalPicker;
        click.mockRestore(); createObjectURL.mockRestore(); revokeObjectURL.mockRestore();
      }
    });
  });
  describe('PL07 immutable-baseline builder', () => {
    async function unpack(blob: Blob) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const read = async (path: string) => {
        const file = zip.file(path);
        if (!file) throw new Error(`Missing OOXML part: ${path}`);
        return file.async('string');
      };
      return { document: await read('word/document.xml'), styles: await read('word/styles.xml'), header: await read('word/header1.xml'), footer: await read('word/footer1.xml') };
    }
    const xmlText = (xml: string) => xml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const marks = PL07_BASELINE.sections.flatMap((section) => section.items.map((item) => ({
      sectionId: section.id,
      itemNumber: item.number,
      status: 'unknown' as const,
      evidenceIds: [],
      note: '',
    })));
    const payload: Pl07DocxPayload = {
      schemaVersion: 1,
      kind: 'PL07',
      status: 'approved',
      inputRevision: 3,
      draftRevision: 2,
      approvedRevision: 2,
      metadata: {
        applicationName: 'Ứng dụng Tokenization',
        applicationVersion: '1.2.0',
        summary: 'Tích hợp cấp token',
        reviewDate: '2026-09-22',
        developer: 'Nguyễn Văn Dev',
        approver: '',
      },
      marks: [
        ...marks.filter((mark) => !(mark.sectionId === 'I' && ['1', '2', '3'].includes(mark.itemNumber))),
        { sectionId: 'I', itemNumber: '1', status: 'pass', evidenceIds: ['ev-pass'], note: 'Đã kiểm tra server-side' },
        { sectionId: 'I', itemNumber: '2', status: 'fail', evidenceIds: ['ev-fail'], note: 'Thiếu allowlist' },
        { sectionId: 'I', itemNumber: '3', status: 'not_applicable', evidenceIds: ['ev-na'], note: 'Không nhận file' },
      ],
      findings: [{ number: '1', text: 'Bổ sung validate tại src/token.ts', evidenceIds: ['ev-hunk'], file: 'src/token.ts', hunk: 'hunk-1' }],
    };

    it('matches reviewed fixture exactly and renders fixed checklist merges and furniture', async () => {
      const fixtureBaseline = await readJson<Baseline>(baselinePath);
      const fixture = await readJson<{ pageMargins: Record<string, number>; headers: Array<{ text: string }>; signature: { present: boolean } }>(resolve(root, 'tests/fixtures/docx/pl07-structure.json'));
      expect(PL07_BASELINE).toEqual(fixtureBaseline);
      expect(PL07_BASELINE_SOURCE_SHA256).toBe(fixtureBaseline.sourceSha256);
      expect(Object.isFrozen(PL07_BASELINE)).toBe(true);
      const xml = await unpack(await Packer.toBlob(buildPl07Document(payload)));
      const text = xmlText(xml.document);
      let prior = -1;
      for (const section of fixtureBaseline.sections) {
        const headingIndex = text.indexOf(`${section.id}. ${section.title}`);
        expect(headingIndex).toBeGreaterThan(prior);
        prior = headingIndex;
        for (const item of section.items) {
          const itemIndex = text.indexOf(item.text, prior);
          expect(itemIndex).toBeGreaterThanOrEqual(prior);
          prior = itemIndex;
          for (const subItem of item.subItems ?? []) {
            const subItemIndex = text.indexOf(subItem.text, prior);
            expect(subItemIndex).toBeGreaterThanOrEqual(prior);
            prior = subItemIndex;
          }
        }
      }
      expect(text.indexOf('VI. Review code')).toBeGreaterThan(prior);
      expect(xml.document).toMatch(/w:gridSpan w:val="2"/);
      expect(text).toContain('Đáp ứng');
      expect(text).toContain('Có');
      expect(text).toContain('Không');
      expect(text).toContain('Chưa xác định');
      expect(text).toContain('Không áp dụng');
      expect(text).toContain('Không đạt');
      expect(text).toContain('Bổ sung validate tại src/token.ts');
      expect(text).toContain('src/token.ts | hunk-1 | ev-hunk');
      expect(text).toContain('CÁN BỘ PHÁT TRIỂN');
      expect(text).toContain('CÁN BỘ PHÊ DUYỆT');
      expect(text).not.toContain('Đã phê duyệt');
      expect(xmlText(xml.header)).toContain(fixture.headers[0]?.text);
      expect(xml.styles).toContain('Times New Roman');
      for (const [name, value] of Object.entries(fixture.pageMargins)) expect(xml.document).toContain(`w:${name}="${value}"`);
      expect(fixture.signature.present).toBe(true);
    });

    it('rejects baseline injection and unsupported positive or not-applicable marks', async () => {
      await expect(buildWizardDocx('PL07', { ...payload, baseline: { sections: [] } }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      await expect(buildWizardDocx('PL07', { ...payload, marks: [{ sectionId: 'I', itemNumber: '1', status: 'pass', evidenceIds: [], note: '' }] }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      await expect(buildWizardDocx('PL07', { ...payload, marks: [{ sectionId: 'I', itemNumber: '1', status: 'not_applicable', evidenceIds: [], note: '' }] }))
        .rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
      await expect(buildWizardDocx('PL07', { ...payload, approvedRevision: 1 }))
        .rejects.toThrow('WIZARD_DOCX_REVISION_STALE');
      expect((await buildWizardDocx('PL07', payload)).size).toBeGreaterThan(0);
    });
  });
});
