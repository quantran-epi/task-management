import { useState, useEffect, useRef } from 'react';
import type { Note } from '../types/models';
import { matchesDocSearch } from '../utils/docSearch';
import type { DocSearchWorkerRequest, DocSearchWorkerResponse } from '../workers/docSearchWorker';

let workerInstance: Worker | null = null;
let requestIdCounter = 0;

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('../workers/docSearchWorker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      workerInstance = null;
    }
  }
  return workerInstance;
}

export function useDocWorkerSearch(notes: Note[], query: string) {
  const [matchIds, setMatchIds] = useState<string[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const activeRequestId = useRef<number>(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setMatchIds(null);
      setIsSearching(false);
      return;
    }

    const worker = getWorker();
    if (!worker) {
      // Fallback matching in main thread if Worker unavailable
      const ids = notes
        .filter((n) => matchesDocSearch(trimmed, n))
        .map((n) => n.id);
      setMatchIds(ids);
      return;
    }

    const reqId = ++requestIdCounter;
    activeRequestId.current = reqId;
    setIsSearching(true);

    const handleMessage = (e: MessageEvent<DocSearchWorkerResponse>) => {
      if (e.data.id === activeRequestId.current) {
        setMatchIds(e.data.results);
        setIsSearching(false);
      }
    };

    worker.addEventListener('message', handleMessage);

    const docs = notes.map((n) => ({
      id: n.id,
      title: n.title,
      tags: n.tags,
      body: n.body,
    }));

    const req: DocSearchWorkerRequest = {
      id: reqId,
      query: trimmed,
      docs,
    };

    worker.postMessage(req);

    return () => {
      worker.removeEventListener('message', handleMessage);
    };
  }, [notes, query]);

  return { matchIds, isSearching };
}
