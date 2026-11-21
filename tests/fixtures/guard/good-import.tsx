// Positive fixture: wrapper imports + type-only AntD import (D-19 allowTypeImports).
import { Button } from '../../../src/components/ui';
import { SearchOutlined } from '../../../src/components/ui/icon';
import type { ButtonProps } from 'antd';

// Type-only import (D-19): referenced here without forwarding AntD props to the
// TaskMate wrapper, whose policy narrows `variant` (exactOptionalPropertyTypes).
export type GoodImportProps = Pick<ButtonProps, 'danger' | 'loading' | 'disabled'>;

export function GoodImport() {
  return <Button icon={<SearchOutlined />}>good</Button>;
}
