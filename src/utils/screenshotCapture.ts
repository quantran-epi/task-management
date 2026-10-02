function formatScreenshotName(now = new Date()): string {
  const digits = (value: number) => String(value).padStart(2, '0');
  return `screenshot-${now.getFullYear()}${digits(now.getMonth() + 1)}${digits(now.getDate())}-${digits(now.getHours())}${digits(now.getMinutes())}${digits(now.getSeconds())}.png`;
}

export async function tryReadImageFromClipboard(): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        return new File([blob], formatScreenshotName(), { type: blob.type || 'image/png' });
      }
    }
  } catch {
    // Clipboard permission denied or no image in clipboard
  }
  return null;
}

export async function captureFocusedWindowScreenshot(): Promise<File> {
  // If getDisplayMedia is not available in environment (e.g. desktop webview without capture permissions), fallback to clipboard image
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const clipboardFile = await tryReadImageFromClipboard();
    if (clipboardFile) return clipboardFile;
    throw new Error('Ứng dụng không hỗ trợ chụp trực tiếp. Hãy chụp bằng Win+Shift+S rồi dán (Ctrl+V) vào ô ghi chú.');
  }

  let stream: MediaStream | undefined;
  try {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (displayErr) {
      if (displayErr instanceof DOMException && displayErr.name === 'NotAllowedError') {
        throw new Error('Đã hủy chọn cửa sổ chụp.');
      }
      // If getDisplayMedia failed, check clipboard before giving up
      const clipboardFile = await tryReadImageFromClipboard();
      if (clipboardFile) return clipboardFile;
      throw displayErr;
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Hết thời gian chờ khung hình (timeout).'));
        }
      }, 12000);

      const hasFrame = () => video.videoWidth > 0 && video.videoHeight > 0;

      const cleanup = () => {
        clearTimeout(timer);
        if (pollTimer !== undefined) clearTimeout(pollTimer);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('canplay', onLoaded);
        video.removeEventListener('playing', onLoaded);
        video.removeEventListener('error', onError);
      };

      const pollForFrame = () => {
        if (resolved) return;
        if (hasFrame()) {
          resolved = true;
          cleanup();
          resolve();
          return;
        }
        pollTimer = setTimeout(pollForFrame, 50);
      };

      const onLoaded = () => {
        if (resolved) return;
        if (hasFrame()) {
          resolved = true;
          cleanup();
          resolve();
          return;
        }
        pollForFrame();
      };

      const onError = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new Error('Không thể đọc khung hình đã chọn.'));
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('canplay', onLoaded);
      video.addEventListener('playing', onLoaded);
      video.addEventListener('error', onError, { once: true });
      video.srcObject = stream ?? null;

      if (hasFrame()) {
        onLoaded();
      } else {
        void video.play().catch(() => {
          // Play might reject if not in DOM, but metadata may still load
        });
        pollForFrame();
      }
    });

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Cửa sổ đã chọn không có khung hình hợp lệ.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không thể tạo ảnh chụp.');
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Không thể tạo ảnh PNG.'))),
        'image/png'
      )
    );
    return new File([blob], formatScreenshotName(), { type: 'image/png' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Đã hủy chọn cửa sổ chụp.');
    }
    throw error;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
