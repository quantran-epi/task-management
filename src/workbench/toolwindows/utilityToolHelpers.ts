import dayjs from 'dayjs';

type EncodeKind = 'base64' | 'url' | 'html';

function base64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64Decode(input: string): string {
  const clean = input.replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new Error('Base64 không hợp lệ');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Base64 không chứa UTF-8 hợp lệ');
  }
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function encodeText(input: string, kind: EncodeKind): string {
  switch (kind) {
    case 'base64': return base64Encode(input);
    case 'url': return encodeURIComponent(input);
    case 'html': return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
  }
}

export function decodeText(input: string, kind: EncodeKind): string {
  switch (kind) {
    case 'base64': return base64Decode(input);
    case 'url': return decodeURIComponent(input);
    case 'html':
      // `&amp;` must be last so `&amp;lt;` does not become a literal `<`.
      return input
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
  }
}

export const REGEX_MAX_INPUT = 100000;
export const REGEX_MAX_MATCHES = 200;

export type RegexMatch = { index: number; value: string; groups: string[] };
export type RegexResult = {
  matches: RegexMatch[];
  count: number;
  truncated: boolean;
  error: string | null;
};

/**
 * Regex có thể backtracking cấp số nhân và treo UI. Chọn giới hạn cứng input/số match
 * thay vì Worker: giữ luồng đơn giản, dữ liệu không rời tab. Vẫn không chặn được
 * pattern nguy hiểm khớp một lần nhưng tốn thời gian — bỏ qua theo yêu cầu đơn giản.
 */
export function runRegex(pattern: string, flags: string, input: string): RegexResult {
  if (input.length > REGEX_MAX_INPUT) {
    return { matches: [], count: 0, truncated: false, error: `Đầu vào quá dài (tối đa ${REGEX_MAX_INPUT.toLocaleString('vi-VN')} ký tự)` };
  }
  const invalid = [...flags].filter((f) => !'gimsuy'.includes(f));
  if (invalid.length || new Set(flags).size !== flags.length) {
    return { matches: [], count: 0, truncated: false, error: `Flag không hợp lệ: ${invalid.join('') || 'trùng lặp'}. Chỉ dùng gimsuy` };
  }
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    const matches: RegexMatch[] = [];
    let truncated = false;
    for (const hit of input.matchAll(re)) {
      if (matches.length >= REGEX_MAX_MATCHES) {
        truncated = true;
        break;
      }
      matches.push({
        index: hit.index ?? 0,
        value: hit[0] ?? '',
        groups: hit.slice(1).map((g) => g ?? ''),
      });
    }
    return { matches, count: matches.length, truncated, error: null };
  } catch (e) {
    return { matches: [], count: 0, truncated: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function timestampToDate(value: string, unit: 's' | 'ms'): { iso: string; local: string; utc: string; unixMs: number } {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric)) throw new Error('Timestamp không phải số');
  const unixMs = unit === 's' ? numeric * 1000 : numeric;
  if (!Number.isSafeInteger(unixMs) || Math.abs(unixMs) > 8.64e15) throw new Error('Timestamp ngoài khoảng ngày hợp lệ');
  const date = dayjs(unixMs);
  if (!date.isValid()) throw new Error('Timestamp không hợp lệ');
  return {
    iso: date.toISOString(),
    local: date.format('YYYY-MM-DD HH:mm:ss'),
    utc: new Date(unixMs).toISOString().replace('T', ' ').replace('Z', ' UTC'),
    unixMs,
  };
}

