import { saveFileWithPicker } from './fileExport';
import { message } from 'antd';

export interface ExportDiagramOptions {
  filename?: string;
  isDark?: boolean;
}

/**
 * Normalizes an SVG element ensuring valid namespaces, explicit width/height,
 * and background color before rasterization or download.
 */
export function prepareSvgForExport(svgEl: SVGSVGElement, isDark = false): {
  svgString: string;
  width: number;
  height: number;
} {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Ensure standard namespaces
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Determine explicit dimensions from viewBox or bounding box
  let width = 800;
  let height = 600;

  const viewBox = clone.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    width = Math.ceil(viewBox.width);
    height = Math.ceil(viewBox.height);
  } else {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      width = Math.ceil(rect.width);
      height = Math.ceil(rect.height);
    }
  }

  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.backgroundColor = isDark ? '#141414' : '#ffffff';

  const svgString = new XMLSerializer().serializeToString(clone);
  return { svgString, width, height };
}

/**
 * Downloads the SVG element as a native .svg file via Tauri file picker / browser download.
 */
export async function downloadMermaidSvg(
  svgEl: SVGSVGElement | null | undefined,
  options?: ExportDiagramOptions
): Promise<boolean> {
  if (!svgEl) {
    message.warning('Không tìm thấy sơ đồ SVG để xuất');
    return false;
  }

  const { svgString } = prepareSvgForExport(svgEl, options?.isDark);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `${options?.filename || 'diagram'}-${Date.now()}.svg`;

  try {
    const res = await saveFileWithPicker(filename, blob, {
      title: 'Lưu sơ đồ SVG',
      filters: [{ name: 'SVG Image', extensions: ['svg'] }],
    });
    if (res.saved) {
      message.success('Đã xuất file SVG thành công');
      return true;
    }
    return false;
  } catch (err) {
    console.error('Lỗi xuất SVG:', err);
    message.error('Không thể xuất file SVG');
    return false;
  }
}

/**
 * Converts the SVG element to a PNG Blob by rendering onto an HTML5 Canvas,
 * then saves it via Tauri native file picker or browser download.
 */
export async function downloadMermaidPng(
  svgEl: SVGSVGElement | null | undefined,
  options?: ExportDiagramOptions
): Promise<boolean> {
  if (!svgEl) {
    message.warning('Không tìm thấy sơ đồ để xuất PNG');
    return false;
  }

  const isDark = Boolean(options?.isDark);
  const { svgString, width, height } = prepareSvgForExport(svgEl, isDark);

  return new Promise((resolve) => {
    try {
      const scale = 2; // High DPI / Retina
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        message.error('Không khởi tạo được bộ vẽ Canvas');
        resolve(false);
        return;
      }

      ctx.scale(scale, scale);
      ctx.fillStyle = isDark ? '#141414' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const base64Data = btoa(unescape(encodeURIComponent(svgString)));
      const dataUri = `data:image/svg+xml;base64,${base64Data}`;

      const img = new Image();

      img.onload = async () => {
        try {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(async (blob) => {
            if (!blob) {
              message.error('Không thể trích xuất dữ liệu ảnh PNG');
              resolve(false);
              return;
            }

            const filename = `${options?.filename || 'diagram'}-${Date.now()}.png`;
            const res = await saveFileWithPicker(filename, blob, {
              title: 'Lưu ảnh PNG sơ đồ',
              filters: [{ name: 'PNG Image', extensions: ['png'] }],
            });

            if (res.saved) {
              message.success('Đã xuất file PNG thành công');
              resolve(true);
            } else {
              resolve(false);
            }
          }, 'image/png');
        } catch (canvasErr) {
          console.error('Canvas drawImage error:', canvasErr);
          // Fallback to SVG if canvas is blocked
          message.warning('Trình duyệt chặn xuất PNG, tự động tải SVG dự phòng...');
          const fallbackRes = await downloadMermaidSvg(svgEl, options);
          resolve(fallbackRes);
        }
      };

      img.onerror = async (err) => {
        console.error('SVG Image load error for PNG export:', err);
        message.warning('Không thể chuyển đổi PNG trên môi trường hiện tại, đang xuất dạng SVG...');
        const fallbackRes = await downloadMermaidSvg(svgEl, options);
        resolve(fallbackRes);
      };

      img.src = dataUri;
    } catch (err) {
      console.error('Error exporting PNG:', err);
      message.error('Không thể xuất ảnh PNG');
      resolve(false);
    }
  });
}
