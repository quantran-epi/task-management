import type { ReactNode } from 'react';
import { AppstoreOutlined } from '../components/ui/icon';

/** One icon source for the Tool Explorer stripe item and right-panel header. */
export function toolExplorerIcon(size: number): ReactNode {
  return <AppstoreOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
}
