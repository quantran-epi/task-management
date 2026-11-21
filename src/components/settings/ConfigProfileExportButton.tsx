import { useState } from 'react';
import { Button , useNotification} from '../ui';
import { ExportOutlined } from '../ui/icon';
import type { ConfigurationProfile } from '../../services/configProfiles/types';
import { exportProfileToFile } from '../../services/configProfiles/exportProfile';
import { announceToScreenReader } from '../common/AriaLiveRegion';

export interface ConfigProfileExportButtonProps {
  /** The selected profile — never a query of the author's current settings. */
  profile: ConfigurationProfile | null;
}

/**
 * One-click export of exactly the selected profile (D-06). The button never reads db,
 * localStorage or the keyring itself; exportProfileToFile blanks declared secrets.
 */
export const ConfigProfileExportButton: React.FC<ConfigProfileExportButtonProps> = ({ profile }) => {
  const notification = useNotification();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!profile) return;
    setLoading(true);
    announceToScreenReader('Đang xuất cấu hình profile...');
    try {
      const result = await exportProfileToFile(profile);
      if (!result.saved) {
        notification.info({
          message: 'Đã hủy xuất profile',
          description: 'Không có tệp nào được lưu.',
        });
        announceToScreenReader('Đã hủy xuất profile.');
        return;
      }
      notification.success({
        message: 'Đã xuất profile thành công',
        description: `${profile.name} đã được lưu thành tệp JSON. Các trường secret để trống.`,
      });
      announceToScreenReader(`Đã xuất profile ${profile.name} thành công.`);
    } catch (error) {
      notification.error({
        message: 'Xuất profile thất bại',
        description: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định',
      });
      announceToScreenReader('Xuất profile thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="primary"
      icon={<ExportOutlined />}
      loading={loading}
      disabled={!profile}
      onClick={handleExport}
    >
      Xuất profile này
    </Button>
  );
};
