import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  encodeText, decodeText, runRegex, REGEX_MAX_INPUT, REGEX_MAX_MATCHES,
  timestampToDate, dateToTimestamp, calculateDate, transformText,
  parseCron, nextCronRuns, computeHash, makeUuids, decodeJwt,
} from '../toolwindows/utilityToolHelpers';

const b64url = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** jsdom không có Worker: fake tối giản chạy cùng logic trong onmessage để test helper. */
class FakeWorker {
  onmessage: ((event: MessageEvent<any>) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    setTimeout(() => {
      const { pattern, flags, input } = (this as any)._payload;
      try {
        const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
        const matches = [];
        let truncated = false;
        for (const hit of input.matchAll(re)) {
          if (matches.length >= REGEX_MAX_MATCHES) { truncated = true; break; }
          matches.push({ index: hit.index ?? 0, value: hit[0] ?? '', groups: hit.slice(1).map((g: string | undefined) => g ?? '') });
        }
        this.onmessage?.({ data: { matches, truncated, error: null } } as MessageEvent);
      } catch (e) {
        this.onmessage?.({ data: { matches: [], truncated: false, error: (e as Error).message } } as MessageEvent);
      }
    }, 0);
  }
  postMessage(payload: any) { (this as any)._payload = payload; }
  terminate() {}
}

const originalWorker = globalThis.Worker;
beforeAll(() => { (globalThis as any).Worker = FakeWorker; });
afterAll(() => { (globalThis as any).Worker = originalWorker; });

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

  it('decode HTML numeric/named entity', () => {
    expect(decodeText('&#65;', 'html')).toBe('A');
    expect(decodeText('&#x1F600;', 'html')).toBe('😀');
    expect(decodeText('&nbsp;', 'html')).toBe(' ');
    expect(decodeText('&apos;', 'html')).toBe("'");
  });
});

describe('runRegex', () => {
  it('bắt group và trả index', async () => {
    const r = await runRegex('(a+)(b)', '', 'xxaaabyyab');
    expect(r.error).toBeNull();
    expect(r.matches).toEqual([
      { index: 2, value: 'aaab', groups: ['aaa', 'b'] },
      { index: 8, value: 'ab', groups: ['a', 'b'] },
    ]);
    expect(r.count).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it('pattern sai và flag lạ trả error thay vì ném', async () => {
    expect((await runRegex('(', '', 'x')).error).toBeTruthy();
    expect((await runRegex('a', 'z', 'x')).error).toMatch(/Flag/);
    expect((await runRegex('a', 'dgimsuy', 'a')).error).toBeNull();
    expect((await runRegex('a', 'v', 'a')).error).toBeNull();
  });

  it('input quá dài bị chặn, không cắt ngang', async () => {
    const r = await runRegex('a', 'g', 'a'.repeat(REGEX_MAX_INPUT + 1));
    expect(r.error).toMatch(/100\.000/);
    expect(r.matches).toEqual([]);
  });

  it('giới hạn số match và báo truncated', async () => {
    const r = await runRegex('a', 'g', 'a'.repeat(REGEX_MAX_MATCHES + 10));
    expect(r.count).toBe(REGEX_MAX_MATCHES);
    expect(r.truncated).toBe(true);
  });

  it('worker không trả kết quả thì timeout hủy regex', async () => {
    const saved = (globalThis as any).Worker;
    (globalThis as any).Worker = class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
    };
    try {
      const r = await runRegex('(a+)+$', '', 'a'.repeat(40) + '!', 20);
      expect(r.error).toMatch(/hủy/);
      expect(r.matches).toEqual([]);
    } finally {
      (globalThis as any).Worker = saved;
    }
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
    expect(() => dateToTimestamp('2024-02-30')).toThrow(/không hợp lệ/);
  });

  it('add/subtract/diff và input sai', () => {
    expect(calculateDate({ date: '2024-01-31', op: 'add', amount: 1, unit: 'month' }).output).toBe('2024-02-29');
    expect(calculateDate({ date: '2024-01-10', op: 'subtract', amount: 2, unit: 'week' }).output).toBe('2023-12-27');
    expect(calculateDate({ date: '2024-01-10', op: 'diff', amount: 0, unit: 'day', compareDate: '2024-01-01' }).output).toBe('9');
    expect(calculateDate({ date: 'x', op: 'add', amount: 1, unit: 'day' }).error).toBeTruthy();
    expect(calculateDate({ date: '2024-02-30', op: 'add', amount: 1, unit: 'day' }).error).toMatch(/không hợp lệ/);
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

  it('29/02 vẫn tìm được lần chạy dù ngoài 366 ngày', () => {
    const runs = nextCronRuns('0 0 29 2 *', 1, new Date('2025-03-01T00:00:00Z'));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.getUTCFullYear()).toBe(2028);
  });

  it('day-of-month và day-of-week dùng OR khi cả hai bị restrict', () => {
    const runs = nextCronRuns('0 9 1 * 1', 3, new Date('2024-01-02T00:00:00Z'));
    expect(runs.length).toBe(3);
    // 2024-01-08 là Thứ Hai dù không phải ngày 1 → phải được tính
    expect(runs.some((d) => d.getDate() === 8)).toBe(true);
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

  it('exp quá lớn không làm mất payload', () => {
    const r = decodeJwt(token({ sub: 'quan', exp: 1e20 }));
    expect(r.error).toBeNull();
    expect(r.payload).toMatchObject({ sub: 'quan' });
    expect(r.expiresAt).toBeNull();
  });
});
