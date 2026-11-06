import JSZip from 'jszip';
import type { SshConfig } from '../types/ssh';
import type { BranchSnapshot } from '../types/gitRemote';
import { runGitCommand, checkHeadDrift, checkDirtyStatus, escapeShellArg } from './gitRemoteService';
import { getSshSecret } from './sshService';
import {
  canonicalizePackPath,
  ChangePackMetaSchema,
  getEffectiveChangePackLimits,
  validateChangePack,
  type ChangePackMeta,
} from './wizard/changePack';

export type PackageProgressStep = 'checking' | 'diff' | 'files' | 'compressing' | 'validating';
export type PackageProgressCallback = (step: PackageProgressStep, message: string) => void;

// Shared by file collection and diff pathspecs: excluded content must not leak through diff.patch.
const excludedGlobs = ['**/node_modules/**', '**/package-lock.json', '**/*.min.js', '**/.env', '**/.env.*', '**/.git/**'];

function isAllowedPackEntry(path: string): boolean {
  const lower = path.toLowerCase();
  return !lower.split('/').some((part) => part === 'node_modules' || part === '.git' || part === '.env' || part.startsWith('.env.'))
    && !lower.endsWith('package-lock.json') && !lower.endsWith('.min.js');
}

export async function createChangePackFromSnapshot(
  config: SshConfig,
  repoPath: string,
  snapshot: BranchSnapshot,
  crCode: string,
  onProgress?: PackageProgressCallback,
): Promise<{ blob: Blob; meta: ChangePackMeta; warnings: string[] }> {
  const limits = getEffectiveChangePackLimits();
  const targetCommit = snapshot.headSha || snapshot.headCommit;
  const baseRef = snapshot.baseCommit || snapshot.baseBranch;
  if (!targetCommit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(targetCommit) || !baseRef || /[\x00-\x1f\x7f]/.test(baseRef)) {
    throw new Error('Snapshot cần Base và Head SHA commit hợp lệ');
  }
  const fileStats = snapshot.fileStats ?? [];
  // Validate metadata and paths before credentials or remote commands are accessed.
  const meta = ChangePackMetaSchema.parse({
    cr: crCode,
    base: baseRef,
    head: targetCommit,
    branch: snapshot.targetBranch || snapshot.branch || targetCommit,
    author: 'TaskMate SSH Packager',
    generatedAt: new Date().toISOString(),
    commits: (snapshot.commitShas ?? [targetCommit]).map((sha) => ({ sha, subject: `Commit ${sha}` })),
    files: fileStats.map(({ path, status }) => ({ path, status })),
  });
  for (const { path } of fileStats) {
    if (canonicalizePackPath(path) !== path || /[\x00-\x1f\x7f]/.test(path)) {
      throw new Error('Đường dẫn Snapshot không an toàn');
    }
  }
  onProgress?.('checking', 'Kiểm tra trạng thái remote repository...');
  const secret = (await getSshSecret(config.id)) ?? undefined;
  const warnings: string[] = [];
  if (snapshot.targetBranch) {
    const drift = await checkHeadDrift(config, repoPath, snapshot.targetBranch, targetCommit, secret);
    if (drift.drifted) warnings.push(`Remote HEAD đã thay đổi từ ${targetCommit} sang ${drift.currentHeadSha}; đóng gói theo Snapshot đã duyệt.`);
  }
  const dirty = await checkDirtyStatus(config, repoPath, secret);
  if (!dirty.isClean) warnings.push(`Remote có ${dirty.uncommittedFiles.length} tệp chưa commit; chỉ đóng gói commit Snapshot đã duyệt.`);

  // Step 3 stores baseCommit as a branch ref. Pin it once for all subsequent reads.
  const baseCommit = (await runGitCommand(config, repoPath, [
    'rev-parse', '--verify', '--end-of-options', escapeShellArg(`${baseRef}^{commit}`),
  ], secret)).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(baseCommit)) throw new Error('Base commit không hợp lệ');
  meta.base = baseCommit;

  const zip = new JSZip();
  let expandedBytes = 0;
  const seen = new Set<string>();
  function addEntry(path: string, content: string): void {
    const key = path.toLocaleLowerCase('en-US');
    if (seen.has(key)) throw new Error(`PACK_PATH_COLLISION: ${path}`);
    const size = new TextEncoder().encode(content).byteLength;
    if (size > limits.maxEntryBytes) throw new Error(`PACK_ENTRY_TOO_LARGE: ${path}`);
    if (seen.size >= limits.maxEntries) throw new Error('PACK_TOO_MANY_ENTRIES');
    expandedBytes += size;
    if (expandedBytes > limits.maxExpandedBytes) throw new Error('PACK_EXPANDED_TOO_LARGE');
    seen.add(key);
    zip.file(path, content, { createFolders: false });
  }

  onProgress?.('diff', 'Đang tạo diff.patch từ commit Snapshot...');
  const diffPatch = await runGitCommand(config, repoPath, [
    'diff', '--binary', '--no-ext-diff', '--no-textconv', escapeShellArg(`${baseCommit}..${targetCommit}`), '--', '.',
    ...excludedGlobs.map((glob) => escapeShellArg(`:(glob,exclude,icase)${glob}`)),
  ], secret);
  addEntry('diff.patch', diffPatch);

  onProgress?.('files', 'Đang thu thập tệp SQL và tệp mới...');
  for (const file of fileStats) {
    if (file.status === 'deleted' || !isAllowedPackEntry(file.path)) continue;
    const isSql = /^sql\/.+\.(?:sql|plb|pck|pkb)$/i.test(file.path);
    if (!isSql && file.status !== 'added') continue;
    const path = isSql ? file.path : `new-files/${file.path}`;
    const content = await runGitCommand(config, repoPath, ['show', escapeShellArg(`${targetCommit}:${file.path}`)], secret);
    addEntry(path, content);
  }
  addEntry('meta.json', JSON.stringify(meta, null, 2));
  onProgress?.('compressing', 'Đang nén Change Pack trong bộ nhớ...');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  onProgress?.('validating', 'Đang kiểm tra Change Pack...');
  await validateChangePack(blob, { cr: meta.cr, base: meta.base, head: meta.head, branch: meta.branch }, limits);
  return { blob, meta, warnings };
}
