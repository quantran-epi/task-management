import type { TextAreaProps as AntTextAreaProps } from 'antd/es/input/TextArea';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { classNames } from './native/classNames';
import styles from './openidea/Input.module.css';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';
import { controlStyle, controlWidthStyle, type InputWidth } from './input';

export interface TextareaProps extends AntTextAreaProps {
  width?: InputWidth;
}

/** Default minRows: 2 — matches the 28px single-line control plus one wrapped line. */
export const DEFAULT_TEXTAREA_MIN_ROWS = 2;

const AUTO_SIZE_STYLE: CSSProperties = { resize: 'none', overflow: 'hidden' };

/** Textarea wrapper: native multiline S-FLD with the AntD ref shape intact. */
export const Textarea = forwardRef<TextAreaRef, TextareaProps>(function Textarea(
  { width = 'full', autoSize, status, style, className, showCount, onChange, ...rest },
  ref,
) {
  const { controlHeight, fontSize } = getSharedControlTokens();
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedAutoSize = autoSize ?? {
    minRows: DEFAULT_TEXTAREA_MIN_ROWS,
    maxRows: Math.max(DEFAULT_TEXTAREA_MIN_ROWS, Math.round((controlHeight / fontSize) * 2)),
  };
  const invalid = status === 'error' || rest['aria-invalid'] === true;
  const rows = typeof resolvedAutoSize === 'object' ? resolvedAutoSize.minRows ?? DEFAULT_TEXTAREA_MIN_ROWS : undefined;
  const uncontrolled = rest.value === undefined || rest.value === null;
  const text = uncontrolled ? '' : String(rest.value);
  const countText = showCount
    ? `${text.length}${rest.maxLength !== undefined ? `/${rest.maxLength}` : ''}`
    : null;
  void countText;

  useImperativeHandle(ref, () => ({
    focus: () => elementRef.current?.focus(),
    blur: () => elementRef.current?.blur(),
    resizableTextArea: { textArea: elementRef.current as HTMLTextAreaElement },
    nativeElement: elementRef.current,
  }));

  const merged = withoutUndefined({
    ...rest,
    value: uncontrolled ? undefined : text,
    defaultValue: uncontrolled ? (rest.defaultValue as string | number | readonly string[] | undefined) : undefined,
    'aria-invalid': invalid || undefined,
    className: classNames(
      styles.input,
      styles.framed,
      styles.multiline,
      invalid && styles.invalid,
      className,
    ),
    dataState: invalid ? 'invalid' : 'framed',
    style: {
      ...controlStyle(),
      ...controlWidthStyle(width),
      ...(resolvedAutoSize ? AUTO_SIZE_STYLE : {}),
      ...style,
    },
  });

  const {
    dataState,
    ...domProps
  } = merged as typeof merged & { dataState: string };

  return (
    <textarea
      {...domProps}
      ref={elementRef}
      rows={rows ?? rest.rows}
      onChange={onChange}
      data-oi-control="input"
      data-state={dataState}
    />
  );
});

/** Alias for the Textarea wrapper under the AntD compound name. */
export const TextArea = Textarea;
