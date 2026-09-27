import { useState, useEffect } from 'react';
import { message } from 'antd';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';

/**
 * Tracks browser online/offline status using window events and navigator.onLine (D-12).
 * Triggers accessible screen reader announcements and toast alerts upon transition (D-09, UX-04).
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      message.success('Đã kết nối lại mạng');
      announceToScreenReader('Đã kết nối lại mạng. Ứng dụng đang hoạt động trực tuyến.');
    };

    const handleOffline = () => {
      setIsOnline(false);
      message.warning('Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ');
      announceToScreenReader('Đang làm việc ngoại tuyến. Tất cả dữ liệu được lưu an toàn trong máy.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
