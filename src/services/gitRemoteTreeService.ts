import type { SshConfig } from '../types/ssh';
import type { RemoteGitTreeNode, RemoteFilePage } from '../types/gitRemote';
import { runGitCommand, escapeShellArg, getUncommittedFiles } from './gitRemoteService';
import { execRemoteCommand } from './sshService';
import { foldForSearch, searchIncludes } from '../utils/searchText';

/**
 * Parses git ls-tree -l output lines:
 * Format: <mode> SP <type> SP <object> SP <object size>\t<file>
 * For tree/commit objects, size is '-' or empty space.
 */
export function parseLsTreeLine(line: string, baseDir?: string): RemoteGitTreeNode | null {
  const tabIndex = line.indexOf('\t');
  if (tabIndex === -1) return null;

  const metaPart = line.slice(0, tabIndex).trim();
  const fileName = line.slice(tabIndex + 1);
  if (!fileName) return null;

  const tokens = metaPart.split(/\s+/);
  if (tokens.length < 3) return null;

  const type = tokens[1];
  const sha = tokens[2] || '';
  const sizeToken = tokens[3];

  const isLeaf = type === 'blob';
  const rawSize = sizeToken && sizeToken !== '-' ? parseInt(sizeToken, 10) : undefined;
  const size = typeof rawSize === 'number' && !Number.isNaN(rawSize) ? rawSize : undefined;

  const key = baseDir ? `${baseDir.replace(/\/+$/, '')}/${fileName}` : fileName;

  return {
    key,
    title: fileName,
    isLeaf,
    ...(size !== undefined ? { size } : {}),
    sha,
  };
}

/**
 * Sorts tree nodes: directories first (alphabetical), then files (alphabetical).
 */
