import React, { useEffect, useState } from 'react';
import { TaskMateLogo } from './TaskMateLogo';
import './chat-standalone-splash.css';

export interface ChatStandaloneSplashProps {
  onReady?: () => void;
  minDuration?: number;
}

const BOOT_STEPS = [
  'Đang khởi động',
  'Đang kết nối cấu hình',
  'Đang chuẩn bị hội thoại',
  'Sẵn sàng',
];

/** Chat-only boot screen with its own CSS and timer lifecycle. */
export const ChatStandaloneSplash: React.FC<ChatStandaloneSplashProps> = ({
  onReady,
  minDuration = 1800,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(15);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setStepIndex(1);
      setProgress(45);
    }, minDuration * 0.3);

    const timer2 = setTimeout(() => {
      setStepIndex(2);
      setProgress(80);
    }, minDuration * 0.65);

    const timer3 = setTimeout(() => {
      setStepIndex(3);
      setProgress(100);
    }, minDuration * 0.9);

    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const finishTimer = setTimeout(() => {
      setFading(true);
      fadeTimer = setTimeout(() => {
        onReady?.();
      }, 350);
    }, minDuration);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(finishTimer);
      clearTimeout(fadeTimer);
    };
  }, [minDuration, onReady]);

  return (
    <div
      className={fading ? 'tm-chat-splash tm-chat-splash--fading' : 'tm-chat-splash'}
      role="status"
      aria-live="polite"
    >
      <div className="tm-chat-splash__glow" aria-hidden="true" />

      <div className="tm-chat-splash__brand">
        <div className="tm-chat-splash__mark">
          <TaskMateLogo size={54} />
        </div>

        <div className="tm-chat-splash__title">TaskMate Chat</div>
        <div className="tm-chat-splash__eyebrow">Không gian hội thoại riêng</div>

        <div className="tm-chat-splash__progress">
          <div
            className="tm-chat-splash__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="tm-chat-splash__progress-meta">
          <div className="tm-chat-splash__step">
            <span className="tm-chat-splash__step-dot" />
            <span className="tm-chat-splash__step-text">{BOOT_STEPS[stepIndex]}</span>
          </div>
          <span className="tm-chat-splash__percent">{progress}%</span>
        </div>
      </div>

      <div className="tm-chat-splash__footer">
        Private &bull; Local-first &bull; Always yours
      </div>
    </div>
  );
};

export default ChatStandaloneSplash;
