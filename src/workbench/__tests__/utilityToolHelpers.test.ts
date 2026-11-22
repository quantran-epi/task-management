import { describe, it, expect } from 'vitest';
import {
  encodeText, decodeText, runRegex, REGEX_MAX_INPUT, REGEX_MAX_MATCHES,
  timestampToDate, dateToTimestamp, calculateDate, transformText,
  parseCron, nextCronRuns, computeHash, makeUuids, decodeJwt,
} from '../toolwindows/utilityToolHelpers';

const b64url = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('encode/decode', () => {
  it('roundtrip tiếng Việt qua base64, url, html', () => {
    const text = 'Tiếng Việt có dấu: à á ả ãạ <b> & "quotes"';
    for (const kind of ['base64', 'url', 'html'] as const) {
      expect(decodeText(encodeText(text, kind), kind)).toBe(text);
    }
  });

  it('base64 sai throw lỗi rõ', () => {
    expect(() => decodeText('@@@', 'base64')).toThrow(/Base64/);
  });
});

describe('runRegex', () => {
  it('bắt group và trả index', () => {
    const r = runRegex('(a+)(b)', '', 'xxaaabyyab');
    expect(r.error).toBeNull();
    expect(r.matches).toEqual([
      { index: 2, value: 'aaab', groups: ['aaa', 'b'] },
      { index: 8, value: 'ab', groups: ['a', 'b'] },
    ]);
    expect(r.count).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it('pattern sai và flag lạ trả error thay vì ném', () => {
    expect(runRegex('(', '', 'x').error).toBeTruthy();
    expect(runRegex('a', 'z', 'x').error).toMatch(/Flag/);
  });

  it('input quá dài bị chặn, không cắt ngang', () => {
    const r = runRegex('a', 'g', 'a'.repeat(REGEX_MAX_INPUT + 1));
    expect(r.error).toMatch(/100\.000/);
    expect(r.matches).toEqual([]);
  });

  it('giới hạn số match và báo truncated', () => {
    const r = runRegex('a', 'g', 'a'.repeat(REGEX_MAX_MATCHES + 10));
    expect(r.count).toBe(REGEX_MAX_MATCHES);
    expect(r.truncated).toBe(true);
  });
});

describe('timestamp / date', () => {
  it('đổi giây và mili giây', () => {
    expect(timestampToDate('0', 's').iso).toBe('1970-01-01T00:00:00.000Z');
    expect(timestampToDate('1000', 'ms').unixMs).toBe(1000);
    expect(timestampToDate('1700000000000', 'ms').iso).toBe('2023-11-14T22:13:20.000Z');
  });

  it('timestamp sai throw', () => {
    expect(() => timestampToDate('abc', 's')).toThrow();
    expect(() => timestampToDate('9e30', 's')).toThrow();
  });

  it('dateToTimestamp theo đầu ngày UTC', () => {
    expect(dateToTimestamp('1970-01-02')).toEqual({ seconds: 86400, millis: 86400000 });
    expect(() => dateToTimestamp('không phải ngày')).toThrow();
  });

  it('add/subtract/diff và input sai', () => {
    expect(calculateDate({ date: '2024-01-31', op: 'add', amount: 1, unit: 'month' }).output).toBe('2024-02-29');
    expect(calculateDate({ date: '2024-01-10', op: 'subtract', amount: 2, unit: 'week' }).output).toBe('2023-12-27');
    expect(calculateDate({ date: '2024-01-10', op: 'diff', amount: 0, unit: 'day', compareDate: '2024-01-01' }).output).toBe('9');
    expect(calculateDate({ date: 'x', op: 'add', amount: 1, unit: 'day' }).error).toBeTruthy();
    expect(calculateDate({ date: '2024-01-01', op: 'diff', amount: 0, unit: 'day' }).error).toBeTruthy();
  });
});

describe('transformText', () => {
  it('đổi case theo token', () => {
    expect(transformText('hello world-foo', 'camel')).toBe('helloWorldFoo');
    expect(transformText('hello world-foo', 'snake')).toBe('hello_world_foo');
    expect(transformText('hello world-foo', 'kebab')).toBe('hello-world-foo');
    expect(transformText('hello world', 'title')).toBe('Hello World');
  });

  it('sắp xếp dòng ổn định và đếm byte UTF-8', () => {
    expect(transformText('b\na\nb', 'dedupe-lines')).toBe('b\na');
    expect(transformText('b\na\nc', 'sort-lines')).toBe('a\nb\nc');
    expect(transformText('c\na\nb', 'reverse-lines')).toBe('b\na\nc');
    expect(transformText('Việt', 'count')).toMatch(/4 ký tự · 1 từ · 1 dòng · 6 byte/);
  });
});

describe('cron', () => {
  it('parse đúng và sai', () => {
    const ok = parseCron('*/15 9 * 1-12 1-5');
    expect(ok.valid).toBe(true);
    expect(ok.description).toMatch(/Mỗi 15 phút/);
    expect(parseCron('* * *').error).toMatch(/5 trường/);
    expect(parseCron('60 * * * *').valid).toBe(false);
    expect(parseCron('a * * * *').valid).toBe(false);
  });

  it('nextCronRuns trả các lần chạy tăng dần, expr sai trả rỗng', () => {
    const runs = nextCronRuns('0 9 * * *', 3, new Date('2024-01-01T00:00:00Z'));
    expect(runs).toHaveLength(3);
    expect(runs[0]!.getHours()).toBe(9);
    expect(runs[0]!.getMinutes()).toBe(0);
    expect(runs[1]!.getTime()).toBeGreaterThan(runs[0]!.getTime());
    expect(nextCronRuns('bad', 3, new Date())).toEqual([]);
  });
});

describe('hash / uuid', () => {
  it('độ dài hex đúng cho 3 thuật toán', async () => {
    expect(await computeHash('x', 'SHA-256')).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeHash('x', 'SHA-384')).toMatch(/^[0-9a-f]{96}$/);
    expect(await computeHash('x', 'SHA-512')).toMatch(/^[0-9a-f]{128}$/);
  });

  it('uuid đúng format và clamp 1..100', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(makeUuids(1)[0]).toMatch(uuid);
    expect(makeUuids(0)).toHaveLength(1);
    expect(makeUuids(500)).toHaveLength(100);
  });
});

describe('decodeJwt', () => {
  const token = (payload: unknown) =>
    `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signaturesauraitpuetrefausse`;

  it('decode exp/iat, đánh dấu hết hạn', () => {
    const r = decodeJwt(token({ sub: 'quan', iat: 1000000000, exp: 1000000060 }));
    expect(r.error).toBeNull();
    expect(r.payload).toMatchObject({ sub: 'quan' });
    expect(r.issuedAt).toBe('2001-09-09T01:46:40.000Z');
    expect(r.expiresAt).toBe('2001-09-09T01:47:40.000Z');
    expect(r.expired).toBe(true);
  });

  it('đổi signature vẫn decode được — chứng minh không verify', () => {
    const original = token({ sub: 'quan' });
    const tampered = original.slice(0, original.lastIndexOf('.') + 1) + 'khongphailachuky';
    expect(decodeJwt(tampered).payload).toEqual(decodeJwt(original).payload);
    expect(decodeJwt(tampered).error).toBeNull();
  });

  it('không có exp thì expired null; token hỏng trả error', () => {
    expect(decodeJwt(token({ sub: 'quan' })).expired).toBeNull();
    expect(decodeJwt('abc').error).toMatch(/3 phần/);
  });
});
