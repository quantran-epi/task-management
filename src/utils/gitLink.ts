/** Short display label for a git link; keeps SCP syntax intact. */
export function gitLinkLabel(url: string): string {
  // Trim locally: storage keeps the verbatim value, but a leading/trailing space must not
  // leak into the label or turn the accompanying href into a relative URL.
  const value = url.trim().replace(/\.git$/, '');
  const match = /^(?:[a-z]+:\/\/)?[^/@]+@([^:/]+)[:/](.+)$/i.exec(value);
  return match ? `${match[1]}/${match[2]}` : value;
}

/** Browser-navigable href; SCP syntax is rewritten to the equivalent HTTPS URL. */
export function gitHref(url: string): string {
  const value = url.trim();
  const match = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):([A-Za-z0-9._~/-]+)$/.exec(value);
  return match ? `https://${match[1]}/${match[2]}` : value;
}

/**
 * Render safety only — input storage accepts any string.
 * Decides whether a stored value may become a clickable href.
 */
export function shouldRenderGitLink(url: string): boolean {
  const value = url.trim();
  if (!value || /\s|\\/.test(value)) return false;
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+$/.test(value)) return true;
  // Reject userinfo hidden in query/fragment: gitLinkLabel would read it as the host
  // while the browser navigates to the real hostname (label-spoof phishing).
  if (/[?#][^?#]*@/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (
      ['http:', 'https:', 'ssh:', 'git:'].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      // Git's conventional `git` SSH user is harmless: the label and href still point at
      // the same host. Any other userinfo (or a password) stays blocked.
      ((parsed.protocol === 'ssh:' && parsed.username === 'git' && !parsed.password) ||
        (!parsed.username && !parsed.password))
    );
  } catch {
    return false;
  }
}
