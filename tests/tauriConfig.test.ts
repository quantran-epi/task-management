import defaultCapabilities from '../src-tauri/capabilities/default.json';
import tauriConfig from '../src-tauri/tauri.conf.json';

const xmlSpecialChars = /[&<>'"]/;

test('Tauri productName is safe for WiX XML templates', () => {
  expect(tauriConfig.productName).not.toMatch(xmlSpecialChars);
});

test('Tauri default capabilities include window close and destroy permissions', () => {
  expect(defaultCapabilities.permissions).toContain('core:window:allow-close');
  expect(defaultCapabilities.permissions).toContain('core:window:allow-destroy');
});