export function sortTreeNodes(nodes: RemoteGitTreeNode[]): RemoteGitTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isLeaf !== b.isLeaf) {
      return a.isLeaf ? 1 : -1;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

/**
 * Merges uncommitted files into a list of RemoteGitTreeNode items.
 * If baseDir is provided (e.g. "src"), only uncommitted files inside that directory are merged.
 */
export function mergeUncommittedFilesIntoTree(
  nodes: RemoteGitTreeNode[],
  uncommittedFiles: Array<{ path: string; indexStatus: string; workingTreeStatus: string }>,
  baseDir?: string
): RemoteGitTreeNode[] {
  const resultNodes = [...nodes];
  const nodeMap = new Map<string, RemoteGitTreeNode>();
  resultNodes.forEach((n) => nodeMap.set(n.title, n));

  const cleanBaseDir = baseDir ? baseDir.replace(/^\/+|\/+$/g, '') : '';
  const basePrefix = cleanBaseDir ? `${cleanBaseDir}/` : '';

  for (const item of uncommittedFiles) {
    const filePath = item.path.replace(/^\/+/, '');
    if (basePrefix && !filePath.startsWith(basePrefix)) {
      continue;
    }

    const relPath = basePrefix ? filePath.slice(basePrefix.length) : filePath;
    const parts = relPath.split('/').filter(Boolean);
    const directName = parts[0];
    if (!directName) continue;

    // Determine combined status: prefer workingTreeStatus if not space/'?', else indexStatus
    let status = '';
    if (item.indexStatus === '?' || item.workingTreeStatus === '?') {
      status = '?';
    } else {
      const idx = item.indexStatus.trim();
      const wt = item.workingTreeStatus.trim();
      status = `${idx}${wt}` || 'M';
    }

    // Keys stay repo-relative even when merging into a baseDir subtree: reveal/compact map
    // paths against the full path, so `baseDir='tracked/new'` must not key a child as `new/x`.
    // Only fabricate the whole chain when the TOP segment is absent from the ref. An untracked
    // directory has no `ls-tree <ref>:<dir>` object, so without a materialized chain it can never
    // expand. For a folder already present in the ref (existingNode below), children come from
    // the real tree via onLoadData — fabricating even one child here would make AntD treat the
    // folder as loaded and skip that fetch, hiding every committed file inside it.
    const materializeChain = (start: RemoteGitTreeNode[], segments: string[], parentKey = '') => {
      let siblings = start;
      for (let i = 0; i < segments.length; i += 1) {
        const name = segments[i]!;
        const isLeaf = i === segments.length - 1;
        const key = [parentKey, ...segments.slice(0, i + 1)].filter(Boolean).join('/');
        let node = siblings.find((n) => n.title === name);
        if (!node) {
          node = {
            key,
            title: name,
            isLeaf,
            sha: '',
            ...(isLeaf ? { gitStatus: status } : { gitStatus: 'M', children: [] }),
          };
          siblings.push(node);
        }
        if (isLeaf) {
          node.gitStatus = status;
        } else {
          node.children = node.children ?? [];
          if (!node.gitStatus) node.gitStatus = 'M';
          siblings = node.children;
        }
      }
    };

    const existingNode = nodeMap.get(directName);
    if (existingNode) {
      // Badge only. A dirty path under a ref folder is materialized by a later fetch with this
      // folder as baseDir (onLoadData / reveal): every uncommitted row under that prefix then
      // gets its full chain, including folders the ref does not have. Adding children here —
      // even from the same status row — would pre-mark the node as loaded and hide committed
      // children that `ls-tree <ref>:<folder>` would otherwise return.
      if (parts.length === 1) {
        existingNode.gitStatus = status;
      } else if (!existingNode.gitStatus) {
        existingNode.gitStatus = 'M';
      }
      continue;
    }
    materializeChain(resultNodes, parts, cleanBaseDir);
  }

  // Rebuild the direct-child map so later items can merge into folders created in this pass.
  resultNodes.forEach((n) => nodeMap.set(n.title, n));
  return sortTreeNodes(resultNodes);
}


/**
 * A path this tool will not read, including traversal and symlink policy refusals.
 * The `git_read` handler maps this to `INVALID_ARGUMENT`, not infrastructure failure,
 * so the caller chooses another path instead of reporting a broken SSH connection.
 */
export class PathOutsideRepoError extends Error {}

/**
 * CR-02: resolves a repo-relative path and refuses anything that escapes the repository.
 *
 * `filePath.replace(/^\/+/, '')` alone let `../../` through, and the `cat` fallback then read
 * any file the SSH user could read. Normalising first collapses `a/../..` to `..`, so the
 * escape check cannot be walked around with a path that only looks contained.
 *
 * No `node:path` import: this module is bundled for the browser/Tauri renderer, where
 * `path.posix` is not available. The subset needed here is small and total.
 */
export function confineRepoPath(filePath: string, label = 'Đường dẫn'): string {
  const stripped = filePath.replace(/^\/+/, '');
  const segments: string[] = [];
  for (const segment of stripped.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // Popping past the root is the escape; refuse rather than clamp, so the caller learns
      // the path was rejected instead of silently reading a different file.
      if (segments.length === 0) throw new PathOutsideRepoError(`${label} ngoài repo: ${filePath}`);
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) throw new PathOutsideRepoError(`${label} ngoài repo: ${filePath}`);
  return segments.join('/');
}

/**
 * A `git cat-file` failure that means "this path is not in the ref" — the one case a
 * working-tree fallback can legitimately answer. Anything else (bad ref, SSH down) must
 * propagate, or the reviewer reads the working copy believing it is the branch (WR-01).
 *
 * WR-01: anchored to the exact path AND ref. An unanchored phrase match also fired for a ref
 * whose NAME contains the phrase (`invalid object name 'x does not exist in'`), letting a
 * model-chosen branch name force the fallback at will.
 */
export function isNotInRef(err: unknown, cleanPath: string, ref: string): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes(`path '${cleanPath}' does not exist in '${ref}'`) ||
    message.includes(`path '${cleanPath}' exists on disk, but not in '${ref}'`) ||
    // `ls-tree <ref>:<dir>` uses a different wording than cat-file for a missing directory.
    message.includes(`Not a valid object name ${ref}:${cleanPath}`)
  );
}

