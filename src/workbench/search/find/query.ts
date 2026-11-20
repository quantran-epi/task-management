import { confineRepoPath } from '../../../services/gitRemoteTreeService';
import type { GrepRemoteRefOptions } from '../../../services/gitRemoteService';
import { FIND_MATCH_LIMIT } from './session';

/** Single source of truth lives in session.ts; re-exported at the query boundary for plan 02. */
export type { RemoteQuery } from './session';
import type { RemoteQuery } from './session';

const BACKSLASH = String.fromCharCode(92);
const WORD_BOUNDARY = BACKSLASH + 'b';

/**
 * RemoteQuery to service options. Pure: no command string is built here, and every user string
 * stays DATA. grepRemoteRef is the only place values reach a shell (D-09, one-way).
 */
export function buildGrepOptions(query: RemoteQuery): GrepRemoteRefOptions {
  // Word boundaries are regex-only: literal mode (-F) treats a boundary as text.
  const pattern = query.words && query.regex ? WORD_BOUNDARY + query.pattern + WORD_BOUNDARY : query.pattern;
  return {
    pattern,
    caseSensitive: query.matchCase,
    literal: !query.regex,
    limit: FIND_MATCH_LIMIT,
    // Directory scope requires a path; confineRepoPath refuses an escaping/empty directory
    // before any command is issued (T-46.1-02).
    ...(query.scope === 'directory' ? { path: confineRepoPath(query.directory ?? '') } : {}),
  };
}

/** Translate one glob to an anchored regex. Stars and ? never cross a slash; double-star does. */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (c === '?') {
      source += '[^/]';
    } else {
      if ('.+^${}()|[]'.includes(c)) source += BACKSLASH;
      source += c;
    }
  }
  return new RegExp('^' + source + '$');
}

/** Client-side file-mask predicate for Files/Folders modes (plan 04). Empty mask matches all. */
export function matchesMask(path: string, mask: string | undefined): boolean {
  if (!mask || !mask.trim()) return true;
  return globToRegExp(mask.trim()).test(path);
}
