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
