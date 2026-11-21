// Negative fixture: intentionally banned runtime imports. ESLint must fail this file.
import { Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

export function BadImport() {
  return <Button icon={<SearchOutlined />}>bad</Button>;
}
