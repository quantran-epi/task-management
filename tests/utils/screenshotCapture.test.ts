import { describe, expect, it, vi } from 'vitest';
import { captureFocusedWindowScreenshot } from '../../src/utils/screenshotCapture';

describe('captureFocusedWindowScreenshot', () => {
  it('captures one PNG frame and always stops every track', async () => {
    const stops = [vi.fn(), vi.fn()];
    const stream = { getTracks: () => stops.map((stop) => ({ stop })) } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'video') {
        return {
          muted: false,
          videoWidth: 20,
          videoHeight: 10,
          play: vi.fn().mockResolvedValue(undefined),
          addEventListener: (name: string, listener: () => void) => name === 'loadedmetadata' && listener(),
          removeEventListener: vi.fn(),
          set srcObject(_: MediaStream) {},
        } as unknown as HTMLVideoElement;
      }
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    }) as typeof document.createElement);

    const file = await captureFocusedWindowScreenshot();

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(file.type).toBe('image/png');
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
  });

  it('falls back to clipboard image when getDisplayMedia is not available', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    const mockBlob = new Blob(['clipboard-img'], { type: 'image/png' });
    const mockClipboardItem = {
      types: ['image/png'],
      getType: vi.fn().mockResolvedValue(mockBlob),
    };

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: vi.fn().mockResolvedValue([mockClipboardItem]),
      },
    });

    const file = await captureFocusedWindowScreenshot();
    expect(file).toBeDefined();
    expect(file.type).toBe('image/png');
  });
});
