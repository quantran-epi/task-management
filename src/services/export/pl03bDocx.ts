import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ReconciliationResult } from '../wizard/reconciliation';
import {
  apiTable,
  dbColumnsTable,
  DOCX_FONT,
  docxParagraph,
  headerCell,
  supplied,
  textCell,
  type ApiContractRow,
  type DbColumnRow,
  type ExecutionMatrixRow,
} from './docxShared';

export interface Pl03bDocxPayload {
  schemaVersion: 1;
  kind: 'PL03B';
  status: 'approved';
  inputRevision: number;
  draftRevision: number;
  approvedRevision: number;
  metadata: { crCode: string; featureName: string; author: string; createdDate: string; version: string };
  introduction: { purpose: string; users: string; databases: string[]; k8sServices: string[] };
  technical: {
    overview: string;
    techStack: string;
    flows: Array<{ name: string; steps: ExecutionMatrixRow[] }>;
    services: Array<{
      name: string;
      sourceCode?: string | undefined;
      apis: Array<{
        method: string;
        path: string;
        description: string;
        request: ApiContractRow[];
        response: ApiContractRow[];
      }>;
    }>;
    databases: Array<{ name: string; description: string; columns: DbColumnRow[] }>;
    integrations: Array<{ name: string; method: string; path: string; description: string }>;
    notifications: Array<{ code: string; name: string; channel: string }>;
  };
  reconciliation: ReconciliationResult;
}

const HEADINGS = 'pl03b-headings';
const HOPS = 'pl03b-hops';

function heading(text: string, level: 1 | 2 | 3 | 4): Paragraph {
  const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4] as const;
  return new Paragraph({
    children: [new TextRun({ text, font: DOCX_FONT, bold: true })],
    heading: levels[level - 1]!,
    numbering: { reference: HEADINGS, level: level - 1 },
    spacing: { before: level === 1 ? 240 : 160, after: 100 },
  });
}

function cover(text: string, size: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, font: DOCX_FONT, size })],
    spacing: { after: 180 },
  });
}

function list(label: string, values: readonly string[]): Paragraph[] {
  return [docxParagraph(`${label}: ${values.length ? values.join(', ') : '(chưa cung cấp)'}`)];
}

function simpleTable(headers: readonly string[], rows: readonly (readonly string[])[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(headerCell), tableHeader: true, cantSplit: true }),
      ...(rows.length ? rows : [headers.map(() => '')]).map((row) => new TableRow({ children: row.map(textCell), cantSplit: true })),
    ],
  });
}

function reconciliationChildren(result: ReconciliationResult): Array<Paragraph | Table> {
  const approved = result.approvedDesign;
  const actual = result.actualImplementation;
  const coverageRows = result.coverage.map((item) => [item.path, item.hunkId ?? '', item.state, item.evidenceIds.join(', ')]);
  const driftRows = result.drift.map((item) => [
    item.requirementId,
    item.category,
    item.evidence ? `${item.evidence.path}:${item.evidence.startLine}-${item.evidence.endLine}` : supplied(item.baselineRequirement),
  ]);
  const clean = result.status === 'NO_DRIFT_COMPLETE'
    && result.drift.length === 0
    && result.coverage.length > 0
    && result.coverage.every((item) => item.state === 'included');
  return [
    heading('THIẾT KẾ NHƯ ĐÃ DUYỆT', 2),
    docxParagraph(approved.currentSystem),
    ...list('Màn hình ảnh hưởng', approved.affectedScreens),
    ...list('API ảnh hưởng', approved.affectedApis),
    ...list('Bảng ảnh hưởng', approved.affectedTables),
    heading('THỰC TẾ TRIỂN KHAI', 2),
    ...list('File thay đổi', actual.affectedFiles),
    ...list('Màn hình thực tế', actual.affectedScreens),
    ...list('API thực tế', actual.affectedApis),
    ...list('Bảng thực tế', actual.affectedTables),
    docxParagraph(`Trạng thái đối soát: ${result.status}`, true),
    simpleTable(['Đường dẫn', 'Hunk', 'Coverage', 'Evidence'], coverageRows),
    heading('BẢNG DRIFT', 2),
    ...(clean ? [docxParagraph('Không có drift')] : [simpleTable(['Yêu cầu', 'Phân loại', 'Bằng chứng/Baseline'], driftRows)]),
    heading('THAY ĐỔI DB VÀ ROLLBACK', 2),
    ...list('Bảng thay đổi', result.dbChangesRollback.affectedTables),
    simpleTable(['Đường dẫn', 'Evidence'], result.dbChangesRollback.changes.map((change) => [change.path, change.evidenceIds.join(', ')])),
    docxParagraph(`Rollback: ${result.dbChangesRollback.rollback.status}; evidence: ${result.dbChangesRollback.rollback.evidenceIds.join(', ') || '(không có)'}`),
    heading('MA TRẬN REGRESSION TEST', 2),
    simpleTable(['Kịch bản', 'Kết quả mong đợi'], result.regressionMatrix.map((row) => [row.scenario, row.expected])),
  ];
}

