/** Short display label for a git link; keeps SCP syntax intact. */
export function gitLinkLabel(url: string): string {
  const value = url.replace(/\.git$/, '');
  const match = /^(?:[a-z]+:\/\/)?[^/@]+@([^:/]+)[:/](.+)$/i.exec(value);
  return match ? `${match[1]}/${match[2]}` : value;
}

/** Browser-navigable href; SCP syntax is rewritten to the equivalent HTTPS URL. */
export function gitHref(url: string): string {
  const match = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):([A-Za-z0-9._~/-]+)$/.exec(url);
  return match ? `https://${match[1]}/${match[2]}` : url;
}

/**
 * Render safety only — input storage accepts any string.
 * Decides whether a stored value may become a clickable href.
 */
export function shouldRenderGitLink(url: string): boolean {
  const value = url.trim();
  if (!value || /\s|\\/.test(value)) return false;
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+$/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      ['http:', 'https:', 'ssh:', 'git:'].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
