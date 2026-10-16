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

export function useDocWorkerSearch(
  notes: Note[],
  query: string,
  loadSearchNotes?: (() => Promise<Note[]>) | undefined
) {
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

    const reqId = ++requestIdCounter;
    activeRequestId.current = reqId;
    setIsSearching(true);
    const worker = getWorker();
    let disposed = false;
    let handleMessage: ((e: MessageEvent<DocSearchWorkerResponse>) => void) | undefined;

    void (async () => {
      const corpus = loadSearchNotes ? await loadSearchNotes() : notes;
      if (disposed || reqId !== activeRequestId.current) return;

      if (!worker) {
        const ids = corpus.filter((note) => matchesDocSearch(trimmed, note)).map((note) => note.id);
        if (reqId === activeRequestId.current) {
          setMatchIds(ids);
          setIsSearching(false);
        }
        return;
      }

      handleMessage = (event: MessageEvent<DocSearchWorkerResponse>) => {
        if (event.data.id === activeRequestId.current) {
          setMatchIds(event.data.results);
          setIsSearching(false);
        }
      };
      worker.addEventListener('message', handleMessage);
      worker.postMessage({
        id: reqId,
        query: trimmed,
        docs: corpus.map((note) => ({
          id: note.id,
          title: note.title,
          tags: note.tags,
          body: note.body,
        })),
      } satisfies DocSearchWorkerRequest);
    })();

    return () => {
      disposed = true;
      if (worker && handleMessage) worker.removeEventListener('message', handleMessage);
    };
  }, [notes, query, loadSearchNotes]);

  return { matchIds, isSearching };
}
