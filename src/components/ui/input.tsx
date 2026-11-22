import type { InputProps as AntInputProps, InputRef } from 'antd';
import type { SearchProps as AntInputSearchProps } from 'antd/es/input/Search';
import type { PasswordProps as AntInputPasswordProps } from 'antd/es/input/Password';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { classNames } from './native/classNames';
import buttonStyles from './openidea/Button.module.css';
import inputStyles from './openidea/Input.module.css';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

/** Full-width is the default; `auto` keeps the AntD intrinsic width. */
export type InputWidth = 'full' | 'auto';

export interface InputProps extends AntInputProps {
  width?: InputWidth;
}

/** Shared control metrics as custom properties — no inline fractional font-size (D-10). */
export function controlStyle(): CSSProperties {
  const { controlHeight, borderRadius, fontSize, paddingInline } = getSharedControlTokens();
  return {
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-padding-inline': `${paddingInline}px`,
  } as CSSProperties;
}

/** Token-derived width policy. No raw caller-supplied CSS width. */
export function controlWidthStyle(width: InputWidth): CSSProperties {
  return width === 'full' ? { width: '100%' } : {};
}

type Cursor = 'start' | 'end' | 'all';

function focusField(
  element: HTMLInputElement | null,
  options?: { cursor?: Cursor; preventScroll?: boolean },
): void {
  if (!element) return;
  element.focus(options);
  const cursor = options?.cursor;
  if (!cursor) return;
  const end = element.value.length;
  const [start, stop] = cursor === 'start' ? [0, 0] : cursor === 'end' ? [end, end] : [0, end];
  element.setSelectionRange(start, stop);
}

function useInputRef(ref: React.Ref<InputRef>) {
  const elementRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(ref, () => ({
    focus: (options) => focusField(elementRef.current, options),
    blur: () => elementRef.current?.blur(),
    setSelectionRange: (start, end, direction) => elementRef.current?.setSelectionRange(start, end, direction),
    select: () => elementRef.current?.select(),
    input: elementRef.current,
    nativeElement: elementRef.current,
  }));
  return elementRef;
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8s2.4-3.5 6.5-3.5S14.5 8 14.5 8s-2.4 3.5-6.5 3.5S1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      {visible ? null : <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}

const COUNT_STYLE: CSSProperties = { color: 'var(--fg-faint)', fontSize: 'var(--fs-small)' };

interface NativeFieldProps extends Omit<InputProps, 'status'> {
  status?: InputProps['status'];
  elementRef: React.RefObject<HTMLInputElement | null>;
  invalid?: boolean;
}

/** Native S-FLD DOM; caller className/style win after token defaults. */
function NativeField({
  width = 'full',
  status,
  size: _size,
  variant: _variant,
  bordered: _bordered,
  rootClassName,
  classNames: _semanticClasses,
  styles: _semanticStyles,
  className,
  style,
  prefix,
  suffix,
  addonBefore,
  addonAfter,
  allowClear,
  showCount,
  count,
  onPressEnter,
  onClear,
  onChange,
  onKeyDown,
  value,
  elementRef,
  invalid: invalidProp,
  ...rest
}: NativeFieldProps) {
  void _size;
  void _variant;
  void _bordered;
  void _semanticClasses;
  void _semanticStyles;
  const invalid = invalidProp === true || status === 'error' || rest['aria-invalid'] === true;
  const affixed = Boolean(prefix || suffix || addonBefore || addonAfter || allowClear || showCount);
  const frame = classNames(
    inputStyles.input,
    inputStyles.framed,
    invalid && inputStyles.invalid,
    rootClassName,
    className,
  );
  const mergedStyle = { ...controlStyle(), ...controlWidthStyle(width), ...style };
  const uncontrolled = value === undefined || value === null;
  const text = uncontrolled ? '' : String(value);
  const countText = showCount
    ? `${text.length}${typeof count?.max === 'number' ? `/${count.max}` : rest.maxLength !== undefined ? `/${rest.maxLength}` : ''}`
    : null;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange?.(event);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.key === 'Enter') onPressEnter?.(event);
  };
  const handleClear = () => {
    const element = elementRef.current;
    if (element) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.focus();
    }
    onClear?.();
  };

  const input = (
    <input
      {...withoutUndefined(rest)}
      ref={elementRef}
      defaultValue={uncontrolled ? (rest.defaultValue as string | number | readonly string[] | undefined) : undefined}
      value={uncontrolled ? undefined : text}
      maxLength={rest.maxLength}
      aria-invalid={invalid || undefined}
      className={affixed ? classNames(inputStyles.searchInput) : frame}
      data-oi-control={affixed ? undefined : 'input'}
      data-state={invalid ? 'invalid' : 'framed'}
      style={affixed ? undefined : mergedStyle}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );

  if (!affixed) return input;

  return (
    <span className={classNames(inputStyles.searchField, frame)} data-oi-control="input" data-state={invalid ? 'invalid' : 'framed'} style={mergedStyle}>
      {addonBefore ? <span className={inputStyles.leading}>{addonBefore}</span> : null}
      {prefix ? <span className={inputStyles.leading}>{prefix}</span> : null}
      {input}
      {allowClear ? (
        <button type="button" aria-label="Xóa" className={classNames(buttonStyles.iconButton, buttonStyles['is-small'])} onClick={handleClear}>
          <ClearIcon />
        </button>
      ) : null}
      {suffix ? <span className={inputStyles.leading}>{suffix}</span> : null}
      {addonAfter ? <span className={inputStyles.leading}>{addonAfter}</span> : null}
      {countText ? <span style={COUNT_STYLE}>{countText}</span> : null}
    </span>
  );
}

