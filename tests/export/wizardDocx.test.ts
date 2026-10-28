import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPl02Document, type Pl02DocxPayload } from '../../src/services/export/pl02Docx';

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
      const [sharedSource, builderSource] = await Promise.all([
        readFile(resolve(root, 'src/services/export/docxShared.ts'), 'utf8'),
        readFile(resolve(root, 'src/services/export/pl02Docx.ts'), 'utf8'),
      ]);
      expect(`${sharedSource}\n${builderSource}`)
        .not.toMatch(/dynamicFileSandbox|executeDynamicFileScript|eval\(|new Function|AsyncFunction/);
    });

  });

  it.todo('asserts PL03B builder semantic OOXML against pl03b-structure.json');
  it.todo('asserts PL07 builder semantic OOXML against pl07-structure.json');
});