export interface RemoteTreeSearchResult {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  /** Offsets of the matched substring inside `name` (0 length = ancestor match, no highlight). */
  matchStart: number;
  matchLength: number;
}

export const SEARCH_RESULT_LIMIT = 100;

/** Whole-ref ls-tree stdout keyed by non-secret target identifiers. Query text is never a key. */
const searchTreeCache = new Map<string, string>();

/** Reset the whole-ref listing cache (tests / explicit invalidation). */
export function clearSearchTreeCache(): void {
  searchTreeCache.clear();
}

/**
 * Whole-ref file/folder search for the remote explorer. One confined read-only ls-tree command;
 * the query never reaches git (it is filtered client-side), so a leading `-` or path-escaping
 * text cannot alter options or escape the repo (T-quick-04).
 */
export async function searchRemoteTree(
  config: SshConfig,
  repoPath: string,
  ref: string,
  query: string,
  secret?: string,
  callId?: string
): Promise<RemoteTreeSearchResult[]> {
  const needle = foldForSearch(query);
  if (!needle || !repoPath.trim() || !ref) return [];

  // Literals plus the escaped ref only; the search text is data, filtered below.
  const gitArgs = ['ls-tree', '-r', '-l', '-z', '--end-of-options', escapeShellArg(ref)];
  const cacheKey = `${config.id}|${repoPath}|${ref}`;
  let stdout = searchTreeCache.get(cacheKey);
  if (stdout === undefined) {
    try {
      stdout = await runGitCommand(config, repoPath, gitArgs, secret, callId);
      searchTreeCache.set(cacheKey, stdout); // cache success only; a failure is never remembered
    } catch {
      return []; // git/SSH failure degrades to an empty result, never a UI crash
    }
  }

  const files: RemoteTreeSearchResult[] = [];
  const folders: RemoteTreeSearchResult[] = [];
  const seen = new Set<string>();

  const nameMatch = (name: string): { matchStart: number; matchLength: number } => {
    const index = name.toLowerCase().indexOf(needle);
    return index >= 0
      ? { matchStart: index, matchLength: needle.length }
      : { matchStart: 0, matchLength: 0 };
  };

  // Folders are navigation aids derived from matching-file ancestors; they must not consume the
  // file result cap (T-quick-06). Both collections stay confined and deduplicated by `seen`.
  const addFile = (path: string, name: string, size?: number) => {
    const clean = confineRepoPath(path, 'Đường dẫn kết quả');
    if (seen.has(clean) || files.length >= SEARCH_RESULT_LIMIT) return;
    seen.add(clean);
    files.push({ path: clean, name, type: 'file', ...(size !== undefined ? { size } : {}), ...nameMatch(name) });
  };
  const addFolder = (path: string, name: string) => {
    const clean = confineRepoPath(path, 'Đường dẫn kết quả');
    if (seen.has(clean)) return;
    seen.add(clean);
    folders.push({ path: clean, name, type: 'folder', ...nameMatch(name) });
  };

  const addPath = (path: string, size?: number) => {
    const segments = path.split('/').filter(Boolean);
    if (!segments.some((segment) => searchIncludes(segment, needle))) return false;

    // Derive ancestors first so the final capped file still contributes its folder path.
    let ancestor = '';
    for (let i = 0; i < segments.length - 1; i++) {
      ancestor = ancestor ? `${ancestor}/${segments[i]}` : segments[i]!;
      addFolder(ancestor, segments[i]!);
    }
    addFile(path, segments[segments.length - 1] ?? '', size);
    return files.length >= SEARCH_RESULT_LIMIT;
  };

  for (const line of stdout.split('\0')) {
    if (!line.trim()) continue;
    const node = parseLsTreeLine(line);
    if (!node || !node.isLeaf) continue; // ls-tree -r lists blobs; folders derive from paths
    if (addPath(node.key, node.size)) break;
  }

  // Untracked/staged files never appear in `ls-tree <ref>`. Fetch status per query (never cache
  // it — it goes stale): the ls-tree listing stays one-per-ref above, so cache semantics are
  // unchanged. A status failure degrades to ref-only results rather than crashing the search UI.
  try {
    const dirty = await getUncommittedFiles(config, repoPath, secret, callId);
    for (const row of dirty) {
      if (row.indexStatus === 'D' || row.workingTreeStatus === 'D') continue;
      if (addPath(row.path)) break;
    }
  } catch {
    // ref-only results are still useful; degraded, never a thrown UI error.
  }

  return [...files, ...folders];
}