export function buildPl03bDocument(payload: Pl03bDocxPayload): Document {
  const children: Array<Paragraph | Table | TableOfContents> = [
    new Paragraph({ spacing: { before: 900 } }),
    cover('PHỤ LỤC 03B', 28),
    cover('TÀI LIỆU THIẾT KẾ KỸ THUẬT', 32),
    cover(supplied(payload.metadata.featureName).toUpperCase(), 26),
    docxParagraph(`Mã CR: ${payload.metadata.crCode}`),
    docxParagraph(`Người lập: ${payload.metadata.author}`),
    docxParagraph(`Ngày lập: ${payload.metadata.createdDate}`),
    cover('BẢNG THEO DÕI THAY ĐỔI TÀI LIỆU', 26),
    simpleTable(
      ['STT', 'Mô tả thay đổi', 'Ngày thay đổi', 'Phiên bản', 'Phụ trách', 'Ghi chú'],
      [['1', 'Khởi tạo tài liệu', payload.metadata.createdDate, payload.metadata.version, payload.metadata.author, '']],
    ),
    new Paragraph({ children: [new PageBreak()] }),
    cover('MỤC LỤC', 28),
    new TableOfContents('MỤC LỤC', { hyperlink: true, headingStyleRange: '1-4' }),
    new Paragraph({ children: [new PageBreak()] }),
    heading('GIỚI THIỆU CHUNG.', 1),
    heading('Mục đích yêu cầu.', 2),
    docxParagraph(payload.introduction.purpose),
    heading('Đối tượng sử dụng.', 2),
    docxParagraph(payload.introduction.users),
    heading('Thành phần triển khai.', 2),
    ...list('Database', payload.introduction.databases),
    ...list('K8s', payload.introduction.k8sServices),
    heading('ĐẶC TẢ KỸ THUẬT.', 1),
    docxParagraph(payload.technical.overview),
    docxParagraph(`Techstack: ${supplied(payload.technical.techStack)}`),
    heading('Luồng hoạt động', 2),
  ];

  for (const flow of payload.technical.flows) {
    children.push(heading(flow.name, 3));
    const steps = flow.steps.length ? flow.steps : [{ actor: '', target: '', action: '' }];
    children.push(...steps.map((step) => new Paragraph({
      children: [new TextRun({ text: `${supplied(step.actor)} → ${supplied(step.target)}: ${supplied(step.action)}`, font: DOCX_FONT })],
      numbering: { reference: HOPS, level: 0 },
    })));
  }
  children.push(heading('Services', 2));
  for (const service of payload.technical.services) {
    children.push(heading(service.name, 3));
    if (service.sourceCode?.trim()) children.push(docxParagraph(`Source code: ${service.sourceCode}`));
    for (const api of service.apis) {
      children.push(
        heading(`${api.method} ${api.path}`, 4),
        docxParagraph(`Mô tả: ${supplied(api.description)}`),
        docxParagraph('Request body', true),
        apiTable(api.request.length ? api.request : [{ field: '', dataType: '', description: '' }]),
        docxParagraph('Response body — HTTP 200', true),
        apiTable(api.response.length ? api.response : [{ field: '', dataType: '', description: '' }]),
      );
    }
  }
  children.push(heading('Database', 2), heading('Bảng', 3));
  for (const table of payload.technical.databases) {
    children.push(
      heading(table.name, 4),
      docxParagraph(table.description),
      dbColumnsTable(table.columns.length ? table.columns : [{ column: '', dataType: '', description: '' }]),
    );
  }
  children.push(heading('Integration Services', 2));
  for (const integration of payload.technical.integrations) {
    children.push(heading(integration.name, 3), docxParagraph(`${integration.method} ${integration.path}`), docxParagraph(integration.description));
  }
  children.push(
    heading('NTF-UI', 2),
    simpleTable(
      ['STT', 'MÃ THÔNG BÁO', 'TÊN THÔNG BÁO', 'KÊNH GỬI'],
      payload.technical.notifications.map((row, index) => [String(index + 1), row.code, row.name, row.channel]),
    ),
    ...reconciliationChildren(payload.reconciliation),
  );

  return new Document({
    creator: payload.metadata.author,
    title: `PL03B ${payload.metadata.crCode} - ${payload.metadata.featureName}`,
    description: 'Tài liệu thiết kế kỹ thuật PL03B',
    features: { updateFields: true },
    theme: { fonts: { headings: { latin: DOCX_FONT, eastAsia: DOCX_FONT, complexScript: DOCX_FONT }, body: { latin: DOCX_FONT, eastAsia: DOCX_FONT, complexScript: DOCX_FONT } } },
    styles: {
      default: {
        document: { run: { font: { ascii: DOCX_FONT, hAnsi: DOCX_FONT, eastAsia: DOCX_FONT, cs: DOCX_FONT }, size: 22 }, paragraph: { spacing: { line: 276 } } },
        title: { run: { font: DOCX_FONT } },
        heading1: { run: { font: DOCX_FONT, bold: true, size: 26 } },
        heading2: { run: { font: DOCX_FONT, bold: true, size: 24 } },
        heading3: { run: { font: DOCX_FONT, bold: true, size: 22 } },
        heading4: { run: { font: DOCX_FONT, bold: true, size: 22 } },
      },
    },
    numbering: { config: [
      { reference: HEADINGS, levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } } } },
        { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 480 } } } },
        { level: 2, format: LevelFormat.DECIMAL, text: '%1.%2.%3', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 720 } } } },
        { level: 3, format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 900 } } } },
      ] },
      { reference: HOPS, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ] },
    sections: [{
      properties: { page: { margin: { top: 1701, right: 851, bottom: 1701, left: 1701, header: 720, footer: 720, gutter: 0 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'QUYẾT ĐỊNH VỀ QUY TRÌNH PHÁT TRIỂN PHẦN MỀM SHBMã hiệu: QĐ …/2026/QĐ-TGĐ Ngày hiệu lực: …/…/2026 Lần ban hành/sửa đổi: 03', font: DOCX_FONT, bold: true, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tài liệu này chứa các thông tin NỘI BỘ của SHB, cấm sao chép, in ấn dưới mọi hình thức nếu không được sự cho phép của SHB ', font: DOCX_FONT, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: DOCX_FONT, size: 16 })] })] }) },
      children,
    }],
  });
}
