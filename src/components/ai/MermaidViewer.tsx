import React, { useEffect, useRef, useState, useId } from 'react';
import { Button, Tooltip, Modal, Spin, message, theme } from 'antd';
import {
  DownloadOutlined,
  FullscreenOutlined,
  CopyOutlined,
  CheckOutlined,
  CodeOutlined,
  EyeOutlined,
} from '@ant-design/icons';

export interface MermaidViewerProps {
  code: string;
  className?: string;
}

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
        fontFamily: 'inherit',
      });
      return m;
    });
  }
  return mermaidPromise;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code, className }) => {
  const { token } = theme.useToken();
  const rawId = useId();
  const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [viewSource, setViewSource] = useState<boolean>(false);

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
      .then(async (m) => {
        if (cancelled) return;
        try {
          // mermaid.render requires a valid DOM-safe id
          const id = `${diagramId}-${Date.now()}`;
          const { svg } = await m.default.render(id, cleanCode);
          if (!cancelled) {
            setSvgHtml(svg);
            setError(null);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError((err as Error)?.message || 'Lỗi render sơ đồ Mermaid');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
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
  }, [code, diagramId]);

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

  return (
    <div
      className={className}
      style={{
        margin: '10px 0',
        borderRadius: 8,
        border: `1px solid ${token.colorBorderSecondary}`,
        backgroundColor: token.colorFillAlter,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          backgroundColor: token.colorFillQuaternary,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, color: token.colorTextSecondary }}>📊 Mermaid Diagram</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={viewSource ? 'Xem sơ đồ' : 'Xem mã nguồn'}>
            <Button
              type="text"
              size="small"
              icon={viewSource ? <EyeOutlined /> : <CodeOutlined />}
              onClick={() => setViewSource((v) => !v)}
              style={{ fontSize: 12 }}
            />
          </Tooltip>
          <Tooltip title="Sao chép cú pháp">
            <Button
              type="text"
              size="small"
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
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadSvg}
                  style={{ fontSize: 12 }}
                />
              </Tooltip>
              <Tooltip title="Xem toàn màn hình">
                <Button
                  type="text"
                  size="small"
                  icon={<FullscreenOutlined />}
                  onClick={() => setShowModal(true)}
                  style={{ fontSize: 12 }}
                />
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Main content body */}
      <div style={{ padding: 12, overflowX: 'auto', minHeight: 60 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
            <Spin size="small" />
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>Đang render sơ đồ...</span>
          </div>
        ) : error ? (
          <div style={{ padding: 8, color: token.colorError, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Không thể vẽ sơ đồ Mermaid:</div>
            <pre style={{ margin: 0, padding: 8, background: token.colorFillSecondary, borderRadius: 4, overflowX: 'auto' }}>
              {error}
            </pre>
          </div>
        ) : viewSource ? (
          <pre
            style={{
              margin: 0,
              padding: 8,
              fontSize: 12,
              fontFamily: 'Consolas, monospace',
              backgroundColor: token.colorFillSecondary,
              borderRadius: 4,
              overflowX: 'auto',
            }}
          >
            <code>{code}</code>
          </pre>
        ) : (
          <div
            ref={containerRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              overflowX: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}
      </div>

      {/* Zoom Modal */}
      <Modal
        open={showModal}
        onCancel={() => setShowModal(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyCode}>
            Sao chép code
          </Button>,
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadSvg}>
            Tải SVG
          </Button>,
          <Button key="close" onClick={() => setShowModal(false)}>
            Đóng
          </Button>,
        ]}
        width="90vw"
        style={{ top: 20 }}
        title="Xem sơ đồ chi tiết"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            maxHeight: '75vh',
            overflow: 'auto',
            background: token.colorBgContainer,
          }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </Modal>
    </div>
  );
};
