import type { SelectionContextPayload, RemoteAnchorContext } from '../../utils/selectionContext';

/**
 * Phase 47 D-11: a selection in a remote (readonly) file viewer is a STRUCTURED anchor —
 * target identity + relative path + start/end line + selected text. It never fabricates a
 * `doc` entity (which would resolve to an unrelated note via db.notes.get()).
 *
 * `targetUuid` is the same derived target UUID used by the `remote:<uuid>` chat scope key
 * (see utils/remoteTarget.ts), so the anchor and its scope share one identity.
 */
export interface RemoteSelectionAnchor {
  targetUuid: string;
  sshConfigId: string;
  repoPath: string;
  branch: string;
  relativeFilePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
}

/** Walk up from a DOM node to the nearest per-line element carrying `data-remote-line`. */
function lineNumberForNode(node: Node | null, container: HTMLElement): number | null {
  let element: HTMLElement | null = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node?.parentElement ?? null);
  while (element && element !== container.parentElement) {
    const raw = element.getAttribute('data-remote-line');
    if (raw !== null) {
      const line = Number(raw);
      return Number.isFinite(line) && line >= 1 ? line : null;
    }
    element = element.parentElement;
  }
  return null;
}

function isInside(node: Node | null, container: HTMLElement): boolean {
  return Boolean(node && (node === container || container.contains(node)));
}

/**
 * Maps a DOM selection inside a remote code viewer to a structured anchor. Returns null when
 * either endpoint lies outside the viewer container or no line metadata can be resolved.
 * Renderer-only: no model call, no file read.
 */
export function extractRemoteSelectionAnchor(
  selection: Selection | null,
  container: HTMLElement
): RemoteSelectionAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (!isInside(selection.anchorNode, container) || !isInside(selection.focusNode, container)) return null;

  const targetUuid = container.getAttribute('data-remote-target-uuid')
    ?? container.getAttribute('data-ai-context-id')
    ?? '';
  if (!targetUuid) return null;

  const startLine = lineNumberForNode(selection.anchorNode, container);
  const focusLine = lineNumberForNode(selection.focusNode, container);
  if (startLine === null || focusLine === null) return null;

  const selectedText = selection.toString();
  const relativeFilePath =
    container.getAttribute('data-remote-path')
    ?? selection.anchorNode?.parentElement?.getAttribute('data-remote-path')
    ?? '';

  return {
    targetUuid,
    sshConfigId: container.getAttribute('data-remote-ssh-config-id') ?? '',
    repoPath: container.getAttribute('data-remote-repo-path') ?? '',
    branch: container.getAttribute('data-remote-branch') ?? '',
    relativeFilePath,
    startLine,
    endLine: Math.max(startLine, focusLine),
    selectedText,
  };
}

/**
 * Converts a structured anchor into a SelectionContextPayload that the shared mention
 * formatter can render. targetType is 'remote' so hierarchy resolution never touches notes.
 */
export function remoteAnchorToPayload(anchor: RemoteSelectionAnchor): SelectionContextPayload {
  const location = anchor.relativeFilePath
    ? `${anchor.relativeFilePath}:${anchor.startLine}-${anchor.endLine}`
    : `${anchor.startLine}-${anchor.endLine}`;
  const context: RemoteAnchorContext = {
    relativeFilePath: anchor.relativeFilePath,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    ...(anchor.sshConfigId ? { sshConfigId: anchor.sshConfigId } : {}),
    ...(anchor.repoPath ? { repoPath: anchor.repoPath } : {}),
    ...(anchor.branch ? { branch: anchor.branch } : {}),
  };
  return {
    targetType: 'remote',
    targetId: anchor.targetUuid,
    hierarchyPath: `Remote ${anchor.sshConfigId || 'target'} > ${location}`,
    selectedText: anchor.selectedText,
    remote: context,
  };
}