/** Single swap point for every AntD Input. Error maps to native `aria-invalid`. */
export const Input = forwardRef<InputRef, InputProps>(function Input(
  { width = 'full', status, style, ...rest },
  ref,
) {
  const elementRef = useInputRef(ref);
  return (
    <NativeField
      {...rest}
      width={width}
      status={status}
      style={style}
      elementRef={elementRef}
    />
  );
});

export interface InputSearchProps extends AntInputSearchProps {
  width?: InputWidth;
}

/** Native search field; `onSearch` payload stays AntD-shaped. */
export const InputSearch = forwardRef<InputRef, InputSearchProps>(function InputSearch(
  { width = 'full', status, style, onSearch, onPressEnter, ...rest },
  ref,
) {
  const elementRef = useInputRef(ref);
  return (
    <NativeField
      {...rest}
      width={width}
      status={status}
      style={style}
      elementRef={elementRef}
      allowClear={rest.allowClear ?? true}
      onClear={() => onSearch?.('', undefined, { source: 'clear' })}
      onPressEnter={(event) => {
        onPressEnter?.(event);
        onSearch?.(event.currentTarget.value, event, { source: 'input' });
      }}
    />
  );
});

export interface InputPasswordProps extends AntInputPasswordProps {
  width?: InputWidth;
}

/** Native password field with a real accessible toggle button. */
export const InputPassword = forwardRef<InputRef, InputPasswordProps>(function InputPassword(
  { width = 'full', status, style, visibilityToggle, ...rest },
  ref,
) {
  const elementRef = useInputRef(ref);
  const [visible, setVisible] = useState(false);
  const toggleEnabled = visibilityToggle !== false;
  return (
    <NativeField
      {...rest}
      type={visible ? 'text' : 'password'}
      width={width}
      status={status}
      style={style}
      elementRef={elementRef}
      suffix={toggleEnabled ? (
        <button
          type="button"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          className={classNames(buttonStyles.iconButton, buttonStyles['is-small'])}
          onClick={() => {
            const next = !visible;
            setVisible(next);
            if (typeof visibilityToggle === 'object') visibilityToggle.onVisibleChange?.(next);
          }}
        >
          <EyeIcon visible={visible} />
        </button>
      ) : undefined}
    />
  );
});
