import {
  AlignmentType,
  Document,
  Footer,
  Header,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { DOCX_FONT, checklistRows, docxParagraph, headerCell, signOffTable, textCell, type ChecklistRow } from './docxShared';
import { PL07_BASELINE, type Pl07Baseline } from './pl07Baseline';

export type Pl07MarkStatus = 'pass' | 'fail' | 'not_applicable' | 'unknown';
export interface Pl07DocxPayload {
  schemaVersion: 1;
  kind: 'PL07';
  status: 'approved';
  inputRevision: number;
  draftRevision: number;
  approvedRevision: number;
  metadata: {
    applicationName: string;
    applicationVersion: string;
    summary: string;
    reviewDate: string;
    developer: string;
    approver: string;
  };
  marks: Array<{
    sectionId: string;
    itemNumber: string;
    status: Pl07MarkStatus;
    evidenceIds: string[];
    note: string;
  }>;
  findings: Array<{
    number: string;
    text: string;
    evidenceIds: string[];
    file: string;
    hunk: string;
  }>;
}

function centered(text: string, size: number, bold = true): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, font: DOCX_FONT, bold, size })],
    spacing: { after: 120 },
  });
}

function metadataTable(payload: Pl07DocxPayload): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [new TableCell({ columnSpan: 2, children: [centered('Nội dung', 22)] })] }),
      ...[
        ['Tên ứng dụng', payload.metadata.applicationName],
        ['Phiên bản ứng dụng', payload.metadata.applicationVersion],
        ['Mô tả sơ lược', payload.metadata.summary],
        ['Ngày kiểm nghiệm', payload.metadata.reviewDate],
      ].map(([label, value]) => new TableRow({ children: [headerCell(label), textCell(value)] })),
    ],
  });
}

function markRow(status: Pl07MarkStatus, evidenceIds: readonly string[], note: string): Pick<ChecklistRow, 'yes' | 'no' | 'applicability' | 'note'> {
  const evidence = evidenceIds.length ? `Evidence: ${evidenceIds.join(', ')}` : '';
  const combinedNote = [note, evidence].filter(Boolean).join(' | ');
  if (status === 'pass') return { yes: 'X', no: '', applicability: 'Áp dụng', note: combinedNote };
  if (status === 'fail') return { yes: '', no: 'X', applicability: 'Áp dụng', note: ['Không đạt', combinedNote].filter(Boolean).join(' | ') };
  if (status === 'not_applicable') return { yes: '', no: '', applicability: 'Không áp dụng', note: combinedNote };
  return { yes: '', no: '', applicability: 'Chưa xác định', note: note || 'Chưa xác định' };
}

function checklistTable(payload: Pl07DocxPayload, baseline: Pl07Baseline): Table {
  const marks = new Map(payload.marks.map((mark) => [`${mark.sectionId}.${mark.itemNumber}`, mark]));
  const rows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({ rowSpan: 2, children: [centered('STT', 22)] }),
        new TableCell({ rowSpan: 2, children: [centered('Nội dung', 22)] }),
        new TableCell({ columnSpan: 2, children: [centered('Đáp ứng', 22)] }),
        new TableCell({ rowSpan: 2, children: [centered('Áp dụng/ Không áp dụng', 22)] }),
        new TableCell({ rowSpan: 2, children: [centered('Ghi chú', 22)] }),
      ],
      tableHeader: true,
      cantSplit: true,
    }),
    new TableRow({ children: [headerCell('Có'), headerCell('Không')], tableHeader: true, cantSplit: true }),
  ];

  for (const section of baseline.sections) {
    rows.push(new TableRow({
      children: [
        textCell(section.id),
        new TableCell({ columnSpan: 5, children: [docxParagraph(`${section.id}. ${section.title}`, true)] }),
      ],
      cantSplit: true,
    }));
    const sectionRows: ChecklistRow[] = [];
    for (const item of section.items) {
      const mark = marks.get(`${section.id}.${item.number}`);
      const rendered = mark ? markRow(mark.status, mark.evidenceIds, mark.note) : markRow('unknown', [], '');
      sectionRows.push({ number: item.number, content: item.text, ...rendered });
      const subItems = 'subItems' in item ? item.subItems : [];
      for (const subItem of subItems) {
        sectionRows.push({ number: subItem.number, content: subItem.text, ...rendered });
      }
    }
    rows.push(...checklistRows(sectionRows));
  }

  rows.push(new TableRow({ children: [textCell('VI'), new TableCell({ columnSpan: 5, children: [docxParagraph('VI. Review code', true)] })], cantSplit: true }));
  for (const finding of payload.findings) {
    rows.push(...checklistRows([{
      number: finding.number,
      content: finding.text,
      yes: '',
      no: '',
      applicability: 'Review code',
      note: `${finding.file} | ${finding.hunk} | ${finding.evidenceIds.join(', ')}`,
    }]));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

export function buildPl07Document(payload: Pl07DocxPayload, baseline: Pl07Baseline = PL07_BASELINE): Document {
  if (baseline !== PL07_BASELINE) throw new Error('PL07_BASELINE_OVERRIDE_FORBIDDEN');
  const [year = '', month = '', day = ''] = payload.metadata.reviewDate.split('-');
  const children = [
    centered('PHỤ LỤC 07', 28),
    centered('(Ban hành kèm theo Quyết định số ……/QĐ-TGĐ ngày ….. tháng ….. năm 20…… của', 20, false),
    centered('Tổng Giám đốc Ngân hàng TMCP Sài Gòn – Hà Nội)', 20, false),
    centered('BIÊN BẢN CODE REVIEW', 32),
    metadataTable(payload),
    checklistTable(payload, baseline),
    docxParagraph(`Hà Nội, ngày ${day} tháng ${month} năm ${year}`),
    signOffTable('CÁN BỘ PHÁT TRIỂN', 'CÁN BỘ PHÊ DUYỆT'),
    centered('(Ký và ghi rõ họ tên)                              (Ký và ghi rõ họ tên)', 20, false),
  ];
  return new Document({
    creator: payload.metadata.developer,
    title: `PL07 - ${payload.metadata.applicationName}`,
    description: 'Biên bản Code Review PL07',
    theme: {
      fonts: {
        headings: { latin: DOCX_FONT, eastAsia: DOCX_FONT, complexScript: DOCX_FONT },
        body: { latin: DOCX_FONT, eastAsia: DOCX_FONT, complexScript: DOCX_FONT },
      },
    },
    styles: {
      default: {
        document: { run: { font: { ascii: DOCX_FONT, hAnsi: DOCX_FONT, eastAsia: DOCX_FONT, cs: DOCX_FONT }, size: 22 }, paragraph: { spacing: { line: 276 } } },
        title: { run: { font: DOCX_FONT } },
        heading1: { run: { font: DOCX_FONT, bold: true } },
        heading2: { run: { font: DOCX_FONT, bold: true } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 } } },
      headers: { default: new Header({ children: [centered('QUY ĐỊNH QUẢN LÝ THAY ĐỔI DỊCH VỤ CNTT TRONG SHB Mã hiệu: QĐ ….../2021/QĐ-TGĐ Ngày hiệu lực:../../2021 Lần ban hành/sửa đổi: 05', 16)] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tài liệu này chứa các thông tin NỘI BỘ của SHB, cấm sao chép, in ấn dưới mọi thức nếu không được sự cho phép của SHB ', font: DOCX_FONT, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: DOCX_FONT, size: 16 })] })] }) },
      children,
    }],
  });
}
