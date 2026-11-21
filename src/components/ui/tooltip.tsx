import { Tooltip as AntTooltip, type TooltipProps as AntTooltipProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { TooltipProps } from 'antd';
export type { TooltipPlacement } from 'antd/es/tooltip';

export interface TooltipWrapperProps extends AntTooltipProps {
  /** Max popup width derived from the control height; callers pick a scale, never raw CSS. */
  widthScale?: 'md' | 'lg';
}

const WIDTH_SCALE = { md: 18, lg: 28 } as const;

/** Tooltip with token-derived font/overlay width and a default short delay. */
export function Tooltip({ widthScale = 'md', overlayStyle, ...rest }: TooltipWrapperProps) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  const width = `${controlHeight * WIDTH_SCALE[widthScale]}px`;
  const style = {
    maxWidth: width,
    '--ui-control-font-size': `${fontSize}px`,
    borderRadius: `${borderRadius}px`,
    ...overlayStyle,
  } as CSSProperties;
  return (
    <AntTooltip
      {...rest}
      mouseEnterDelay={rest.mouseEnterDelay ?? 0.15}
      overlayStyle={style}
    />
  );
}
