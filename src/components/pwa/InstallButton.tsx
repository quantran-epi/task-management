import React, { useState } from 'react';
import { Button, Grid, type ButtonProps } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { IosInstallModal } from './IosInstallModal';

const { useBreakpoint } = Grid;

export interface InstallButtonProps {
  mode?: 'header' | 'settings';
  className?: string;
}

export const InstallButton: React.FC<InstallButtonProps> = ({ mode = 'header', className }) => {
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const [iosModalOpen, setIosModalOpen] = useState(false);

  const { isInstallable, isStandalone, isInstalled, isIos, promptInstall } = usePWAInstall();

  // Hide button in standalone mode or after successful install per D-05 and D-08
  if (isStandalone || isInstalled) {
    return null;
  }

  // If not installable and not on iOS, hide button
  if (!isInstallable && !isIos) {
    return null;
  }

  const handleClick = async () => {
    if (isIos) {
      setIosModalOpen(true);
      return;
    }

    await promptInstall();
  };

  const buttonProps: ButtonProps = {
    type: mode === 'settings' ? 'primary' : 'default',
    size: mode === 'header' ? 'small' : 'middle',
    icon: <DownloadOutlined />,
    onClick: handleClick,
    'aria-label': 'Cài đặt ứng dụng',
  };

  if (className !== undefined) {
    buttonProps.className = className;
  }

  return (
    <>
      <Button {...buttonProps}>
        {mode === 'settings'
          ? 'Cài đặt ứng dụng'
          : isMobile
            ? null
            : 'Cài đặt'}
      </Button>

      {isIos && iosModalOpen && (
        <IosInstallModal
          open={iosModalOpen}
          onClose={() => setIosModalOpen(false)}
        />
      )}
    </>
  );
};
