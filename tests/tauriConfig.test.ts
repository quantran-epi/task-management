import tauriConfig from '../src-tauri/tauri.conf.json';

const xmlSpecialChars = /[&<>'"]/;

test('Tauri productName is safe for WiX XML templates', () => {
  expect(tauriConfig.productName).not.toMatch(xmlSpecialChars);
});