/**
 * Fetches tree nodes for a given ref and directory inside the remote git repository.
 * Invariant: Read-only command. NEVER calls git checkout or modifies working copy.
 */
export async function getRemoteTree(
  config: SshConfig,
  repoPath: string,
  ref: string,
  dirPath?: string,
  secret?: string,
  callId?: string
): Promise<RemoteGitTreeNode[]> {
  const cleanDir = dirPath ? confineRepoPath(dirPath, 'Đường dẫn thư mục') : '';
  const treeRef = cleanDir ? `${ref}:${cleanDir}` : ref;

  // CR-01: `--end-of-options` so a ref beginning with `-` is a revision, never an option.
  // WR-03: `-z` so a non-ASCII path arrives verbatim. Without it git C-quotes any path outside
  // ASCII (`"th\306\260-m\341\273\245c"`), and that string is not a usable path — feeding it
  // back as `dirPath` fails, and the model sees escaped octal instead of the real name.
  const gitArgs = ['ls-tree', '-l', '-z', '--end-of-options', escapeShellArg(treeRef)];
  const stdout = await runGitCommand(config, repoPath, gitArgs, secret, callId);

  const nodes: RemoteGitTreeNode[] = [];

  for (const line of stdout.split('\0')) {
    if (!line.trim()) continue;
    const node = parseLsTreeLine(line, cleanDir || undefined);
    if (node) {
      nodes.push(node);
    }
  }

  return sortTreeNodes(nodes);
}

/**
 * Fetches file content for the viewer. Read-only: never checks out or edits anything.
 *
 * Owner decision (2026-11-27): the viewer shows the CURRENT WORKING COPY whenever `ref`
 * resolves to HEAD — staged (`A `/`AM`) and modified (`M `/` M`/`MM`) files otherwise show a
 * stale ref blob. `cat-file -p <ref>:<path>` stays the first step: it keeps WR-01 (a different
 * ref must not borrow the current branch's working copy) and the literal lookup that rejects
 * globs. A failed cat-file keeps the untracked / staged-new fallback below.
 */
