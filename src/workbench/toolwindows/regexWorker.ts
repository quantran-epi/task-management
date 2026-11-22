/// <reference lib="webworker" />

import { REGEX_MAX_MATCHES, type RegexMatch } from './utilityToolHelpers';

type Request = { pattern: string; flags: string; input: string };
type Response = { matches: RegexMatch[]; truncated: boolean; error: string | null };

self.onmessage = (event: MessageEvent<Request>) => {
  const { pattern, flags, input } = event.data;
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
    const response: Response = { matches, truncated, error: null };
    self.postMessage(response);
  } catch (e) {
    const response: Response = { matches: [], truncated: false, error: e instanceof Error ? e.message : String(e) };
    self.postMessage(response);
  }
};

export {};