export function dateToTimestamp(dateStr: string): { seconds: number; millis: number } {
  // Đầu ngày UTC: timestamp không đổi theo timezone của máy chạy helper.
  const millis = Date.parse(`${dateStr}T00:00:00.000Z`);
  if (!Number.isFinite(millis) || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Ngày không hợp lệ');
  return { seconds: Math.floor(millis / 1000), millis };
}

export type DateCalcArgs = {
  date: string;
  op: 'add' | 'subtract' | 'diff';
  amount: number;
  unit: 'day' | 'week' | 'month' | 'year';
  compareDate?: string;
};

export function calculateDate(args: DateCalcArgs): { output: string; error: string | null } {
  const date = dayjs(args.date);
  if (!date.isValid()) return { output: '', error: 'Ngày không hợp lệ' };
  if (args.op === 'diff') {
    if (!args.compareDate) return { output: '', error: 'Chọn ngày cần so sánh' };
    const compare = dayjs(args.compareDate);
    if (!compare.isValid()) return { output: '', error: 'Ngày so sánh không hợp lệ' };
    return { output: String(date.diff(compare, 'day')), error: null };
  }
  if (!Number.isFinite(args.amount)) return { output: '', error: 'Số lượng không hợp lệ' };
  const shifted = args.op === 'add' ? date.add(args.amount, args.unit) : date.subtract(args.amount, args.unit);
  return { output: shifted.format('YYYY-MM-DD'), error: null };
}

export type TextOp = 'upper' | 'lower' | 'title' | 'camel' | 'snake' | 'kebab' | 'trim' | 'sort-lines' | 'dedupe-lines' | 'reverse-lines' | 'remove-blank' | 'count';

function words(input: string): string[] {
  return input.trim().split(/[\s_-]+/).filter(Boolean);
}

export function transformText(input: string, op: TextOp): string {
  switch (op) {
    case 'upper': return input.toUpperCase();
    case 'lower': return input.toLowerCase();
    case 'title': return words(input).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    case 'camel': {
      const parts = words(input).map((w) => w.toLowerCase());
      return parts.map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
    }
    case 'snake': return words(input).map((w) => w.toLowerCase()).join('_');
    case 'kebab': return words(input).map((w) => w.toLowerCase()).join('-');
    case 'trim': return input.trim();
    case 'sort-lines': return input.split('\n').sort().join('\n');
    case 'dedupe-lines': return [...new Set(input.split('\n').filter((line) => line.trim()))].join('\n');
    case 'reverse-lines': return input.split('\n').reverse().join('\n');
    case 'remove-blank': return input.split('\n').filter((line) => line.trim()).join('\n');
    case 'count': {
      const lineCount = input ? input.split('\n').length : 0;
      return `${input.length} ký tự · ${words(input).length} từ · ${lineCount} dòng · ${new TextEncoder().encode(input).length} byte`;
    }
  }
}

type CronField = { min: number; max: number };
const CRON_FIELDS: CronField[] = [
  { min: 0, max: 59 }, { min: 0, max: 23 }, { min: 1, max: 31 }, { min: 1, max: 12 }, { min: 0, max: 7 },
];

function parseCronField(raw: string, field: CronField): number[] {
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    if (!part) throw new Error('Trường cron rỗng');
    const [range, stepRaw, ...rest] = part.split('/');
    if (rest.length || (stepRaw !== undefined && !/^\d+$/.test(stepRaw))) throw new Error(`Bước không hợp lệ: ${part}`);
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (step < 1) throw new Error(`Bước phải >= 1: ${part}`);
    let from: number;
    let to: number;
    if (range === '*') {
      from = field.min;
      to = field.max;
    } else if (/^\d+$/.test(range!)) {
      from = Number(range);
      to = stepRaw === undefined ? from : field.max;
    } else if (/^\d+-\d+$/.test(range!)) {
      const [a, b] = range!.split('-').map(Number);
      from = a!;
      to = b!;
    } else {
      throw new Error(`Giá trị không hợp lệ: ${part}`);
    }
    if (from < field.min || to > field.max || from > to) throw new Error(`Giá trị ngoài phạm vi: ${part}`);
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return [...values].sort((a, b) => a - b);
}

function describeCron(fields: string[]): string {
  const [minute = '*', hour = '*', day = '*', month = '*', weekday = '*'] = fields;
  const minuteText = minute === '*' ? 'Mỗi phút' : minute.startsWith('*/') ? `Mỗi ${minute.slice(2)} phút` : `Phút ${minute}`;
  const hourText = hour === '*' ? 'mọi giờ' : `lúc ${hour.padStart(2, '0')}:00`;
  const dayText = day === '*' ? 'mọi ngày' : `ngày ${day}`;
  const monthText = month === '*' ? 'mọi tháng' : `tháng ${month}`;
  const weekdayText = weekday === '*' ? 'mọi ngày trong tuần' : `ngày tuần ${weekday}`;
  return `${minuteText} · ${hourText} · ${dayText} · ${monthText} · ${weekdayText}`;
}

export function parseCron(expr: string): { valid: boolean; fields: string[]; description: string; error: string | null } {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return { valid: false, fields, description: '', error: 'Cần đúng 5 trường: phút giờ ngày tháng ngày-tuần' };
  try {
    fields.forEach((field, i) => {
      if (!parseCronField(field, CRON_FIELDS[i]!)) throw new Error('Trường rỗng');
    });
    return { valid: true, fields, description: describeCron(fields), error: null };
  } catch (e) {
    return { valid: false, fields, description: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export function nextCronRuns(expr: string, count = 5, now = new Date()): Date[] {
  const parsed = parseCron(expr);
  if (!parsed.valid) return [];
  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parsed.fields;
  const minutes = new Set(parseCronField(minuteRaw!, CRON_FIELDS[0]!));
  const hours = new Set(parseCronField(hourRaw!, CRON_FIELDS[1]!));
  const days = new Set(parseCronField(dayRaw!, CRON_FIELDS[2]!));
  const months = new Set(parseCronField(monthRaw!, CRON_FIELDS[3]!));
  const weekdays = new Set(parseCronField(weekdayRaw!, CRON_FIELDS[4]!).map((d) => d % 7));

  const runs: Date[] = [];
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);
  const limit = start.getTime() + 366 * 24 * 60 * 60 * 1000;
  for (let cursor = start.getTime(); cursor <= limit && runs.length < count; cursor += 60000) {
    const d = new Date(cursor);
    if (!minutes.has(d.getMinutes()) || !hours.has(d.getHours())) continue;
    if (!months.has(d.getMonth() + 1) || !days.has(d.getDate()) || !weekdays.has(d.getDay())) continue;
    runs.push(d);
  }
  return runs;
}

export type HashAlgo = 'SHA-256' | 'SHA-384' | 'SHA-512';

export async function computeHash(input: string, algo: HashAlgo): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto không khả dụng trong môi trường này');
  const digest = await subtle.digest(algo, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeUuids(count: number): string[] {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('crypto.randomUUID không khả dụng');
  const safe = Math.min(100, Math.max(1, Math.floor(count) || 1));
  return Array.from({ length: safe }, () => globalThis.crypto.randomUUID());
}

export type JwtResult = {
  header: unknown;
  payload: unknown;
  issuedAt: string | null;
  expiresAt: string | null;
  expired: boolean | null;
  error: string | null;
};

function decodeBase64Url(part: string): unknown {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
}

/** Chỉ decode 2 phần đầu. Signature bị bỏ qua hoàn toàn — KHÔNG verify, KHÔNG dùng để xác thực. */
export function decodeJwt(token: string): JwtResult {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    return { header: null, payload: null, issuedAt: null, expiresAt: null, expired: null, error: 'JWT phải có đúng 3 phần' };
  }
  try {
    const header = decodeBase64Url(parts[0]!);
    const payload = decodeBase64Url(parts[1]!);
    const claims = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const seconds = (key: 'iat' | 'exp'): number | null =>
      typeof claims[key] === 'number' && Number.isFinite(claims[key]) ? claims[key] as number : null;
    const iat = seconds('iat');
    const exp = seconds('exp');
    return {
      header,
      payload,
      issuedAt: iat === null ? null : new Date(iat * 1000).toISOString(),
      expiresAt: exp === null ? null : new Date(exp * 1000).toISOString(),
      expired: exp === null ? null : exp * 1000 < Date.now(),
      error: null,
    };
  } catch (e) {
    return { header: null, payload: null, issuedAt: null, expiresAt: null, expired: null, error: e instanceof Error ? e.message : String(e) };
  }
}
