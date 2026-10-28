import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

export const DOCX_FONT = 'Times New Roman';
const CELL_MARGINS = { top: 80, bottom: 80, left: 100, right: 100 } as const;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;

type CellValue = string | number | null | undefined;

export function supplied(value: CellValue, fallback = '(chưa cung cấp)'): string {
  return value === null || value === undefined || String(value).trim() === ''
    ? fallback
    : String(value);
}

export function docxRun(text: CellValue, bold = false): TextRun {
  return new TextRun({
    text: supplied(text),
    bold,
    font: { ascii: DOCX_FONT, hAnsi: DOCX_FONT, eastAsia: DOCX_FONT, cs: DOCX_FONT },
    size: 22,
  });
}

export function docxParagraph(text: CellValue, bold = false): Paragraph {
  return new Paragraph({ children: [docxRun(text, bold)], spacing: { after: 100 } });
}

export function headerCell(text: CellValue): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [docxRun(text, true)],
      }),
    ],
    shading: { type: ShadingType.CLEAR, fill: 'D9EAF7' },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
  });
}

export function textCell(text: CellValue): TableCell {
  return new TableCell({
    children: [docxParagraph(text)],
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
  });
}

function fixedTable(headers: readonly string[], rows: readonly (readonly CellValue[])[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
      insideHorizontal: BORDER,
      insideVertical: BORDER,
    },
    rows: [
      new TableRow({ children: headers.map(headerCell), tableHeader: true, cantSplit: true }),
      ...rows.map((row) => new TableRow({ children: row.map(textCell), cantSplit: true })),
    ],
  });
}

export type RiskRow = { type: string; description: string; mitigation: string; owner: string };
export function riskTable(rows: readonly RiskRow[]): Table {
  return fixedTable(
    ['Loại rủi ro', 'Mô tả', 'Biện pháp', 'Đơn vị thực hiện'],
    rows.map((row) => [row.type, row.description, row.mitigation, row.owner]),
  );
}

export type GlossaryRow = { abbreviation: string; explanation: string };
export function glossaryTable(rows: readonly GlossaryRow[]): Table {
  return fixedTable(
    ['STT', 'Từ viết tắt', 'Giải thích'],
    rows.map((row, index) => [index + 1, row.abbreviation, row.explanation]),
  );
}

export type FileLayoutRow = {
  column: string;
  format: string;
  required: string;
  description: string;
};
export function fileLayoutTable(rows: readonly FileLayoutRow[], fieldHeader = 'CỘT'): Table {
  return fixedTable(
    ['STT', fieldHeader, 'ĐỊNH DẠNG', 'BẮT BUỘC', 'MÔ TẢ'],
    rows.map((row, index) => [index + 1, row.column, row.format, row.required, row.description]),
  );
}

export type InputRuleRow = { field: string; rule: string };
export function inputRulesTable(rows: readonly InputRuleRow[]): Table {
  return fixedTable(
    ['STT', 'Trường', 'Quy tắc nhập liệu'],
    rows.map((row, index) => [index + 1, row.field, row.rule]),
  );
}

export type NotificationRow = { content: string; push: string; m4u: string };
export function notificationTable(rows: readonly NotificationRow[]): Table {
  return fixedTable(
    ['STT', 'Nội dung cấu hình', 'PUSH', 'M4U'],
    rows.map((row, index) => [index + 1, row.content, row.push, row.m4u]),
  );
}

export type ApiContractRow = { field: string; dataType: string; description: string };
export function apiTable(rows: readonly ApiContractRow[]): Table {
  return fixedTable(
    ['Trường dữ liệu', 'Kiểu dữ liệu', 'Mô tả'],
    rows.map((row) => [row.field, row.dataType, row.description]),
  );
}

export type DbColumnRow = { column: string; dataType: string; description: string };
export function dbColumnsTable(rows: readonly DbColumnRow[]): Table {
  return fixedTable(
    ['Column', 'Data type', 'Field Description'],
    rows.map((row) => [row.column, row.dataType, row.description]),
  );
}

export type ExecutionMatrixRow = { actor: string; target: string; action: string };
export function executionMatrixTable(rows: readonly ExecutionMatrixRow[]): Table {
  return fixedTable(
    ['Bước', 'Đầu mối', 'Đối tượng', 'Nội dung thực hiện'],
    rows.map((row, index) => [index + 1, row.actor, row.target, row.action]),
  );
}

export type ChecklistRow = {
  number: string;
  content: string;
  yes: string;
  no: string;
  applicability: string;
  note: string;
};
export function checklistRows(rows: readonly ChecklistRow[]): TableRow[] {
  return rows.map((row) => new TableRow({
    children: [
      textCell(row.number),
      textCell(row.content),
      textCell(row.yes),
      textCell(row.no),
      textCell(row.applicability),
      textCell(row.note),
    ],
    cantSplit: true,
  }));
}

export type StaffingRow = {
  workItem: string;
  fromDate: string;
  toDate: string;
  businessOwner: string;
  deliveryOwner: string;
};
export function staffingTable(rows: readonly StaffingRow[]): Table {
  return fixedTable(
    ['STT', 'Hạng mục công việc', 'Từ ngày', 'Đến ngày', 'Đầu mối nghiệp vụ', 'Đầu mối ĐVTH'],
    rows.map((row, index) => [
      index + 1,
      row.workItem,
      row.fromDate,
      row.toDate,
      row.businessOwner,
      row.deliveryOwner,
    ]),
  );
}

export function signOffTable(leftTitle: string, rightTitle: string): Table {
  return fixedTable([leftTitle, rightTitle], [['', '']]);
}
