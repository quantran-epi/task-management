import type { AutoCompleteProps as AntAutoCompleteProps } from 'antd';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import { Popup } from './native/popup';
import inputStyles from './openidea/Input.module.css';
import listStyles from './openidea/List.module.css';
import selectStyles from './openidea/Select.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type AutoCompleteProps<ValueType = any> = AntAutoCompleteProps<ValueType>;

interface OptionShape {
  value?: unknown;
  label?: ReactNode;
  disabled?: boolean;
  [key: string]: unknown;
}

interface OptionElementProps {
  value?: unknown;
  label?: ReactNode;
  children?: ReactNode;
  options?: OptionShape[];
  disabled?: boolean;
}

/** Self-built static option; callers can use children or the `options` prop. */
export function AutoCompleteOption(_props: OptionElementProps) {
  return null;
}

function keyOf(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** Native combobox with 24px list rows, keyboard lead and AntD onChange/onSelect payloads. */
export function AutoComplete<ValueType = any>({ styles, ...rest }: AutoCompleteProps<ValueType>) {
  const { controlHeight, fontSize, borderRadius } = getSharedControlTokens();
  void getSharedControlTokens;
  const idBase = useId();
  const anchorRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(rest.value === undefined ? '' : String(rest.value ?? ''));
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState(0);
  // Keep a local draft even when controlled: callers need to type custom values
  // (e.g. model names) while `value` tracks only committed selection.
  const current = query;

  useEffect(() => {
    setQuery(rest.value === undefined ? '' : String(rest.value ?? ''));
  }, [rest.value]);

  const declared = Array.isArray(rest.options) ? rest.options as OptionShape[] : undefined;
  const fromChildren: OptionShape[] = [];
  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node === null || typeof node !== 'object' || !('props' in node)) return;
    const element = node as { props?: OptionElementProps };
    if (!element.props) return;
    if (Array.isArray(element.props.options)) { fromChildren.push(...element.props.options); return; }
    if ('value' in element.props) {
      fromChildren.push({ ...element.props, label: element.props.children ?? element.props.label });
    }
  };
  visit(rest.children);
  const allOptions = declared ?? fromChildren;
  const filter = rest.filterOption;
  const visible = filter === false ? allOptions
    : typeof filter === 'function'
      ? allOptions.filter((option) => filter(current, option as never))
      : allOptions.filter((option) => String(option.label ?? option.value ?? '').toLowerCase().includes(current.toLowerCase()));

  function commit(option: OptionShape) {
    const value = (option.value ?? option.label ?? '') as ValueType;
    setQuery(String(value ?? ''));
    (rest.onChange as ((value: ValueType, option: OptionShape) => void) | undefined)?.(value, option);
    (rest.onSelect as ((value: ValueType, option: OptionShape) => void) | undefined)?.(value, option);
    setOpen(false);
    anchorRef.current?.focus();
  }

  const rootStyle = {
    '--ui-autocomplete-height': `${controlHeight}px`,
    '--ui-autocomplete-font-size': `${fontSize}px`,
    '--ui-autocomplete-radius': `${borderRadius}px`,
    ...(styles && typeof styles === 'object' && 'root' in styles ? styles.root : undefined),
  } as CSSProperties;

  return (
    <>
      <input
        ref={anchorRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${idBase}-list`}
        aria-activedescendant={open ? `${idBase}-opt-${lead}` : undefined}
        aria-label={rest['aria-label'] as string | undefined}
        placeholder={rest.placeholder as string | undefined}
        disabled={rest.disabled === true}
        className={classNames(inputStyles.input, inputStyles.framed)}
        style={rootStyle}
        data-oi-control="auto-complete"
        data-state={open ? 'expanded' : 'collapsed'}
        value={current}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setLead(0);
          setOpen(true);
          (rest.onChange as ((value: ValueType, option: OptionShape) => void) | undefined)?.(value as ValueType, { value });
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setLead((index) => event.key === 'ArrowDown'
              ? Math.min(visible.length - 1, index + 1)
              : Math.max(0, index - 1));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            const option = visible[lead] ?? visible[0];
            if (option) commit(option);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      <Popup
        open={open && visible.length > 0 && rest.disabled !== true}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        className={selectStyles.popup ?? ''}
        control="auto-complete-popup"
        label="Gợi ý"
      >
        <div className={selectStyles.popupInner}>
          <div
            id={`${idBase}-list`}
            className={classNames(selectStyles.list, listStyles.list)}
            role="listbox"
            aria-activedescendant={`${idBase}-opt-${lead}`}
          >
            <div className={listStyles.sizer} style={{ height: visible.length * 24 }}>
              {visible.map((option, index) => (
                <div
                  key={`${keyOf(option.value)}-${index}`}
                  id={`${idBase}-opt-${index}`}
                  role="option"
                  aria-selected={keyOf(option.value) === current}
                  aria-disabled={option.disabled === true || undefined}
                  data-lead={index === lead || undefined}
                  data-oi-control="list-row"
                  className={classNames(listStyles.row, (index === lead || keyOf(option.value) === current) && listStyles.active)}
                  style={{ transform: `translateY(${index * 24}px)`, height: 24 }}
                  onPointerMove={() => setLead(index)}
                  onClick={() => { if (option.disabled !== true) commit(option); }}
                >
                  <span className={selectStyles.optionLabel}>{option.label ?? String(option.value ?? '')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Popup>
    </>
  );
}
