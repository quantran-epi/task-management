import type { SelectProps as AntSelectProps } from 'antd';
import type { BaseOptionType, DefaultOptionType } from 'antd/es/select';
import {
  useEffect,
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
import listStyles from './openidea/List.module.css';
import selectStyles from './openidea/Select.module.css';
import { getSharedControlTokens, withoutUndefined, type ControlSize } from './tokens.contract';
import { controlStyle, controlWidthStyle, type InputWidth } from './input';

export interface SelectProps<
  ValueType = unknown,
  OptionType extends BaseOptionType = DefaultOptionType,
> extends AntSelectProps<ValueType, OptionType> {
  width?: InputWidth;
  size?: ControlSize;
}

type Option = { value?: unknown; label?: ReactNode; disabled?: boolean; [key: string]: unknown };

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={selectStyles.check}>
      <path d="M2.5 8.25L6 11.75L13.5 4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={selectStyles.chevron}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function labelOf(option: Option): ReactNode {
  if (option.label !== undefined && option.label !== null) return option.label;
  if (typeof option.title === 'string') return option.title;
  if (option.value === undefined || option.value === null) return null;
  return String(option.value);
}

function valueKey(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const keyed = value as { value?: unknown; key?: unknown };
    if (keyed.value !== undefined || keyed.key !== undefined) {
      return String(keyed.value ?? keyed.key);
    }
  }
  return JSON.stringify(value ?? null);
}

/** AntD's second onChange argument is the full option (label + value + raw props). */
function toOption(option: Option): Option {
  return { ...option, label: labelOf(option) };
}

/** Native S-SEL trigger + BODY portal listbox; AntD prop types stay unchanged. */
export function Select<
  ValueType = unknown,
  OptionType extends BaseOptionType = DefaultOptionType,
