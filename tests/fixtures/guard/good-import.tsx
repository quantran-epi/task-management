// Positive fixture: wrapper imports + type-only AntD import (D-19 allowTypeImports).
import { Button } from '../../../src/components/ui';
import { SearchOutlined } from '../../../src/components/ui/icon';
import type { ButtonProps } from 'antd';

export function GoodImport(props: ButtonProps) {
  return <Button icon={<SearchOutlined />} {...props}>good</Button>;
}
