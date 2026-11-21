import { Input as AntInput } from 'antd';
import type { TextAreaProps as AntTextAreaProps } from 'antd/es/input/TextArea';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { forwardRef } from 'react';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';
import { controlStyle, controlWidthStyle, type InputWidth } from './input';

export interface TextareaProps extends AntTextAreaProps {
  width?: InputWidth;
}

/** Default minRows: 2 — matches the 30px single-line control plus one wrapped line (from controlHeight/line-height). */
export const DEFAULT_TEXTAREA_MIN_ROWS = 2;

/** Textarea wrapper: same font/radius policy, autoSize default minRows from the control token. */
export const Textarea = forwardRef<TextAreaRef, TextareaProps>(function Textarea(
  { width = 'full', autoSize, status, style, ...rest },
  ref,
) {
  const { controlHeight, fontSize } = getSharedControlTokens();
  const resolvedAutoSize = autoSize ?? {
    minRows: DEFAULT_TEXTAREA_MIN_ROWS,
    maxRows: Math.max(DEFAULT_TEXTAREA_MIN_ROWS, Math.round((controlHeight / fontSize) * 2)),
  };
  const merged = withoutUndefined({
    ...rest,
    autoSize: resolvedAutoSize,
    status: status ?? (rest['aria-invalid'] ? 'error' : undefined),
    style: { ...controlStyle(), ...controlWidthStyle(width), ...style },
  });
  return <AntInput.TextArea {...merged} ref={ref} />;
});
