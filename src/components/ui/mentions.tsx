import type { MentionsProps as AntMentionsProps, MentionsRef } from 'antd';
import type { MentionsOptionProps } from 'antd/es/mentions';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import inputStyles from './openidea/Input.module.css';
import listStyles from './openidea/List.module.css';
import selectStyles from './openidea/Select.module.css';
import { getSharedControlTokens } from './tokens.contract';
import { controlStyle, controlWidthStyle } from './input';

export type { MentionsProps, MentionsRef } from 'antd';
export type { MentionsOptionProps } from 'antd/es/mentions';

export interface MentionsWrapperProps extends AntMentionsProps {
  width?: 'full' | 'auto';
}

type Suggestion = { key?: string; value?: string; label?: ReactNode; children?: ReactNode; disabled?: boolean; [key: string]: unknown };

function mentionLabel(option: Suggestion): ReactNode {
  return option.label ?? option.children ?? option.value ?? null;
}

/** Native option slot; value/label/children props stay source-compatible with AntD. */
export function MentionsOption(props: MentionsOptionProps): null {
  void props;
  return null;
}

/** Native textarea with @-triggered suggestion popup; ref shape stays AntD-compatible. */
export const Mentions = forwardRef<MentionsRef, MentionsWrapperProps>(function Mentions(
  {
    width = 'full',
    style,
    className,
    value,
    defaultValue,
    prefix,
    options,
    children,
    onChange,
    onSearch,
    onSelect,
    onInput,
    onCompositionEnd,
    onKeyDown,
    onBlur,
    autoSize,
    filterOption,
    validateSearch,
    disabled,
    placeholder,
    notFoundContent,
    styles,
    ...rest
  },
  ref,
) {
  const { iconSize } = getSharedControlTokens();
  const textareaStyle = typeof styles === 'object' && styles !== null && typeof styles.textarea === 'object' && styles.textarea !== null
    ? styles.textarea
    : {};
  const idBase = useId();
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  const [internal, setInternal] = useState<string>(String(defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState(0);
  const current = value !== undefined ? String(value) : internal;
  const prefixes = typeof prefix === 'string' ? [prefix] : prefix ?? ['@'];

  useImperativeHandle(ref, () => ({
    focus: () => elementRef.current?.focus(),
    blur: () => elementRef.current?.blur(),
    textarea: elementRef.current,
    nativeElement: elementRef.current as HTMLTextAreaElement,
  }));

  const suggestOptions = useMemo<Suggestion[]>(() => {
    if (Array.isArray(options)) return options as Suggestion[];
    const result: Suggestion[] = [];
    const visit = (node: ReactNode) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node === null || typeof node !== 'object') return;
      const props = (node as { props?: Record<string, unknown> }).props;
      if (props && ('value' in props || 'label' in props)) result.push(props as Suggestion);
    };
    visit(children);
    return result;
  }, [options, children]);

  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    if (!open) return [];
    const text = search.toLowerCase();
    const list = suggestOptions.filter((option) => {
      if (filterOption === false) return true;
      const label = String(mentionLabel(option) ?? '');
      return label.toLowerCase().includes(text);
    });
    return list;
  }, [open, search, suggestOptions, filterOption]);

  useEffect(() => { setLead(0); }, [search]);

  function close() {
    setOpen(false);
    setSearch('');
  }

  function apply(valueText: string, cursor: number) {
    const before = valueText.slice(0, cursor);
    const match = /([@#/])([\w:-]*)$/.exec(before);
    if (!match) { close(); return; }
    const currentPrefix = match[1] ?? '@';
    if (!prefixes.includes(currentPrefix)) { close(); return; }
    const text = match[2] ?? '';
    if (validateSearch && !validateSearch(text, rest.split)) { close(); return; }
    setSearch(text);
    onSearch?.(text, currentPrefix);
    setOpen(true);
  }

  function insert(option: Suggestion) {
    const textarea = elementRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const before = current.slice(0, cursor);
    const after = current.slice(cursor);
    const match = /([@#/])([\w:-]*)$/.exec(before);
    const start = match ? match.index : cursor;
    const insertion = `${match?.[1] ?? '@'}${option.value ?? ''} `;
    const next = `${current.slice(0, start)}${insertion}${after}`;
    setInternal(next);
    onChange?.(next);
    onSelect?.(option as never, match?.[1] ?? '@');
    close();
    requestAnimationFrame(() => {
      const position = start + insertion.length;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  }

  const shared = withoutUndefinedProps({
    'aria-label': rest['aria-label'],
    placeholder,
    disabled,
    value: current,
    className: classNames(inputStyles.input, inputStyles.framed, inputStyles.multiline, className),
    style: {
      ...controlStyle(),
      ...controlWidthStyle(width),
      '--ui-mention-icon-size': iconSize,
      ...textareaStyle,
      ...style,
    } as CSSProperties,
  });

  return (
    <>
      <textarea
        {...rest}
        {...shared}
        ref={elementRef}
        data-oi-control="input"
        data-state="framed"
        rows={typeof autoSize === 'object' ? autoSize.minRows : undefined}
        onChange={(event) => {
          setInternal(event.target.value);
          onChange?.(event.target.value);
          apply(event.target.value, event.target.selectionStart);
        }}
        onInput={onInput}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={((event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (open && visible.length > 0) {
            if (event.key === 'ArrowDown') { event.preventDefault(); setLead((index) => Math.min(visible.length - 1, index + 1)); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); setLead((index) => Math.max(0, index - 1)); return; }
            if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); if (visible[lead]) insert(visible[lead]!); return; }
            if (event.key === 'Escape') { event.preventDefault(); close(); return; }
          }
          onKeyDown?.(event);
        }) as KeyboardEventHandler<HTMLTextAreaElement>}
        onBlur={onBlur}
        onSelect={(event) => apply(event.currentTarget.value, event.currentTarget.selectionStart)}
      />
      <Popup
        open={open}
        anchorRef={elementRef}
        onClose={close}
        className={selectStyles.popup ?? ''}
        control="mentions-popup"
        label={String(rest['aria-label'] ?? 'Gợi ý nhắc đến')}
      >
        <div className={selectStyles.popupInner}>
          <div
            className={classNames(selectStyles.list, listStyles.list)}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={visible.length ? `${idBase}-mention-${lead}` : undefined}
          >
            <div className={listStyles.sizer} style={{ height: visible.length * 24 }}>
              {visible.map((option, index) => (
                <div
                  key={`${option.key ?? String(option.value)}-${index}`}
                  id={`${idBase}-mention-${index}`}
                  role="option"
                  aria-selected={index === lead}
                  data-lead={index === lead || undefined}
                  data-oi-control="list-row"
                  className={classNames(listStyles.row, index === lead && listStyles.active)}
                  style={{ transform: `translateY(${index * 24}px)`, height: 24 }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => insert(option)}
                >
                  <span className={selectStyles.optionLabel}>{mentionLabel(option)}</span>
                </div>
              ))}
            </div>
          </div>
          {visible.length === 0 ? <div className={listStyles.emptyWrap}>{notFoundContent ?? null}</div> : null}
        </div>
      </Popup>
    </>
  );
});

function withoutUndefinedProps<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
