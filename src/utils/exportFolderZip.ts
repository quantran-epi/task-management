import JSZip from 'jszip';
import type { Note } from '../types/models';

/**
 * Recursively collects all documents and subfolders under the specified folderId.
 */
export function getFolderDescendantNotes(
  folderId: string,
  allNotes: readonly Note[]
): { docs: Note[]; folders: Note[] } {
  const docs: Note[] = [];
  const folders: Note[] = [];

  const traverse = (currentParentId: string) => {
    for (const note of allNotes) {
      if (note.deletedAt) continue;
      if (note.parentId === currentParentId) {
        if (note.type === 'folder') {
          folders.push(note);
          traverse(note.id);
        } else {
          docs.push(note);
        }
      }
    }
  };

  traverse(folderId);
  return { docs, folders };
}

/**
 * Builds a relative zip path for a note within a target root folder.
 */
function buildRelativeDocPath(
  doc: Note,
  rootFolderId: string,
  folderMap: Map<string, Note>
): string {
  const parts: string[] = [];
  let currParentId = doc.parentId;

  while (currParentId && currParentId !== rootFolderId) {
    const parentFolder = folderMap.get(currParentId);
    if (!parentFolder) break;
    parts.unshift(sanitizeFileName(parentFolder.title || 'Untitled_Folder'));
    currParentId = parentFolder.parentId;
  }

  const safeDocName = sanitizeFileName(doc.title || 'Untitled_Doc') + '.md';
  return parts.length > 0 ? `${parts.join('/')}/${safeDocName}` : safeDocName;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled';
}

/**
 * Exports a folder and all its recursive contents as a downloadable ZIP file.
 */
export async function exportFolderAsZip(
  rootFolder: Note,
  allNotes: readonly Note[]
): Promise<void> {
  const zip = new JSZip();
  const folderMap = new Map<string, Note>();
  for (const n of allNotes) {
    if (n.type === 'folder' && !n.deletedAt) {
      folderMap.set(n.id, n);
    }
  }

  const { docs, folders } = getFolderDescendantNotes(rootFolder.id, allNotes);

  // Ensure empty subdirectories are represented in zip
  for (const f of folders) {
    let p = sanitizeFileName(f.title || 'Untitled_Folder');
    let curr = f.parentId;
    while (curr && curr !== rootFolder.id) {
      const parent = folderMap.get(curr);
      if (!parent) break;
      p = `${sanitizeFileName(parent.title || 'Untitled_Folder')}/${p}`;
      curr = parent.parentId;
    }
    zip.folder(p);
  }

  // Add all markdown files
  for (const doc of docs) {
    const relativePath = buildRelativeDocPath(doc, rootFolder.id, folderMap);
    const content = doc.body || `# ${doc.title || 'Untitled'}\n`;
    zip.file(relativePath, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `${sanitizeFileName(rootFolder.title || 'folder_export')}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
