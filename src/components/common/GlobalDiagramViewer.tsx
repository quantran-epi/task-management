import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, theme, Space } from 'antd';
import { ApartmentOutlined, ExportOutlined, CloseOutlined } from '@ant-design/icons';
import { MermaidViewer } from '../ai/MermaidViewer';
import { extractMermaidCode } from '../../services/ai/mermaidFixerService';

/**
 * Checks whether the given text is likely Mermaid diagram code.
 */
export function isLikelyMermaidCode(text: string): boolean {
  if (!text || text.trim().length < 6) return false;
  const clean = text.trim();
  if (clean.includes('```mermaid')) return true;
  const mermaidKeywords =
    /^\s*(graph\s+[A-Z]{2}|flowchart\s+[A-Z]{2}|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|quadrantChart|mindmap|gitGraph|C4Context|timeline)\b/m;
  return mermaidKeywords.test(clean);
}

export const GlobalDiagramViewer: React.FC = () => {
  const { token } = theme.useToken();
  const [modalOpen, setModalOpen] = useState(false);
  const [diagramCode, setDiagramCode] = useState('');
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingSelectionCode, setPendingSelectionCode] = useState<string>('');

  const floatingRef = useRef<HTMLDivElement>(null);

  // Close floating popover
  const dismissFloating = useCallback(() => {
    setFloatingPos(null);
    setPendingSelectionCode('');
  }, []);

  // Global click listener for .code-diagram-btn and .code-copy-btn on rendered markdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Handle "Xem Diagram" button clicks on code block header
      const diagramBtn = target.closest('.code-diagram-btn');
      if (diagramBtn) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = diagramBtn.closest('.code-block-wrapper');
        const codeEl = wrapper?.querySelector('code');
        const rawCode = codeEl?.textContent || '';
        if (rawCode.trim()) {
          setDiagramCode(rawCode.trim());
          setModalOpen(true);
        }
        return;
      }

      // Handle copy button clicks if not already bound
      const copyBtn = target.closest('.code-copy-btn');
      if (copyBtn) {
        const wrapper = copyBtn.closest('.code-block-wrapper');
        const codeEl = wrapper?.querySelector('code');
        const textToCopy = codeEl?.textContent || '';
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
              copyBtn.textContent = originalText || 'Copy';
            }, 1800);
          }).catch(() => {});
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Selection detection for Mermaid diagram code
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside our floating button
      if (floatingRef.current && floatingRef.current.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        dismissFloating();
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length < 10) {
        dismissFloating();
        return;
      }

      // Don't intercept normal inputs
      const anchorNode = selection.anchorNode;
      const targetElement =
        anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (anchorNode as HTMLElement)
          : anchorNode?.parentElement;
      if (
        targetElement?.tagName === 'INPUT' ||
        targetElement?.tagName === 'TEXTAREA' ||
        targetElement?.closest('.ant-input') ||
        targetElement?.closest('.ant-mentions')
      ) {
        dismissFloating();
        return;
      }

      if (isLikelyMermaidCode(selectedText)) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;

          const cleanedCode = extractMermaidCode(selectedText);
          setPendingSelectionCode(cleanedCode);

          // Position the floating chip just above the selection
          const x = Math.min(Math.max(rect.left + rect.width / 2 - 60, 16), window.innerWidth - 160);
          const y = Math.max(rect.top + window.scrollY - 36, 16);

          setFloatingPos({ x, y });
        } catch {
          dismissFloating();
        }
      } else {
        dismissFloating();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (floatingRef.current && floatingRef.current.contains(e.target as Node)) {
        return;
      }
      dismissFloating();
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [dismissFloating]);

  const handleOpenDiagramFromSelection = () => {
    if (pendingSelectionCode) {
      setDiagramCode(pendingSelectionCode);
      setModalOpen(true);
      dismissFloating();
    }
  };

  const handleOpenInStudio = () => {
    try {
      sessionStorage.setItem('tm_mermaid_studio_code', diagramCode);
    } catch {}
    window.dispatchEvent(new CustomEvent('taskmate:open-mermaid-studio', { detail: { code: diagramCode } }));
    window.location.hash = '#mermaid';
    setModalOpen(false);
  };

  return (
    <>
      {/* Floating Action Button when user highlights Mermaid code */}
      {floatingPos && (
        <div
          ref={floatingRef}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: floatingPos.x,
            top: floatingPos.y,
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            backgroundColor: token.colorPrimary,
            color: '#ffffff',
            borderRadius: 18,
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <span
            onClick={handleOpenDiagramFromSelection}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ApartmentOutlined />
            <span>Xem Diagram</span>
          </span>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined style={{ color: '#ffffff', fontSize: 10 }} />}
            onClick={dismissFloating}
            style={{ width: 16, height: 16, minWidth: 16, padding: 0, marginLeft: 2 }}
          />
        </div>
      )}

      {/* Modal displaying rendered Mermaid Diagram */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width="90vw"
        style={{ top: 20 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ApartmentOutlined style={{ color: token.colorPrimary }} />
              <span>Sơ đồ Diagram</span>
            </span>
            <Button size="small" icon={<ExportOutlined />} onClick={handleOpenInStudio}>
              Mở trong Mermaid Studio
            </Button>
          </div>
        }
        footer={
          <Space>
            <Button onClick={() => setModalOpen(false)}>Đóng</Button>
          </Space>
        }
      >
        <div style={{ maxHeight: '78vh', overflowY: 'auto' }}>
          {diagramCode ? (
            <MermaidViewer
              code={diagramCode}
              onCodeChange={(newCode) => setDiagramCode(newCode)}
              showAiFix={true}
              showOpenInStudio={true}
            />
          ) : null}
        </div>
      </Modal>
    </>
  );
};