>({ width = 'full', allowClear=true, status, style, className, ...rest }: SelectProps<ValueType, OptionType>) {
  void getSharedControlTokens();
  const idBase = useId();
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState(0);
  const [query, setQuery] = useState('');
  const [innerValue, setInnerValue] = useState<unknown>(rest.defaultValue);

  const mode = rest.mode;
  const multiple = mode === 'multiple' || mode === 'tags';
  const controlled = rest.value !== undefined;
  const current = controlled ? rest.value : innerValue;
  // Depend on a primitive snapshot, not a fresh Set: setLead rerenders must not
  // reset the keyboard lead back to the selected option (UI-SPEC §7.1 / §9).
  const selectedValueKey = multiple
    ? JSON.stringify(Array.isArray(current) ? (current as unknown[]).map(valueKey) : [])
    : (current === undefined || current === null ? '' : valueKey(current));
  // `current` can be a fresh array each render; selectedValueKey is its stable snapshot.
  const selectedKeys = useMemo(() => multiple
    ? new Set(Array.isArray(current) ? (current as unknown[]).map(valueKey) : [])
    : new Set(current === undefined || current === null ? [] : [valueKey(current)]),
  [multiple, selectedValueKey]);
  const disabled = rest.disabled === true || rest.loading === true;
  const invalid = status === 'error' || rest['aria-invalid'] === true;

  const allOptions = useMemo<Option[]>(() => {
    if (Array.isArray(rest.options)) return rest.options as Option[];
    const flattened: Option[] = [];
    const visit = (node: ReactNode) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node === null || typeof node !== 'object') return;
      const element = node as { type?: unknown; props?: { value?: unknown; children?: ReactNode; options?: Option[] } };
      if (element.props?.options) { flattened.push(...element.props.options); return; }
      if (element.props && 'value' in element.props) flattened.push(element.props as Option);
    };
    visit(rest.children);
    return flattened;
  }, [rest.options, rest.children]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return allOptions;
    const filter = rest.filterOption;
    if (filter === false) return allOptions;
    if (typeof filter === 'function') {
      return allOptions.filter((option) => filter(text, option as OptionType));
    }
    const field = rest.optionFilterProp;
    return allOptions.filter((option) => {
      const source = typeof field === 'string' ? option[field] : labelOf(option);
      return String(source ?? '').toLowerCase().includes(text);
    });
  }, [allOptions, query, rest.filterOption, rest.optionFilterProp]);

  useEffect(() => {
    if (!open) return;
    const index = filtered.findIndex((option) => selectedKeys.has(valueKey(option.value)));
    setLead(index >= 0 ? index : 0);
  }, [open, filtered, selectedKeys]);

  function close(focusTrigger = true) {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
    rest.onOpenChange?.(false);
  }

  function openList() {
    if (disabled) return;
    setOpen(true);
    rest.onOpenChange?.(true);
  }

  function emit(next: unknown, option: Option | Option[]) {
    if (!controlled) setInnerValue(next);
    if (multiple) {
      (rest.onChange as ((value: unknown, options: Option[]) => void) | undefined)?.(
        next,
        (option as Option[]).map(toOption),
      );
    } else {
      (rest.onChange as ((value: unknown, option: Option) => void) | undefined)?.(next, toOption(option as Option));
    }
  }

  function selectOption(option: Option, remove = false) {
    if (option.disabled === true) return;
    const raw = option.value;
    (rest.onSelect as ((value: unknown, option: Option) => void) | undefined)?.(raw, toOption(option));
    if (multiple) {
      const list = Array.isArray(current) ? (current as unknown[]).slice() : [];
      const key = valueKey(raw);
      const next = remove || list.some((item) => valueKey(item) === key)
        ? list.filter((item) => valueKey(item) !== key)
        : [...list, raw];
      const chosen = next.map((value) => allOptions.find((item) => valueKey(item.value) === valueKey(value)) ?? { value, label: String(value) });
      emit(next, chosen);
      setQuery('');
      return;
    }
    emit(raw, option);
    close();
  }

  function addToken(raw: string) {
    const value = raw.trim();
    if (!value || mode !== 'tags') return;
    if (!Array.isArray(current) || !(current as unknown[]).some((item) => valueKey(item) === value)) {
      const next = [...(Array.isArray(current) ? (current as unknown[]) : []), value];
      emit(next, next.map((item) => allOptions.find((option) => valueKey(option.value) === valueKey(item)) ?? { value: item, label: String(item) }));
    }
    setQuery('');
  }

  function handleListKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setLead((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setLead((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = filtered[lead] ?? filtered[0];
      if (option) selectOption(option);
    }
  }

  const clearButton = allowClear && !disabled && selectedKeys.size > 0 ? (
    <button
      type="button"
      aria-label="Xóa lựa chọn"
      className={classNames(selectStyles.rowAction)}
      onClick={(event) => {
        event.stopPropagation();
        emit(multiple ? [] : null, multiple ? [] : {});
        close(false);
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  ) : null;

  const selectedOptions: Option[] = multiple && Array.isArray(current)
    ? (current as unknown[]).map((value) => {
        const found = allOptions.find((option) => valueKey(option.value) === valueKey(value));
        return found ?? { value, label: String(value) };
      })
    : [];
  const tagLimit = typeof rest.maxTagCount === 'number' ? rest.maxTagCount : 3;
  const visibleTags = selectedOptions.slice(0, tagLimit);
  const hiddenTags = selectedOptions.length - visibleTags.length;
  const searchable = mode !== undefined || rest.showSearch === true;

  const renderedStyle = { ...controlStyle(), ...controlWidthStyle(width), ...style } as CSSProperties;
  const triggerClasses = classNames(selectStyles.trigger, selectStyles.framed, invalid && selectStyles.invalid, className);
  const sharedTrigger = withoutUndefined({
    'aria-label': rest['aria-label'],
    'aria-invalid': invalid || undefined,
    'aria-haspopup': 'listbox' as const,
    'aria-expanded': open,
    'aria-controls': `${idBase}-list`,
    disabled,
    style: renderedStyle,
    className: triggerClasses,
  });

  return (
    <>
      <button
        {...sharedTrigger}
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        data-oi-control="select"
        data-state={invalid ? 'invalid' : 'framed'}
        hidden={searchable}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
        onBlur={rest.onBlur as unknown as (event: React.FocusEvent<HTMLButtonElement>) => void}
      >
        <span className={rest.placeholder && selectedKeys.size === 0 ? classNames(selectStyles.value, selectStyles.placeholder) : selectStyles.value}>
          {selectedKeys.size === 0
            ? rest.placeholder ?? null
            : multiple
              ? `${selectedKeys.size} mục`
              : labelOf(allOptions.find((option) => selectedKeys.has(valueKey(option.value))) ?? { value: current })}
        </span>
        {clearButton}
        <Chevron />
      </button>

      {searchable ? (
        <span
          {...sharedTrigger}
          ref={triggerRef as React.RefObject<HTMLInputElement>}
          data-oi-control="select"
          data-state={invalid ? 'invalid' : 'framed'}
          onClick={openList}
        >
          {visibleTags.map((option, index) => {
            const label = labelOf(option);
            return (
              <span key={`${valueKey(option.value)}-${index}`} className={selectStyles.option}>
                {rest.tagRender
                  ? rest.tagRender({ ...toOption(option), value: option.value as never, closable: !disabled, onClose: () => selectOption(option, true) } as never)
                  : <span className={selectStyles.value}>{label}</span>}
              </span>
            );
          })}
          {hiddenTags > 0 ? <span className={selectStyles.value}>+{hiddenTags}</span> : null}
          <input
            ref={searchRef}
            value={query}
            placeholder={selectedKeys.size === 0 ? (rest.placeholder as string | undefined) : undefined}
            disabled={disabled}
            aria-label={rest['aria-label']}
            aria-expanded={open}
            aria-controls={`${idBase}-list`}
            aria-activedescendant={open ? `${idBase}-opt-${lead}` : undefined}
            className={selectStyles.searchInput}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(event) => {
              setQuery(event.target.value);
              rest.onSearch?.(event.target.value);
            }}
            onKeyDown={(event) => {
              const tokenSeparators = rest.tokenSeparators as string[] | string | undefined;
              const separators = Array.isArray(tokenSeparators) ? tokenSeparators : tokenSeparators ? [tokenSeparators] : [];
              if (separators.includes(event.key)) {
                event.preventDefault();
                addToken(query);
                return;
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                openList();
                setLead((index) => event.key === 'ArrowDown' ? Math.min(filtered.length - 1, index + 1) : Math.max(0, index - 1));
                return;
              }
              if (event.key === 'Enter' && open) {
                event.preventDefault();
                const option = filtered[lead] ?? filtered[0];
                if (option) selectOption(option);
              }
              if (event.key === 'Escape' && open) close();
            }}
          />
          {clearButton}
          <Chevron />
        </span>
      ) : null}

      <Popup open={open} anchorRef={triggerRef} onClose={() => close()} className={selectStyles.popup ?? ''} control="select-popup" label={String(rest['aria-label'] ?? rest.placeholder ?? 'Tùy chọn')}>
        <div className={selectStyles.popupInner}>
          <div
            ref={listRef}
            id={`${idBase}-list`}
            className={classNames(selectStyles.list, listStyles.list)}
            role="listbox"
            tabIndex={0}
            aria-label={String(rest['aria-label'] ?? rest.placeholder ?? 'Tùy chọn')}
            aria-activedescendant={`${idBase}-opt-${lead}`}
            onKeyDown={handleListKey as KeyboardEventHandler<HTMLDivElement>}
          >
            <div className={listStyles.sizer} style={{ height: filtered.length * 24 }}>
              {filtered.map((option, index) => {
                const selected = selectedKeys.has(valueKey(option.value));
                return (
                  <div
                    key={`${valueKey(option.value)}-${index}`}
                    id={`${idBase}-opt-${index}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled === true || undefined}
                    data-lead={index === lead || undefined}
                    data-oi-control="list-row"
                    className={classNames(listStyles.row, (selected || index === lead) && listStyles.active)}
                    style={{ transform: `translateY(${index * 24}px)`, height: 24 }}
                    onPointerMove={() => setLead(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span className={selectStyles.check}>{selected ? <CheckIcon /> : null}</span>
                    <span className={selectStyles.optionLabel}>{labelOf(option)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {filtered.length === 0 ? <div className={listStyles.emptyWrap}>{rest.notFoundContent ?? 'Không có kết quả'}</div> : null}
        </div>
      </Popup>
    </>
  );
}
