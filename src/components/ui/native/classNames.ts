/** Join truthy class name parts without adding a dependency (no clsx needed). */
export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// AntD event props have different signatures from DOM handlers; never forward
// them. Callers keep them through the wrapper's own typed callbacks.
const DOM_PROP_NAMES = new Set(['id', 'title', 'tabIndex', 'hidden', 'name', 'role', 'type']);

/** Keep only DOM-safe caller props; AntD-only props must never reach a native element. */
export function domProps(source: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (DOM_PROP_NAMES.has(key) || key.startsWith('data-') || key.startsWith('aria-')) result[key] = value;
  }
  return result;
}
