export const SAFE_COMMAND_PREFIXES: readonly string[] = [
  'git status',
  'git diff',
  'git log',
  'npm test',
  'npx vitest',
  'cargo check',
  'cargo test',
  'pytest',
  'go test',
] as const;

export function isCommandWhitelisted(command: string): boolean {
  if (!command || !command.trim()) {
    return false;
  }

  const trimmed = command.trim();

  // Reject command chaining delimiters: ;, &&, ||, |
  // per STRIDE T-15-01 / ASVS V14.2
  if (/[;&|]/.test(trimmed)) {
    return false;
  }

  return SAFE_COMMAND_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `)
  );
}
