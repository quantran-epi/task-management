import { Mentions as AntMentions, type MentionsProps as AntMentionsProps, type MentionsRef } from 'antd';
import { forwardRef, type CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';
import { controlStyle, controlWidthStyle } from './input';

export type { MentionsProps, MentionsRef } from 'antd';
export type { MentionsOptionProps } from 'antd/es/mentions';

export interface MentionsWrapperProps extends AntMentionsProps {
  width?: 'full' | 'auto';
}

/** Mentions with shared input metrics; Option is the real AntD static. */
export const Mentions = forwardRef<MentionsRef, MentionsWrapperProps>(function Mentions(
  { width = 'full', style, ...rest },
  ref,
) {
  const { iconSize } = getSharedControlTokens();
  return (
    <AntMentions
      {...rest}
      ref={ref}
      style={{
        ...controlStyle(),
        ...controlWidthStyle(width),
        '--ui-mention-icon-size': iconSize,
        ...style,
      } as CSSProperties}
    />
  );
});

export const MentionsOption = AntMentions.Option;