export async function getRemoteFileContent(
  config: SshConfig,
  repoPath: string,
  ref: string,
  filePath: string,
  secret?: string,
  callId?: string
): Promise<string> {
  const cleanPath = confineRepoPath(filePath, 'Đường dẫn tệp');
  const objectSpec = `${ref}:${cleanPath}`;
  // CR-01: `--end-of-options` so a ref beginning with `-` cannot become `--output=<file>`.
  // Literal object lookup: `show` can silently succeed with no output for a missing glob.
  // cat-file does not invoke repo-local diff drivers or textconv.
  const gitArgs = ['cat-file', '-p', '--end-of-options', escapeShellArg(objectSpec)];
  try {
    const blob = await runGitCommand(config, repoPath, gitArgs, secret, callId);
    // WR-01: only a ref resolving to HEAD may borrow the working copy. Fail closed on any
    // resolve/realpath/cat failure; a symlink refusal (PathOutsideRepoError) always propagates.
    try {
      const revArgs = (rev: string) =>
        ['rev-parse', '--verify', '--end-of-options', escapeShellArg(rev)];
      const [refSha, headSha] = await Promise.all([
        runGitCommand(config, repoPath, revArgs(ref), secret, callId),
        runGitCommand(config, repoPath, revArgs('HEAD'), secret, callId),
      ]);
      if (refSha.trim() !== headSha.trim()) return blob;
      return await getRemoteWorkingFileContent(config, repoPath, cleanPath, secret, callId);
    } catch (err) {
      if (err instanceof PathOutsideRepoError) throw err;
      return blob;
    }
  } catch (err: any) {
    if (!isNotInRef(err, cleanPath, ref)) throw err;
    // The path is absent from <ref>. Two cases share that message:
    //  - untracked: not in the index (ls-files exits 1) -> working copy is the only source.
    //  - staged-new (porcelain `A ` / `AM`): in the index but absent from the ref. The working
    //    copy is what the user staged and what the editor must show.
    // WR-01 guard: a path committed at HEAD but absent from an OLD ref also has an index entry,
    // yet its working copy may belong to a different branch. Ask git status for a staged ADD at
    // the current HEAD; only that case earns the fallback.
    const probe = await execRemoteCommand(
      config,
      `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager --literal-pathspecs ` +
        `ls-files --error-unmatch -- ${escapeShellArg(cleanPath)}`,
      secret,
      callId
    );
    // Infrastructure/SSH failures stay failures; only 0 (tracked) and 1 (untracked) continue.
    if (probe.exitStatus !== 0 && probe.exitStatus !== 1) {
      throw new Error(probe.stderr.trim() || `Lệnh git thất bại với exit code ${probe.exitStatus}`);
    }
    if (probe.exitStatus === 0) {
      const staged = await execRemoteCommand(
        config,
        `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager --literal-pathspecs ` +
          `status --porcelain=v1 -z -- ${escapeShellArg(cleanPath)}`,
        secret,
        callId
      );
      const entry = staged.stdout.split('\0').find((token) => token.length > 0);
      // Only an index-stage ADD (`A ` / `AM`) is a staged-new file; anything else keeps the
      // ref-missing error so the editor never shows another branch's working copy (WR-01).
      if (entry?.charAt(0) !== 'A') throw err;
    }
    return await getRemoteWorkingFileContent(config, repoPath, cleanPath, secret, callId);
  }
}

/**
 * Reads a file directly from the remote working tree using cat.
 * Invariant: Read-only command. Uses safe shell argument escaping to mitigate T-quick-01.
 */
export async function getRemoteWorkingFileContent(
  config: SshConfig,
  repoPath: string,
  filePath: string,
  secret?: string,
  callId?: string
): Promise<string> {
  // CR-02: exported, so it confines on its own rather than trusting the caller's path.
  const cleanPath = confineRepoPath(filePath, 'Đường dẫn tệp');
  const res = await execRemoteCommand(config, workingCopyCatSnippet(repoPath, cleanPath), secret, callId);
  if (res.exitStatus === 77) {
    throw new PathOutsideRepoError(`Đường dẫn symlink ngoài repo, từ chối đọc: ${cleanPath}`);
  }
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr || `Failed to read ${cleanPath}`);
  }
  return res.stdout || '';
}

/**
 * Canonicalize BOTH paths: parent/leaf symlinks, relative roots and symlinked roots.
 * Appending '/' preserves trailing newlines through shell command substitution; remove
 * that sentinel and realpath's output newline before checking a literal directory boundary.
 * Missing/failed realpath must stop before cat. Exit 77 is policy refusal, not file content.
 *
 * No `-e`: that flag is GNU-only and BSD/macOS rejects it ("illegal option -- e"), which made
 * every read fail closed on a macOS remote. Plain `realpath --` is POSIX-portable and already
 * strict — it refuses a path whose components do not exist on both implementations.
 * ponytail: assumes a stable remote filesystem; hostile concurrent swaps need native openat.
 */
function workingCopyCatSnippet(repoPath: string, cleanPath: string): string {
  const targetFile = `${repoPath.replace(/\/+$/, '')}/${cleanPath}`;
  return (
    `root=$(realpath -- ${escapeShellArg(repoPath)} && printf /) || exit 1; ` +
    `root=\${root%?}; root=\${root%?}; ` +
    `target=$(realpath -- ${escapeShellArg(targetFile)} && printf /) || exit 1; ` +
    `target=\${target%?}; target=\${target%?}; ` +
    `case "$target" in "\${root%/}/"*) cat -- "$target" ;; *) exit 77 ;; esac`
  );
}

