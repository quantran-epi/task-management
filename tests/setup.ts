import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { Blob as NodeBlob } from 'node:buffer';

// JSDOM Blob shim using Node 24 native Blob so structuredClone / fake-indexeddb preserves Blob instances
globalThis.Blob = NodeBlob as any;
if (typeof window !== 'undefined') {
  window.Blob = NodeBlob as any;
}

// JSDOM matchMedia shim for Ant Design responsive Observer and useThemeMode
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      // Return matches: true for min-width queries up to 1024px to simulate desktop by default
      // Return matches: false for max-width queries (e.g. max-width: 991.98px) to avoid triggering responsive collapse on desktop
      const isDesktopQuery = query.includes('min-width: 768px') || query.includes('min-width: 992px');
      return {
        matches: isDesktopQuery,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
}

// ResizeObserver shim for Ant Design dropdowns / popovers
if (typeof window !== 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// JSDOM Web Crypto subtle shim using Node 24 native Web Crypto
if (typeof window !== 'undefined' && window.crypto && !window.crypto.subtle && globalThis.crypto?.subtle) {
  Object.defineProperty(window.crypto, 'subtle', {
    value: globalThis.crypto.subtle,
    writable: true,
    configurable: true,
  });
}

// Ensure global and window structuredClone and Blob work with native Node 24 Blob in JSDOM
if (typeof window !== 'undefined') {
  if (typeof globalThis.Blob !== 'undefined') {
    Object.defineProperty(window, 'Blob', {
      value: globalThis.Blob,
      writable: true,
      configurable: true,
    });
    (global as any).Blob = globalThis.Blob;
  }
  if (typeof globalThis.structuredClone !== 'undefined') {
    Object.defineProperty(window, 'structuredClone', {
      value: globalThis.structuredClone,
      writable: true,
      configurable: true,
    });
    (global as any).structuredClone = globalThis.structuredClone;
  }
}



