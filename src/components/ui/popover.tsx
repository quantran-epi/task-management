import { Popover as AntPopover, type PopoverProps as AntPopoverProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { PopoverProps } from 'antd';

export interface PopoverWrapperProps extends AntPopoverProps {
  widthScale?: 'md' | 'lg';
}

const WIDTH_SCALE = { md: 18, lg: 28 } as const;

/** Popover with the same token-derived popup width scale as Tooltip. */
export function Popover({ widthScale = 'md', overlayStyle, ...rest }: PopoverWrapperProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const width = `${controlHeight * WIDTH_SCALE[widthScale]}px`;
  const style = {
    maxWidth: width,
    '--ui-control-font-size': `${fontSize}px`,
    borderRadius: `${borderRadius}px`,
    ...overlayStyle,
  } as CSSProperties;
  return <AntPopover {...rest} overlayStyle={style} />;
}
