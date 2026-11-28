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
