import { Splitter as AntSplitter, type SplitterProps as AntSplitterProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { SplitterProps } from 'antd';

export interface SplitterWrapperProps extends AntSplitterProps {
  /** Resizer hit target stays whole-pixel and token-derived. */
  compact?: boolean;
  /** AntD declares children only on the concrete component, not on SplitterProps. */
  children?: ReactNode;
}

/** Splitter with a token-derived resize handle size; Panel is the real AntD static. */
export function Splitter({ compact = true, style, ...rest }: SplitterWrapperProps) {
  const { borderRadius, iconSize } = getSharedControlTokens();
  const splitterStyle = {
    '--ui-splitter-handle-radius': `${borderRadius}px`,
    '--ui-splitter-handle-size': iconSize,
    ...style,
  } as CSSProperties;
  return <AntSplitter {...rest} style={splitterStyle} />;
}

export const SplitterPanel = AntSplitter.Panel;
