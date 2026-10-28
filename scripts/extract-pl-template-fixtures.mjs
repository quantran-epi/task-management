import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import JSZip from 'jszip';

const ROOT = resolve(import.meta.dirname, '..');
const EXTRACTION_VERSION = 'ooXML-1.0.0';
const SOURCE_DIR = resolve(ROOT, 'docs/pl-templates');
const OUT_DIR = resolve(ROOT, 'tests/fixtures');
const manifestPath = resolve(OUT_DIR, 'ai/pl-template-manifest.json');

const sources = {
  pl02: 'PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx',
  pl03b: 'PL03B-tokenization-CTM-TichHop.docx',
  pl07: 'PL07-tokenization-ctm.docx',
};

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textOf(xml) {
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('');
}

function paragraphText(xml) {
  return textOf(xml).replace(/\s+/g, ' ').trim();
}

function paragraphs(documentXml) {
  return [...documentXml.matchAll(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g)].map((match) => ({
    text: paragraphText(match[0]),
    style: match[0].match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? null,
  }));
}

function tableRows(documentXml) {
  return [...documentXml.matchAll(/<w:tbl(?: [^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((tableMatch) => {
    const tableXml = tableMatch[0];
    const gridColumns = [...tableXml.matchAll(/<w:gridCol(?: [^>]*)?\/>/g)].length;
    const rows = [...tableXml.matchAll(/<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g)].map((rowMatch) => {
      const rowXml = rowMatch[0];
      const cells = [...rowXml.matchAll(/<w:tc(?: [^>]*)?>[\s\S]*?<\/w:tc>/g)].map((cellMatch) => ({
        text: paragraphText(cellMatch[0]),
        gridSpan: Number(cellMatch[0].match(/<w:gridSpan w:val="(\d+)"/)?.[1] ?? 1),
        verticalMerge: cellMatch[0].match(/<w:vMerge(?: w:val="([^"]+)")?\s*\/>/)?.[1] ?? null,
      }));
      return { cells };
    });
    const firstHeader = rows.find((row) => row.cells.some((cell) => cell.text));
    return {
      columnCount: Math.max(gridColumns, ...rows.map((row) => row.cells.reduce((count, cell) => count + cell.gridSpan, 0)), 0),
      headerText: firstHeader?.cells.map((cell) => cell.text).filter(Boolean) ?? [],
      mergeSpans: rows.flatMap((row) => row.cells.filter((cell) => cell.gridSpan > 1).map((cell) => cell.gridSpan)),
      rows: rows.map((row) => row.cells.map((cell) => cell.text)),
    };
  });
}

function pageMargins(documentXml) {
  const margin = documentXml.match(/<w:pgMar\s+([^>]+)\/>/)?.[1] ?? '';
  const value = (key) => Number(margin.match(new RegExp(`w:${key}="(\\d+)"`))?.[1] ?? 0);
  return { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left'), header: value('header'), footer: value('footer'), gutter: value('gutter') };
}

function numberingSummary(numberingXml) {
  return {
    definitions: [...numberingXml.matchAll(/<w:abstractNum\s+w:abstractNumId="([^"]+)"[\s\S]*?<\/w:abstractNum>/g)].map((match) => ({
      id: match[1],
      levels: [...match[0].matchAll(/<w:lvl\s+w:ilvl="(\d+)"[\s\S]*?<\/w:lvl>/g)].map((level) => Number(level[1])),
    })),
    instances: [...numberingXml.matchAll(/<w:num\s+w:numId="([^"]+)"[\s\S]*?<\/w:num>/g)].map((match) => match[1]),
  };
}

function sectionOrderFor(key, ps) {
  if (key === 'pl02') return ['I. GIỚI THIỆU CHUNG', 'II. YÊU CẦU CHỨC NĂNG', 'III. KẾ HOẠCH VÀ NHÂN SỰ THAM GIA'];
  if (key === 'pl03b') return ['1. GIỚI THIỆU CHUNG.', '2. ĐẶC TẢ KỸ THUẬT.', '2.1 Luồng hoạt động', '2.2 Services', '2.3 Database', '2.4 Integration Services', '2.5 NTF-UI'];
  return ['I. Kiểm soát đầu vào dữ liệu', 'II. Quản lý mật khẩu và xác thực', 'III. Quản lý phiên', 'IV. Hạn chế truy cập', 'V. Xử lý lỗi và lưu log', 'VI. Review code'];
}

function resolvedFindings(key) {
  if (key === 'pl02') return [
    'Observed OOXML has no revision/change-tracking table before the TOC; PL02 fixture does not invent one.',
    'Observed PL02 has a TOC field and roman H1 numbering with numbered and lettered descendants.',
    'Observed PL02 contains header/footer references and a continuous section with four unequal page margins.',
  ];
  if (key === 'pl03b') return [
    'Observed revision table is the first table before the TOC with six columns: STT, Mô tả thay đổi, Ngày thay đổi, Phiên bản, Phụ trách, Ghi chú.',
    'Observed no signature block in the source document; revision table carries authored changes.',
    'Observed flow is represented by numbered hop paragraphs in OOXML, not a matrix or diagram.',
  ];
  return [
    'Observed checklist has a two-row header where Đáp ứng spans Có and Không, plus fixed applicability and notes columns.',
    'Observed sections I–V are the static checklist baseline; section VI contains the source document review examples and is excluded from the PL07 AI baseline fixture.',
    'Observed signature block is a three-row table with date row and two sign-off columns.',
  ];
}

async function loadSource(key) {
  const path = resolve(SOURCE_DIR, sources[key]);
  const bytes = await readFile(path);
  const zip = await JSZip.loadAsync(bytes);
  const part = async (name) => zip.file(name)?.async('text') ?? '';
  const documentXml = await part('word/document.xml');
  const numberingXml = await part('word/numbering.xml');
  const headerXml = await part('word/header1.xml');
  const footerXml = await part('word/footer1.xml');
  return {
    path: `docs/pl-templates/${sources[key]}`,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
    documentXml,
    numberingXml,
    headerText: paragraphText(headerXml),
    footerText: paragraphText(footerXml),
  };
}

function extractPl07Baseline(source) {
  const checklistTable = tableRows(source.documentXml)[1];
  if (!checklistTable) throw new Error('PL07 checklist table not found');
  const sections = [];
  let current;
  let currentItem;
  for (const row of checklistTable.rows) {
    const [number = '', text = ''] = row;
    if (/^[IVV]+$/.test(number) && text) {
      current = { id: number, title: text, items: [] };
      sections.push(current);
      currentItem = undefined;
    } else if (current && /^\d+$/.test(number)) {
      currentItem = { number, text };
      current.items.push(currentItem);
    } else if (currentItem && /^[a-d]$/.test(number)) {
      currentItem.subItems ??= [];
      currentItem.subItems.push({ number, text });
    }
  }
  const baselineSections = sections.filter((section) => ['I', 'II', 'III', 'IV', 'V'].includes(section.id));
  if (baselineSections.length !== 5 || baselineSections.some((section) => section.items.length === 0)) throw new Error('PL07 baseline extraction incomplete');
  return {
    schemaVersion: 1,
    extractionVersion: EXTRACTION_VERSION,
    sourcePath: source.path,
    sourceSha256: source.sha256,
    exactTextRule: 'Concatenate w:t runs in document order; decode XML entities; preserve source punctuation, Unicode, item order, and explicit sub-item prefixes.',
    sections: baselineSections,
  };
}

function structureFixture(key, source) {
  const tables = tableRows(source.documentXml).map(({ rows, ...summary }) => summary);
  return {
    schemaVersion: 1,
    extractionVersion: EXTRACTION_VERSION,
    sourcePath: source.path,
    sourceSha256: source.sha256,
    sectionOrder: sectionOrderFor(key),
    tables,
    numbering: numberingSummary(source.numberingXml),
    pageMargins: pageMargins(source.documentXml),
    headers: source.headerText ? [{ part: 'word/header1.xml', text: source.headerText }] : [],
    footers: source.footerText ? [{ part: 'word/footer1.xml', text: source.footerText }] : [],
    toc: { present: /TOC|TOCHeading/.test(source.documentXml), fieldCount: (source.documentXml.match(/TOC/g) ?? []).length },
    revisionTable: {
      present: key === 'pl03b',
      columns: key === 'pl03b' ? ['STT', 'Mô tả thay đổi', 'Ngày thay đổi', 'Phiên bản', 'Phụ trách', 'Ghi chú'] : [],
    },
    signature: { present: key === 'pl07', observedText: key === 'pl07' ? ['CÁN BỘ PHÁT TRIỂN', 'CÁN BỘ PHÊ DUYỆT'] : [] },
    resolvedFindings: resolvedFindings(key),
  };
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const regenerate = process.argv.includes('--regenerate');
const existingManifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
const loaded = {};
for (const key of Object.keys(sources)) loaded[key] = await loadSource(key);
if (existingManifest && !regenerate) {
  for (const key of Object.keys(sources)) {
    const expected = existingManifest.templates?.[key]?.sha256;
    if (expected && expected !== loaded[key].sha256) throw new Error(`SOURCE_HASH_MISMATCH:${key}`);
  }
}

const manifest = {
  schemaVersion: 1,
  extractionVersion: EXTRACTION_VERSION,
  templates: Object.fromEntries(Object.keys(sources).map((key) => [key, {
    path: loaded[key].path,
    sha256: loaded[key].sha256,
    sizeBytes: loaded[key].sizeBytes,
  }])),
};
await mkdir(resolve(OUT_DIR, 'ai'), { recursive: true });
await mkdir(resolve(OUT_DIR, 'docx'), { recursive: true });
await writeFile(manifestPath, json(manifest));
await writeFile(resolve(OUT_DIR, 'ai/pl07-baseline.json'), json(extractPl07Baseline(loaded.pl07)));
for (const key of Object.keys(sources)) await writeFile(resolve(OUT_DIR, `docx/${key}-structure.json`), json(structureFixture(key, loaded[key])));
console.log(`Wrote ${Object.keys(sources).length} source fixtures using ${EXTRACTION_VERSION}.`);
