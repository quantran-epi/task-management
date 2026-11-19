/**
 * Phase 47 D-06/D-11: a remote chat scope key MUST be `remote:<v4-uuid>` — the UUID
 * identifies the {sshConfigId, repoPath, branch} target and never encodes a raw path.
 * The structured selection anchor (D-11) reuses the SAME derived UUID so the anchor's
 * `targetUuid` matches the scope key entityId.
 *
 * The derivation is deterministic so the same active target always maps to one id
 * (no persisted target-id row is needed — target details resolve from live layout state).
 * It is a stable hash shaped as an RFC 4122 v4 UUID (version nibble 4, variant 10xx),
 * which is what the backup `uuidSchema` refine checks on export/import.
 */
export function deriveRemoteTargetUuid(
  sshConfigId: string,
  repoPath: string,
  branch: string
): string {
  const key = `remote\u0000${sshConfigId}\u0000${repoPath}\u0000${branch}`;
  const bytes = new Uint8Array(16);
  let seed = 0x811c9dc5;
  for (let block = 0; block < 4; block++) {
    let hash = (seed + Math.imul(block, 0x9e3779b9)) >>> 0;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    for (let b = 0; b < 4; b++) {
      bytes[block * 4 + b] = (hash >>> (b * 8)) & 0xff;
    }
    seed = hash;
  }
  // RFC 4122 v4: set version to 4 and variant to 10xx.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
