import React, { useEffect, useRef, useState, useId, useCallback } from 'react';
import { Button, Tooltip, Modal, Spin, message, theme, Space } from 'antd';
import {
  DownloadOutlined,
  FullscreenOutlined,
  CopyOutlined,
  CheckOutlined,
  CodeOutlined,
  EyeOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  UndoOutlined,
  ColumnWidthOutlined,
  DragOutlined,
} from '@ant-design/icons';

export interface MermaidViewerProps {
  code: string;
  className?: string;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const STEP = 0.2;
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
function getMermaid() {
  if (!mermaidPromise) mermaidPromise = import('mermaid');
  return mermaidPromise;
}

type Palette = 'light' | 'dark';

function configure(m: typeof import('mermaid').default, palette: Palette) {
  m.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrorRendering: true,
    theme: palette === 'dark' ? 'dark' : 'default',
    fontFamily: FONT_STACK,
  });
}

function isDarkColor(cssColor: string): boolean {
  const hex = cssColor.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return false;
  let value = hex[1]!;
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code, className }) => {
  const { token } = theme.useToken();
  const palette: Palette = isDarkColor(String(token.colorBgContainer)) ? 'dark' : 'light';
  const rawId = useId();
  const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const modalViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [viewSource, setViewSource] = useState<boolean>(false);

  // Zoom & pan state for the fullscreen modal
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  const clampScale = (value: number) => Math.min(Math.max(Number(value.toFixed(2)), MIN_SCALE), MAX_SCALE);

  const handleZoomIn = useCallback(() => setScale((prev) => clampScale(prev + STEP)), []);
  const handleZoomOut = useCallback(() => setScale((prev) => clampScale(prev - STEP)), []);
  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleFitToView = useCallback(() => {
    if (!modalViewportRef.current || canvasSize.w <= 0 || canvasSize.h <= 0) return;
    const vpWidth = modalViewportRef.current.clientWidth - 48;
    const vpHeight = modalViewportRef.current.clientHeight - 48;
    if (vpWidth <= 0 || vpHeight <= 0) return;
    const fitScale = Math.min(vpWidth / canvasSize.w, vpHeight / canvasSize.h);
    setScale(clampScale(fitScale));
    setPosition({ x: 0, y: 0 });
  }, [canvasSize]);

  // Pan / drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: dragStartRef.current.initX + (e.clientX - dragStartRef.current.startX),
      y: dragStartRef.current.initY + (e.clientY - dragStartRef.current.startY),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls natively
    e.preventDefault();
    const next = scale * (e.deltaY < 0 ? 1.1 : 0.9);
    setScale(clampScale(next));
  };

  // Keyboard shortcuts when modal is open: +, -, 0, f, esc
  useEffect(() => {
    if (!showModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleFitToView();
      } else if (e.key === 'Escape') {
        setShowModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, handleZoomIn, handleZoomOut, handleResetZoom, handleFitToView]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const cleanCode = code.trim();
    if (!cleanCode) {
      setLoading(false);
      return;
    }

    getMermaid()
      .then(async ({ default: m }) => {
        if (cancelled) return;
        try {
          configure(m, palette);
          const id = `${diagramId}-${Date.now()}`;
          const { svg } = await m.render(id, cleanCode);
          if (!cancelled) {
            const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number);
            // Mermaid 11 can return a 16x16 empty sentinel SVG when text measurement fails.
            if (!viewBox || viewBox.length !== 4 || viewBox[2]! <= 16 || viewBox[3]! <= 16) {
              throw new Error('Mermaid không tạo được kích thước sơ đồ hợp lệ');
            }
            // Keep natural SVG dimensions; containers scroll wide diagrams instead of shrinking labels.
            const normalizedSvg = svg.replace(/<svg\b([^>]*)>/, (_match, attributes: string) => {
              const normalizedAttributes = attributes
                .replace(/\s(?:width|height|style)="[^"]*"/g, '')
                .trim();
              return `<svg ${normalizedAttributes} width="${viewBox[2]}" height="${viewBox[3]}" style="max-width:none">`;
            });
            setSvgHtml(normalizedSvg);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            // Remove leaked error elements Mermaid may inject into document.body on failure.
            document.querySelectorAll(`[id*="${diagramId}"]`).forEach((el) => {
              if (!containerRef.current?.contains(el)) el.remove();
            });
            setSvgHtml('');
            setError((err as Error)?.message || 'Lỗi render sơ đồ Mermaid');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error)?.message || 'Không thể tải Mermaid engine');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, diagramId, palette]);

  // Measure natural diagram size for the modal canvas (fit / scroll sizing).
  useEffect(() => {
    if (!showModal || !svgHtml) return;
    const svg = canvasRef.current?.querySelector('svg');
    if (!svg) return;
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      setCanvasSize({ w: vb.width, h: vb.height });
    } else {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setCanvasSize({ w: rect.width, h: rect.height });
    }
  }, [showModal, svgHtml]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      message.success('Đã sao chép cú pháp Mermaid');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Không thể sao chép');
    }
  };

  const handleDownloadSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Đã tải xuống sơ đồ SVG');
  };

  const canvasStyle: React.CSSProperties = {
    width: canvasSize.w > 0 ? canvasSize.w * scale : undefined,
    height: canvasSize.h > 0 ? canvasSize.h * scale : undefined,
    margin: 'auto',
    position: 'relative',
    flex: 'none',
  };

  return (
    <div
      className={className}
      style={{
        margin: '12px 0',
        borderRadius: 10,
        border: `1px solid ${token.colorBorderSecondary}`,
        backgroundColor: token.colorBgContainer,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
        width: '100%',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 14px',
          backgroundColor: token.colorFillAlter,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, color: token.colorTextSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>📊</span>
          <span>Mermaid Diagram</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={viewSource ? 'Xem sơ đồ' : 'Xem mã nguồn'}>
            <Button
              type="text"
              size="small"
              aria-label="view-source"
              icon={viewSource ? <EyeOutlined /> : <CodeOutlined />}
              onClick={() => setViewSource((v) => !v)}
              style={{ fontSize: 12 }}
            />
          </Tooltip>
          <Tooltip title="Sao chép cú pháp">
            <Button
              type="text"
              size="small"
              aria-label="copy-code"
              icon={copied ? <CheckOutlined style={{ color: token.colorSuccess }} /> : <CopyOutlined />}
              onClick={handleCopyCode}
              style={{ fontSize: 12 }}
            />
          </Tooltip>
          {svgHtml && !error && (
            <>
              <Tooltip title="Tải về file SVG">
                <Button
                  type="text"
                  size="small"
                  aria-label="download-svg"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadSvg}
                  style={{ fontSize: 12 }}
                />
              </Tooltip>
              <Tooltip title="Xem toàn màn hình & Phóng to">
                <Button
                  type="text"
                  size="small"
                  aria-label="fullscreen"
                  icon={<FullscreenOutlined />}
                  onClick={() => {
                    handleResetZoom();
                    setShowModal(true);
                  }}
                  style={{ fontSize: 12 }}
                />
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Main content body */}
      <div
        style={{
          padding: 14,
          overflowX: 'auto',
          overflowY: 'hidden',
          minHeight: 80,
          background: token.colorBgContainer,
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0', gap: 8 }}>
            <Spin size="small" />
            <span style={{ fontSize: 13, color: token.colorTextSecondary }}>Đang render sơ đồ...</span>
          </div>
        ) : error ? (
          <div style={{ padding: 10, color: token.colorError, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠️ Không thể vẽ sơ đồ Mermaid:</div>
            <pre style={{ margin: 0, padding: 10, background: token.colorFillSecondary, borderRadius: 6, overflowX: 'auto' }}>
              {error}
            </pre>
          </div>
        ) : viewSource ? (
          <pre
            style={{
              margin: 0,
              padding: 12,
              fontSize: 12,
              fontFamily: 'Consolas, monospace',
              backgroundColor: token.colorFillSecondary,
              borderRadius: 6,
              overflowX: 'auto',
            }}
          >
            <code>{code}</code>
          </pre>
        ) : (
          <div
            ref={containerRef}
            className="mermaid-svg-container"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}
      </div>

      {/* Fullscreen / Interactive Modal */}
      <Modal
        open={showModal}
        onCancel={() => setShowModal(false)}
        footer={
          <Space orientation="horizontal">
            <Button icon={<CopyOutlined />} onClick={handleCopyCode}>
              Sao chép code
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadSvg}>
              Tải SVG
            </Button>
            <Button onClick={() => setShowModal(false)}>Đóng (Esc)</Button>
          </Space>
        }
        width="95vw"
        style={{ top: 16 }}
        title="Sơ đồ chi tiết"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Space orientation="horizontal" size="small">
            <Tooltip title="Thu nhỏ (-)">
              <Button size="small" aria-label="zoom-out" icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
            </Tooltip>
            <span style={{ fontSize: 12, fontWeight: 500, minWidth: 46, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <Tooltip title="Phóng to (+)">
              <Button size="small" aria-label="zoom-in" icon={<ZoomInOutlined />} onClick={handleZoomIn} />
            </Tooltip>
            <Tooltip title="Vừa màn hình (F)">
              <Button size="small" aria-label="fit-view" icon={<ColumnWidthOutlined />} onClick={handleFitToView} />
            </Tooltip>
            <Tooltip title="Đặt lại (0)">
              <Button size="small" aria-label="reset-zoom" icon={<UndoOutlined />} onClick={handleResetZoom} />
            </Tooltip>
          </Space>
          <span style={{ fontSize: 12, color: token.colorTextTertiary, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <DragOutlined /> Kéo để di chuyển · Ctrl + cuộn để zoom
          </span>
        </div>

        <div
          ref={modalViewportRef}
          className="mermaid-modal-viewport"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            display: 'flex',
            width: '100%',
            height: '72vh',
            overflow: 'auto',
            background: token.colorFillAlter,
            borderRadius: 8,
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          <div style={canvasStyle}>
            <div
              ref={canvasRef}
              className="mermaid-modal-canvas"
              style={{
                width: canvasSize.w > 0 ? canvasSize.w : undefined,
                height: canvasSize.h > 0 ? canvasSize.h : undefined,
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
