function formatScreenshotName(now = new Date()): string {
  const digits = (value: number) => String(value).padStart(2, '0');
  return `screenshot-${now.getFullYear()}${digits(now.getMonth() + 1)}${digits(now.getDate())}-${digits(now.getHours())}${digits(now.getMinutes())}${digits(now.getSeconds())}.png`;
}

export async function captureFocusedWindowScreenshot(): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Trình duyệt không hỗ trợ chụp cửa sổ.');
  }

  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => reject(new Error('Không thể đọc khung hình đã chọn.'));
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      void video.play().catch(reject);
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
