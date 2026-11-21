/** Join truthy class name parts without adding a dependency (no clsx needed). */
export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
