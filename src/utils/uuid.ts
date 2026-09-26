/**
 * Generates an RFC 4122 v4 UUID using native browser/Node Web Crypto API.
 * Uses native crypto.randomUUID() with zero external npm dependencies (DATA-01).
 */
export function generateId(): string {
  return crypto.randomUUID();
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether the given string is a valid RFC 4122 v4 UUID.
 */
export function isValidUuid(id: unknown): boolean {
  if (typeof id !== 'string') {
    return false;
  }
  return UUID_V4_REGEX.test(id);
}
