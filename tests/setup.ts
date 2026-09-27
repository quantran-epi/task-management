import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// JSDOM matchMedia shim for Ant Design responsive Observer and useThemeMode
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => {
    // Return matches: true for min-width queries up to 1024px to simulate desktop by default
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

// ResizeObserver shim for Ant Design dropdowns / popovers
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// JSDOM Web Crypto subtle shim using Node 24 native Web Crypto
if (typeof window !== 'undefined' && window.crypto && !window.crypto.subtle && globalThis.crypto?.subtle) {
  Object.defineProperty(window.crypto, 'subtle', {
    value: globalThis.crypto.subtle,
    writable: true,
    configurable: true,
  });
}

