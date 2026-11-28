import React, { useState, useEffect } from 'react';
import { TaskMateLogo } from './TaskMateLogo';
import './app-splash.css';

export interface AppSplashScreenProps {
  onReady?: () => void;
  minDuration?: number;
}

const BOOT_STEPS = [
  'Đang khởi động TaskMate Workbench...',
  'Đang tải cấu hình IndexedDB & Lưu trữ cục bộ...',
  'Khởi tạo mô hình JetBrains Islands Engine...',
  'Sẵn sàng làm việc!',
];

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({
  onReady,
  minDuration = 1800,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(15);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setCurrentStepIndex(1);
      setProgress(45);
    }, minDuration * 0.3);

    const timer2 = setTimeout(() => {
      setCurrentStepIndex(2);
      setProgress(80);
    }, minDuration * 0.65);

    const timer3 = setTimeout(() => {
      setCurrentStepIndex(3);
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
    <div className={fading ? 'tm-splash tm-splash--fading' : 'tm-splash'}>
      <div className="tm-splash__ambient" />

      <div className="tm-splash__brand">
        <div className="tm-splash__mark">
          <TaskMateLogo size={76} />
        </div>

        <div className="tm-splash__title">TaskMate</div>
        <div className="tm-splash__eyebrow">IntelliJ Islands Workbench</div>

        <div className="tm-splash__progress">
          <div
            className="tm-splash__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="tm-splash__step">
          <span className="tm-splash__step-dot" />
          <span>{BOOT_STEPS[currentStepIndex]}</span>
        </div>
      </div>

      <div className="tm-splash__footer">
        <div>Private & Offline-First &bull; Personal Workload Planner</div>
        <div className="tm-splash__footer-author">Developed by Quan Tran Duc</div>
      </div>
    </div>
  );
};
export default AppSplashScreen;
