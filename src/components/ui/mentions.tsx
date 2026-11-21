import { Mentions as AntMentions, type MentionsProps as AntMentionsProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';
import { controlStyle, controlWidthStyle } from './input';

export type { MentionsProps, MentionsRef } from 'antd';
export type { MentionsOptionProps } from 'antd/es/mentions';

export interface MentionsWrapperProps extends AntMentionsProps {
  width?: 'full' | 'auto';
}

/** Mentions with shared input metrics; Option is the real AntD static. */
export function Mentions({ width = 'full', style, ...rest }: MentionsWrapperProps) {
  const { iconSize } = getSharedControlTokens();
  return (
    <AntMentions
      {...rest}
      style={{
        ...controlStyle(),
        ...controlWidthStyle(width),
        '--ui-mention-icon-size': iconSize,
        ...style,
      } as CSSProperties}
    />
  );
}

export const MentionsOption = AntMentions.Option;
