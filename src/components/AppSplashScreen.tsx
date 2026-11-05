import React, { useState, useEffect } from 'react';
import { TaskMateLogo } from './TaskMateLogo';

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
  minDuration = 800,
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

    const finishTimer = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        onReady?.();
      }, 350);
    }, minDuration);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(finishTimer);
    };
  }, [minDuration, onReady]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'linear-gradient(145deg, #18191c 0%, #1e1f22 50%, #111215 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        opacity: fading ? 0 : 1,
        transform: fading ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#ffffff',
      }}
    >
      {/* Background ambient radial glow */}
      <div
        style={{
          position: 'absolute',
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(236, 72, 153, 0.08) 50%, transparent 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Brand Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Animated App Logo with Neon Shadow */}
        <div
          style={{
            marginBottom: 24,
            filter: 'drop-shadow(0 12px 30px rgba(99, 102, 241, 0.35))',
            animation: 'pulse 2.5s infinite ease-in-out',
          }}
        >
          <TaskMateLogo size={76} />
        </div>

        {/* Title & Slogan */}
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '0.04em',
            background: 'linear-gradient(135deg, #ffffff 40%, #c7d2fe 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 4,
          }}
        >
          TaskMate
        </div>

        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: '#94a3b8',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}
        >
          IntelliJ Islands Workbench
        </div>

        {/* Progress Bar Container */}
        <div
          style={{
            width: 280,
            height: 4,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            position: 'relative',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 2,
              background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 50%, #ec4899 100%)',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)',
              transition: 'width 0.25s ease-out',
            }}
          />
        </div>

        {/* Boot Step Indicator Text */}
        <div
          style={{
            fontSize: 12,
            color: '#64748b',
            height: 18,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 8px #38bdf8',
            }}
          />
          <span>{BOOT_STEPS[currentStepIndex]}</span>
        </div>
      </div>

      {/* Footer Version Notice */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          fontSize: 11,
          color: '#475569',
          letterSpacing: '0.02em',
        }}
      >
        Private & Offline-First &bull; Personal Workload Planner
      </div>
    </div>
  );
};
export default AppSplashScreen;
