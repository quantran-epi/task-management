import { matchesDocSearch } from '../utils/docSearch';

export interface DocSearchWorkerRequest {
  id: number;
  query: string;
  docs: Array<{
    id: string;
    title?: string | null | undefined;
    body?: string | null | undefined;
    tags?: string[] | null | undefined;
    extraTexts?: string[] | null | undefined;
  }>;
}

export interface DocSearchWorkerResponse {
  id: number;
  results: string[];
}

self.onmessage = (event: MessageEvent<DocSearchWorkerRequest>) => {
  const { id, query, docs } = event.data;
  if (!query || !query.trim() || !docs || docs.length === 0) {
    self.postMessage({ id, results: [] } as DocSearchWorkerResponse);
    return;
  }

  const matchedIds: string[] = [];
  for (const doc of docs) {
    if (matchesDocSearch(query, doc)) {
      matchedIds.push(doc.id);
    }
  }

  self.postMessage({ id, results: matchedIds } as DocSearchWorkerResponse);
};
