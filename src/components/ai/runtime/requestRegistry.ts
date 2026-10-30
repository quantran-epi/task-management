export interface ActiveRequest {
  requestId: string;
  tabId: string;
  controller: AbortController;
  startedAt: number;
}

export interface RequestRegistry {
  begin(tabId: string, controller?: AbortController): ActiveRequest | null;
  get(requestId: string): ActiveRequest | undefined;
  isCurrent(requestId: string, tabId: string, controller?: AbortController): boolean;
  abortTab(tabId: string): ActiveRequest | undefined;
  finish(requestId: string): void;
  discardTab(tabId: string): void;
  hasActive(tabId: string): boolean;
}

export function createRequestRegistry(): RequestRegistry {
  const requests = new Map<string, ActiveRequest>();
  const currentByTab = new Map<string, string>();

  return {
    begin(tabId, controller = new AbortController()) {
      if (currentByTab.has(tabId)) return null;
      const request: ActiveRequest = {
        requestId: crypto.randomUUID(),
        tabId,
        controller,
        startedAt: Date.now(),
      };
      requests.set(request.requestId, request);
      currentByTab.set(tabId, request.requestId);
      return request;
    },
    get(requestId) {
      return requests.get(requestId);
    },
    isCurrent(requestId, tabId, controller) {
      const request = requests.get(requestId);
      return Boolean(
        request &&
          request.tabId === tabId &&
          currentByTab.get(tabId) === requestId &&
          (!controller || request.controller === controller) &&
          !request.controller.signal.aborted
      );
    },
    abortTab(tabId) {
      const requestId = currentByTab.get(tabId);
      if (!requestId) return undefined;
      const request = requests.get(requestId);
      if (request) request.controller.abort();
      return request;
    },
    finish(requestId) {
      const request = requests.get(requestId);
      if (!request) return;
      requests.delete(requestId);
      if (currentByTab.get(request.tabId) === requestId) currentByTab.delete(request.tabId);
    },
    discardTab(tabId) {
      const requestId = currentByTab.get(tabId);
      if (requestId) requests.delete(requestId);
      currentByTab.delete(tabId);
    },
    hasActive(tabId) {
      return currentByTab.has(tabId);
    },
  };
}