const PAGE_TOTAL_PREFIX = '###TOTAL ';

/**
 * A page is bounded by LINES, but a minified file can put half a megabyte on one line, so the
 * byte size is bounded too. Without this a single `read_file` call could still put more into the
 * turn's context than the whole-file read it replaced.
 */
const PAGE_BYTE_CAP = 262144;
/**
 * One line longer than this is cut. BYTES, not characters: the awk in use (`awk version
 * 20200816`, the macOS default) has `length()` in bytes under every locale tested, so a
 * Vietnamese line is cut at ~1333 characters. The name says bytes so the next reader does not
 * assume otherwise; `parsePage` strips the partial character the cut can leave behind.
 */
const PAGE_LINE_MAX_BYTES = 4000;

/**
 * One remote pass yields the page AND the line total. The source's exit status is reported
 * out-of-band on stderr (`###EXIT <n>`) because the pipeline's own status is awk's.
 *
 * A subshell, not `{ ...; }`: dash does not run an EXIT trap for the last command of a brace
 * group inside a pipeline, and the working-copy snippet's `exit 77` must still be reported.
 *
 * The byte budget is enforced in awk, not by `head -c`: cutting the stream at the shell would
 * also cut the `###TOTAL` line, and the caller needs the total to know whether to page on.
 *
 * Once the budget is spent the loop stops EMITTING but keeps READING (`done` + `next`), so
 * `NR` at `END` is still the file's real line count. `exit` would stop the read and report the
 * cut line as the total — a page that pages on correctly but tells the model the file is
 * shorter than it is. And `next` alone (without `done`) would punch a hole: the emitted set
 * must stay a contiguous prefix, or `nextOffset`, which counts emitted lines, never asks for
 * the skipped line again.
 */
function pageCommand(source: string, offset: number, limit: number): string {
  return (
    `( trap 'printf "###EXIT %s\\n" "$?" >&2' EXIT; ${source} ) | ` +
    `awk -v s=${offset} -v e=${offset + limit - 1} -v cap=${PAGE_BYTE_CAP} ` +
    `-v maxc=${PAGE_LINE_MAX_BYTES} ` +
    `'NR>=s&&NR<=e{ if(done) next; l=$0; if (length(l)>maxc) l=substr(l,1,maxc) " ..."; ` +
    `n=length(l)+12; if (used+n>cap) { done=1; next } used+=n; print NR": " l } ` +
    `END{ print "${PAGE_TOTAL_PREFIX}"NR }'`
  );
}

/** First 1024 bytes of the same source; exit 0 means a NUL byte is present. */
function binaryProbeCommand(source: string): string {
  return `{ ${source}; } | head -c 1024 | od -An -tx1 | tr -s ' ' '\\n' | grep -qx 00`;
}

function parsePage(
  stdout: string,
  filePath: string,
  offset: number,
  limit: number
): RemoteFilePage {
  const lines = stdout.split('\n');
  // The trailing element is a split artefact, not a line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // awk's END block prints the total last, so the marker is the last line by construction.
  // Body lines are always prefixed with `NR": "`, so a file line can never be mistaken for it.
  let totalLines = 0;
  const last = lines[lines.length - 1];
  if (last !== undefined && last.startsWith(PAGE_TOTAL_PREFIX)) {
    totalLines = parseInt(last.slice(PAGE_TOTAL_PREFIX.length), 10) || 0;
    lines.pop();
  }
  return {
    filePath,
    offset,
    limit,
    linesRead: lines.length,
    totalLines,
    hasMore: offset + lines.length - 1 < totalLines,
    isBinary: false,
    // The awk cut is a BYTE offset, so it can land inside a multi-byte character and leave a
    // lone replacement char before the ellipsis. Drop it: the model must not receive mojibake.
    lines: lines.map((line) => line.replace(/�+ \.\.\.$/, ' ...')),
  };
}

