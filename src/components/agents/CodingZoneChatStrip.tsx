import React, { useEffect, useRef, useState } from 'react';
import type { ConnectionState } from '../../types/codingZone';

/** Phase 48 D-16: compact mirror/companion for the existing team transcript — no new schema. */
export interface CodingZoneMessage {
  id: string;
  author: string;
  time: string;
  text: string;
  kind?: 'chat' | 'agent' | 'synthesis' | undefined;
}

export interface CodingZoneChatStripProps {
  messages: readonly CodingZoneMessage[];
  connection: ConnectionState;
  onlineCount: number;
  onSend: (text: string) => void;
  /** Wide layout for the team-chat perspective; same state and composer. */
  wide?: boolean | undefined;
  onPopout?: (() => void) | undefined;
  placeholder?: string | undefined;
}

const CONNECTION_COPY: Record<ConnectionState, string> = {
  connecting: 'Đang kết nối',
  connected: 'Đồng bộ',
  disconnected: 'Mất kết nối',
  'invalid-worktree': 'Worktree không hợp lệ',
  'session-ended': 'Phiên đã kết thúc',
};

export const CodingZoneChatStrip: React.FC<CodingZoneChatStripProps> = ({
  messages,
  connection,
  onlineCount,
  onSend,
  wide = false,
  onPopout,
  placeholder = 'Gõ tin từ Coding Zone...',
}) => {
  const [draft, setDraft] = useState('');
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className={`cz-chat-strip${wide ? ' cz-chat-wide' : ''}`} data-testid="coding-zone-chat-strip">
      <div className="cz-chat-head">
        <span>Team chat · {onlineCount} online</span>
        <span className={`cz-sync-chip cz-sync-${connection}`} data-testid="coding-zone-connection">
          <i className="cz-dot" /> {CONNECTION_COPY[connection]}
        </span>
        <span className="cz-spacer" />
        {onPopout ? (
          <button type="button" className="cz-icon-btn" aria-label="Mở Coding Zone ra cửa sổ riêng" title="Mở Coding Zone ra cửa sổ riêng" onClick={onPopout}>⤢</button>
        ) : null}
      </div>
      <div className="cz-chat-transcript" ref={transcriptRef} data-testid="coding-zone-transcript" role="log" aria-label="Hội thoại nhóm trong Coding Zone">
        {messages.map((message) => (
          <div key={message.id} className={`cz-msg${message.kind === 'agent' ? ' agent' : ''}`} data-testid="coding-zone-message">
            <div className="cz-msg-avatar">{Array.from(message.author.trim())[0]?.toUpperCase() ?? '?'}</div>
            <div className="cz-msg-main">
              <div className="cz-msg-meta">
                <span className="cz-msg-name">{message.author}</span>
                <span className="cz-msg-time">{message.time}</span>
                {message.kind === 'synthesis' ? <span className="cz-msg-kind synthesis">synthesis</span> : null}
                {message.kind === 'agent' ? <span className="cz-msg-kind">agent</span> : null}
              </div>
              <div className="cz-msg-text">{message.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="cz-chat-compose">
        <textarea
          value={draft}
          placeholder={placeholder}
          aria-label="Soạn tin nhắn trong Coding Zone"
          data-testid="coding-zone-composer"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="cz-compose-row">
          <span className="cz-compose-hint">Enter gửi · Shift+Enter xuống dòng</span>
          <span className="cz-spacer" />
          <button type="button" className="cz-btn tiny primary" data-testid="coding-zone-send" onClick={send}>Gửi</button>
        </div>
      </div>
    </div>
  );
};