/**
 * One page of a file in the remote working tree, with a line-numbered body and the file's total
 * line count. Owner decision (2026-11-17): `git_read read_file` serves the CURRENT WORKING TREE,
 * not the committed blob at a ref. The working tree is the only source that represents committed
 * content, tracked-but-modified content, and untracked files uniformly; reading the ref first
 * made a tracked file with uncommitted edits silently return stale committed bytes.
 *
 * `ref` stays in the signature for tool-contract compatibility but no longer selects the source.
 * Confinement (`confineRepoPath` + the realpath guard in `workingCopyCatSnippet`), byte/line
 * paging, the binary probe, and the paged total are unchanged — `readPageFromSource` is
 * source-agnostic. `getRemoteFileContent` is now whole-file and working-copy-first when
 * `ref == HEAD`: the viewer and `FindInRemoteFiles` preview both need uncommitted content.
 */
export async function readRemoteFilePage(
  config: SshConfig,
  repoPath: string,
  _ref: string,
  filePath: string,
  offset: number,
  limit: number,
  secret?: string,
  callId?: string
): Promise<RemoteFilePage> {
  const cleanPath = confineRepoPath(filePath, 'Đường dẫn tệp');
  const pageOffset = Math.max(1, Math.floor(Number(offset)) || 1);
  const pageLimit = Math.min(Math.max(1, Math.floor(Number(limit)) || 200), 2000);

  return await readPageFromSource(
    config,
    workingCopyCatSnippet(repoPath, cleanPath),
    cleanPath,
    pageOffset,
    pageLimit,
    secret,
    callId
  );
}

async function readPageFromSource(
  config: SshConfig,
  source: string,
  filePath: string,
  offset: number,
  limit: number,
  secret?: string,
  callId?: string
): Promise<RemoteFilePage> {
  // A later page of a file already known binary never reaches here, so probe on page 1 only.
  if (offset === 1) {
    const probe = await execRemoteCommand(config, binaryProbeCommand(source), secret, callId);
    if (probe.exitStatus === 0) {
      return {
        filePath,
        offset,
        limit,
        linesRead: 0,
        totalLines: 0,
        hasMore: false,
        isBinary: true,
        lines: [],
      };
    }
  }

  const res = await execRemoteCommand(config, pageCommand(source, offset, limit), secret, callId);
  // The marker is the only evidence the remote command completed. Without it `###TOTAL` was
  // never printed either, so `totalLines` would be 0 and `hasMore` false — a short page
  // presented as the whole file. Fail closed instead.
  const marker = /###EXIT (\d+)\n?$/.exec(res.stderr);
  if (!marker) {
    throw new Error(
      res.stderr.trim() || 'Không nhận được mã thoát từ lệnh remote (kết nối có thể đã đứt).'
    );
  }
  const sourceExit = Number(marker[1]);
  const stderr = res.stderr.replace(/###EXIT \d+\n?$/, '').trim();

  if (sourceExit === 77) {
    throw new PathOutsideRepoError(`Đường dẫn symlink ngoài repo, từ chối đọc: ${filePath}`);
  }
  // 141 is SIGPIPE: awk stopped reading at the byte budget, which is the intended early stop,
  // not a failure. The page it emitted is still a valid contiguous prefix.
  if (sourceExit !== 0 && sourceExit !== 141) {
    // The message is what `isNotInRef` matches on, so it must survive verbatim.
    throw new Error(stderr || `Lệnh git thất bại với exit code ${sourceExit}`);
  }
  // The probe covers page 1 only. That is a real ceiling: a file whose first 1024 bytes are
  // text but which has a NUL later is not flagged on a later page. It cannot leak raw bytes
  // though — awk ends the string at the NUL, so the page holds a truncated line, never binary.
  return parsePage(res.stdout, filePath, offset, limit);
}