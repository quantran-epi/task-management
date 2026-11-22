import type {
  FormInstance as AntFormInstance,
  FormItemProps as AntFormItemProps,
  FormProps as AntFormProps,
} from 'antd';
import type {
  ErrorListProps as AntErrorListProps,
  FormListProps as AntFormListProps,
  Rule as AntRule,
} from 'antd/es/form';
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import inputStyles from './openidea/Input.module.css';
import { getSharedControlTokens } from './tokens.contract';

/** Label placement policy; AntD-compatible plus a compact default. */
export type FormLabelPolicy = 'top' | 'left' | 'inline';

export interface FormProps extends AntFormProps {
  labelPolicy?: FormLabelPolicy;
  children?: ReactNode;
}

type NamePath = Parameters<AntFormInstance['getFieldValue']>[0];
type Path = Array<string | number>;
type Layout = 'horizontal' | 'inline' | 'vertical';

interface FieldConfig {
  rules: AntRule[];
  initialValue: unknown;
  valuePropName: string;
  trigger: string;
  dependencies: NamePath[];
}

interface FieldDataLike {
  name: NamePath;
  value?: unknown;
  errors?: ReactNode[];
}

type FinishHandler = (values: Record<string, unknown>) => void;
type FinishFailedHandler = (info: {
  values: Record<string, unknown>;
  errorFields: Array<{ name: Path; errors: string[] }>;
  outOfDate: boolean;
}) => void;
type ValuesChangeHandler = (changed: Record<string, unknown>, all: Record<string, unknown>) => void;

interface Callbacks {
  onFinish: FinishHandler | undefined;
  onFinishFailed: FinishFailedHandler | undefined;
  onValuesChange: ValuesChangeHandler | undefined;
}

/** Eight caller methods plus the subscribe primitive used by useWatch/FormItem. */
interface NativeFormMethods<Values = any> {
  getFieldValue: AntFormInstance<Values>['getFieldValue'];
  getFieldsValue: AntFormInstance<Values>['getFieldsValue'];
  setFieldValue: AntFormInstance<Values>['setFieldValue'];
  setFieldsValue: AntFormInstance<Values>['setFieldsValue'];
  setFields: AntFormInstance<Values>['setFields'];
  validateFields: AntFormInstance<Values>['validateFields'];
  resetFields: AntFormInstance<Values>['resetFields'];
  submit: AntFormInstance<Values>['submit'];
  getFieldError: AntFormInstance<Values>['getFieldError'];
  getFieldsError: AntFormInstance<Values>['getFieldsError'];
  isFieldTouched: AntFormInstance<Values>['isFieldTouched'];
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  readErrors: (name: NamePath) => ReactNode[];
  registerField: (key: string, getter: () => FieldConfig) => () => void;
  setInitialValues: (values: Record<string, unknown>, init: boolean) => void;
  validateOne: (name: NamePath) => Promise<ReactNode[]>;
  getFieldInstance: (name: NamePath) => unknown;
  scrollToField: (name: NamePath, options?: unknown) => void;
  focusField: (name: NamePath) => void;
  callbacks: Callbacks;
}

/** Structural alias keeps the public AntD-compatible type while the runtime is native. */
export type FormInstance<Values = any> = AntFormInstance<Values> & NativeFormMethods<Values>;

function pathOf(name: NamePath | undefined): Path {
  if (name === undefined || name === null) return [];
  return Array.isArray(name) ? (name as Path) : [name as string | number];
}

function keyOf(path: Path): string {
  return JSON.stringify(path);
}

function getIn(source: unknown, path: Path): unknown {
  let current: unknown = source;
  for (const part of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

function setIn(source: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...tail] = path;
  const base: unknown[] | Record<string | number, unknown> =
    source !== null && typeof source === 'object'
      ? (Array.isArray(source) ? [...source] : { ...(source as Record<string, unknown>) })
      : (typeof tail[0] === 'number' ? [] : {});
  (base as Record<string | number, unknown>)[head!] = tail.length === 0
    ? value
    : setIn((base as Record<string | number, unknown>)[head!], tail, value);
  return base;
}

function deleteIn(source: unknown, path: Path): unknown {
  if (path.length === 0 || source === null || typeof source !== 'object') return source;
  const [head, ...tail] = path;
  const base: unknown[] | Record<string | number, unknown> =
    Array.isArray(source) ? [...source] : { ...(source as Record<string, unknown>) };
  if (tail.length === 0) {
    if (Array.isArray(base)) base.splice(Number(head), 1);
    else delete (base as Record<string, unknown>)[String(head)];
  } else {
    (base as Record<string | number, unknown>)[head!] = deleteIn(
      (base as Record<string | number, unknown>)[head!],
      tail,
    );
  }
  return base;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

function ruleMessage(rule: AntRule, fallback: string): ReactNode {
  if (rule && typeof rule === 'object' && 'message' in rule && rule.message !== undefined) {
    return rule.message as ReactNode;
  }
  return fallback;
}

function asRuleObject(rule: AntRule, form: FormInstance): Record<string, unknown> | null {
  if (typeof rule === 'function') return rule(form) as Record<string, unknown>;
  return rule && typeof rule === 'object' ? (rule as Record<string, unknown>) : null;
}

function changeValue(args: unknown[], valuePropName: string): unknown {
  const first = args[0];
  if (valuePropName === 'checked') {
    if (typeof first === 'boolean') return first;
    const target = (first as { target?: { checked?: unknown } } | null)?.target;
    if (target && typeof target.checked === 'boolean') return target.checked;
  }
  const target = (first as { target?: { value?: unknown; checked?: unknown } } | null)?.target;
  if (target && 'value' in target) return target.value;
  if (target && 'checked' in target) return target.checked;
  return first;
}

function createFormInstance(): FormInstance {
  let values: Record<string, unknown> = {};
  let initialValues: Record<string, unknown> = {};
  let version = 0;
  const errors = new Map<string, ReactNode[]>();
  const fields = new Map<string, () => FieldConfig>();
  const listeners = new Set<() => void>();
  const callbacks: Callbacks = { onFinish: undefined, onFinishFailed: undefined, onValuesChange: undefined };

  const store: NativeFormMethods = {
    callbacks,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
    getFieldValue(name) {
      const path = pathOf(name as NamePath);
      return path.length === 0 ? values : getIn(values, path);
    },
    getFieldsValue(...args: unknown[]) {
      const [arg] = args;
      if (Array.isArray(arg)) {
        const picked: Record<string, unknown> = {};
        for (const name of arg) {
          const path = pathOf(name as NamePath);
          if (path.length > 0) (picked as Record<string, unknown>)[String(path[0])] = getIn(values, path);
        }
        return picked;
      }
      return values;
    },
    setFieldValue(name, value) {
      const path = pathOf(name as NamePath);
      if (path.length === 0) return;
      values = setIn(values, path, value) as Record<string, unknown>;
      version += 1;
      listeners.forEach((listener) => listener());
      callbacks.onValuesChange?.({ [String(path[0])]: value }, values);
    },
    setFieldsValue(next) {
      let changed = values;
      for (const [key, value] of Object.entries(next ?? {})) {
        changed = setIn(changed, [key], value) as Record<string, unknown>;
      }
      values = changed;
      version += 1;
      listeners.forEach((listener) => listener());
      callbacks.onValuesChange?.(next, values);
    },
    setFields(fieldsToSet) {
      for (const field of fieldsToSet as FieldDataLike[]) {
        const key = keyOf(pathOf(field.name));
        if (field.errors !== undefined) errors.set(key, field.errors);
        if (field.value !== undefined) values = setIn(values, pathOf(field.name), field.value) as Record<string, unknown>;
      }
      version += 1;
      listeners.forEach((listener) => listener());
    },
    resetFields(names) {
      const targets = names === undefined
        ? [...new Set([...fields.keys(), ...Object.keys(initialValues).map((key) => keyOf([key]))])].map((key) => JSON.parse(key) as Path)
        : names.map((name) => pathOf(name as NamePath));
      for (const path of targets) {
        const key = keyOf(path);
        const initial = getIn(initialValues, path);
        values = initial === undefined
          ? deleteIn(values, path) as Record<string, unknown>
          : setIn(values, path, initial) as Record<string, unknown>;
        errors.delete(key);
      }
      version += 1;
      listeners.forEach((listener) => listener());
    },
    getFieldError(name) {
      return (store.readErrors(name) as string[]);
    },
    getFieldsError(nameList) {
      const paths = nameList === undefined
        ? [...fields.keys()].map((key) => JSON.parse(key) as Path)
        : nameList.map((name) => pathOf(name as NamePath));
      return paths.map((path) => ({ name: path, errors: store.readErrors(path) as string[], warnings: [] }));
    },
    isFieldTouched(name) {
      return errors.has(keyOf(pathOf(name as NamePath)));
    },
    readErrors(name) {
      return errors.get(keyOf(pathOf(name as NamePath))) ?? [];
    },
    registerField(key, getter) {
      fields.set(key, getter);
      const config = getter();
      if (config.initialValue !== undefined && getIn(values, JSON.parse(key) as Path) === undefined) {
        values = setIn(values, JSON.parse(key) as Path, config.initialValue) as Record<string, unknown>;
        version += 1;
        listeners.forEach((listener) => listener());
      }
      return () => { fields.delete(key); };
    },
    setInitialValues(next, init) {
      initialValues = { ...initialValues, ...next };
      if (!init) return;
      for (const key of Object.keys(next)) {
        if (getIn(values, [key]) === undefined && next[key] !== undefined) {
          values = setIn(values, [key], next[key]) as Record<string, unknown>;
        }
      }
      version += 1;
      listeners.forEach((listener) => listener());
    },
    async validateOne(name) {
      const path = pathOf(name as NamePath);
      const config = fields.get(keyOf(path))?.();
      const value = getIn(values, path);
      const messages: ReactNode[] = [];
      for (const rawRule of config?.rules ?? []) {
        const rule = asRuleObject(rawRule, formInstance);
        if (!rule) continue;
        if (rule.required === true && isEmpty(value)) {
          messages.push(ruleMessage(rawRule, 'Trường này là bắt buộc'));
          continue;
        }
        if (rule.pattern instanceof RegExp && !isEmpty(value) && !rule.pattern.test(String(value))) {
          messages.push(ruleMessage(rawRule, 'Giá trị không hợp lệ'));
          continue;
        }
        if (typeof rule.min === 'number' && !isEmpty(value) && Number(value) < rule.min) {
          messages.push(ruleMessage(rawRule, `Giá trị phải lớn hơn hoặc bằng ${rule.min}`));
          continue;
        }
        if (typeof rule.max === 'number' && !isEmpty(value) && Number(value) > rule.max) {
          messages.push(ruleMessage(rawRule, `Giá trị phải nhỏ hơn hoặc bằng ${rule.max}`));
          continue;
        }
        if (typeof rule.len === 'number' && !isEmpty(value) && String(value).length !== rule.len) {
          messages.push(ruleMessage(rawRule, `Giá trị phải có độ dài ${rule.len}`));
          continue;
        }
        if (typeof rule.validator === 'function') {
          try {
            await (rule.validator as (r: unknown, v: unknown, cb: (error?: string) => void) => unknown)(
              rule,
              value,
              (error?: string) => { if (error) messages.push(error); },
            );
          } catch (error: unknown) {
            messages.push(error instanceof Error ? error.message : String(error ?? 'Giá trị không hợp lệ'));
          }
        }
      }
      errors.set(keyOf(path), messages);
      return messages;
    },
    async validateFields(names) {
      const list = Array.isArray(names) ? names : undefined;
      const paths = list === undefined
        ? [...fields.keys()].map((key) => JSON.parse(key) as Path)
        : list.map((name) => pathOf(name as NamePath));
      const errorFields: Array<{ name: Path; errors: string[] }> = [];
      for (const path of paths) {
        const messages = await store.validateOne(path);
        if (messages.length > 0) {
          errorFields.push({
            name: path,
            errors: messages.map((message) => (typeof message === 'string' ? message : String(message ?? ''))),
          });
        }
      }
      version += 1;
      listeners.forEach((listener) => listener());
      if (errorFields.length > 0) {
        const error = new Error('Validation failed') as Error & {
          errorFields: typeof errorFields;
          values: Record<string, unknown>;
          outOfDate: boolean;
        };
        error.errorFields = errorFields;
        error.values = values;
        error.outOfDate = false;
        throw error;
      }
      return values;
    },
    submit() {
      void store.validateFields().then(
        (nextValues) => callbacks.onFinish?.(nextValues),
        (error: unknown) => {
          if (error && typeof error === 'object' && 'errorFields' in error) {
            const info = error as {
              values: Record<string, unknown>;
              errorFields: Array<{ name: Path; errors: string[] }>;
              outOfDate: boolean;
            };
            callbacks.onFinishFailed?.({ values: info.values, errorFields: info.errorFields, outOfDate: false });
          }
        },
      );
    },
    getFieldInstance: (_name: NamePath) => undefined,
    scrollToField: () => {},
    focusField: () => {},
  };

  const formInstance = store as unknown as FormInstance;
  return formInstance;
}

const DETACHED_FORM = createFormInstance();
const NOOP_SUBSCRIBE = () => () => {};
const ZERO = () => 0;

interface FormContextValue {
  form: FormInstance;
  layout: Layout;
  requiredMark: AntFormProps['requiredMark'];
}

const FormContext = createContext<FormContextValue | null>(null);

function useFormVersion(form: FormInstance): number {
  return useSyncExternalStore(form.subscribe, form.getVersion, form.getVersion);
}

const FORM_DOM_KEYS = new Set([
  'id', 'name', 'action', 'method', 'target', 'encType', 'autoComplete', 'noValidate',
  'acceptCharset', 'dir', 'lang', 'title', 'tabIndex', 'hidden', 'onSubmit', 'onReset',
  'onKeyDown', 'onKeyUp', 'onFocus', 'onBlur', 'onClick', 'onChange', 'onInput', 'role',
]);

function domOnly(source: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && (FORM_DOM_KEYS.has(key) || key.startsWith('data-') || key.startsWith('aria-'))) {
      result[key] = value;
    }
  }
  return result;
}

/** Label/validation metrics from the shared contract, exposed as custom properties. */
export function formStyle(): CSSProperties {
  const { fontSize, controlHeight } = getSharedControlTokens();
  return {
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
  } as CSSProperties;
}

/** Native form field store with AntD-shaped callbacks and layout policy. */
export function Form({
  labelPolicy = 'top',
  style,
  form: formProp,
  layout,
  requiredMark,
  initialValues,
  onFinish,
  onFinishFailed,
  onValuesChange,
  preserve,
  disabled,
  className,
  children,
  ...rest
}: FormProps) {
  void preserve;
  void disabled;
  const [innerForm] = useForm();
  const form: FormInstance = (formProp ?? innerForm) as FormInstance;
  const policyLayout: Layout = labelPolicy === 'inline' ? 'inline' : labelPolicy === 'left' ? 'horizontal' : 'vertical';
  const mergedLayout = layout ?? policyLayout;
  const mergedRequiredMark = requiredMark ?? true;
  const initialReady = useRef(false);

  form.callbacks.onFinish = onFinish as FinishHandler | undefined;
  form.callbacks.onFinishFailed = onFinishFailed as FinishFailedHandler | undefined;
  form.callbacks.onValuesChange = onValuesChange as ValuesChangeHandler | undefined;

  useEffect(() => {
    form.setInitialValues(initialValues ?? {}, !initialReady.current);
    initialReady.current = true;
  }, [form, initialValues]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    (domOnly(rest).onSubmit as ((event: FormEvent<HTMLFormElement>) => void) | undefined)?.(event);
    event.preventDefault();
    form.submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    (domOnly(rest).onKeyDown as ((event: KeyboardEvent<HTMLFormElement>) => void) | undefined)?.(event);
    if (event.key === 'Enter' && !event.defaultPrevented && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      form.submit();
    }
  };

  return (
    <FormContext.Provider value={{ form, layout: mergedLayout, requiredMark: mergedRequiredMark }}>
      <form
        {...domOnly(rest)}
        noValidate
        className={classNames(inputStyles.framed, className)}
        data-oi-control="form"
        data-state={mergedLayout}
        data-required-mark={mergedRequiredMark === true ? 'true' : 'false'}
        style={{ ...formStyle(), border: 0, boxShadow: 'none', ...style } as CSSProperties}
        onSubmit={submit}
        onKeyDown={onKeyDown}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

/** Stable instance: one store per hook, optional caller-provided instance wins. */
export function useForm<Values = any>(form?: FormInstance<Values>): [FormInstance<Values>] {
  const ref = useRef<FormInstance<Values> | null>(null);
  if (ref.current === null) ref.current = form ?? (createFormInstance() as FormInstance<Values>);
  return [ref.current];
}

/** Subscribe to one field (or the whole store) without caller re-render plumbing. */
export const useWatch = function useWatch<Values = any>(name?: NamePath, form?: FormInstance<Values>): any {
  const context = useContext(FormContext);
  const target: FormInstance | undefined = (form ?? context?.form) as FormInstance | undefined;
  void useSyncExternalStore(
    target?.subscribe ?? NOOP_SUBSCRIBE,
    target?.getVersion ?? ZERO,
    target?.getVersion ?? ZERO,
  );
  if (!target) return undefined;
  if (name === undefined) return target.getFieldsValue();
  return target.getFieldValue(name as Parameters<AntFormInstance['getFieldValue']>[0]);
};

function markFor(label: ReactNode, required: boolean, policy: AntFormProps['requiredMark']): ReactNode {
  if (typeof policy === 'function') return policy(label, { required });
  if (policy === true && required) {
    return <>{label}<span aria-hidden="true" style={{ color: 'var(--danger-control)' }}> *</span></>;
  }
  if (policy === 'optional' && !required) {
    return <>{label}<span style={{ color: 'var(--fg-muted)' }}> (optional)</span></>;
  }
  return label;
}

function enhanceChild(
  child: ReactNode,
  value: unknown,
  errors: ReactNode[],
  config: FieldConfig,
  id: string,
  onChange: (...args: unknown[]) => void,
): ReactNode {
  if (!isValidElement(child)) return child;
  const element = child as ReactElement<Record<string, unknown>>;
  const existing = element.props;
  const trigger = config.trigger || 'onChange';
  const original = existing[trigger];
  const injected: Record<string, unknown> = {
    [config.valuePropName || 'value']: value,
    [trigger]: (...args: unknown[]) => {
      if (typeof original === 'function') (original as (...a: unknown[]) => void)(...args);
      onChange(...args);
    },
    'aria-invalid': errors.length > 0 ? true : existing['aria-invalid'],
    id: existing.id ?? id,
  };
  return cloneElement(element, injected);
}

/** Native Form.Item: registers a field, injects value/onChange and renders errors. */
export function FormItem({
  name,
  label,
  rules,
  initialValue,
  valuePropName = 'value',
  trigger = 'onChange',
  dependencies,
  noStyle,
  hidden,
  style,
  className,
  extra,
  help,
  required,
  shouldUpdate,
  children,
  ...rest
}: AntFormItemProps) {
  void rest;
  const context = useContext(FormContext);
  const form = context?.form ?? DETACHED_FORM;
  const generatedId = useId();
  const version = useFormVersion(form);
  void version;
  const path = pathOf(name as NamePath | undefined);
  const key = keyOf(path);
  const configRef = useRef<FieldConfig>({
    rules: [],
    initialValue: undefined,
    valuePropName: 'value',
    trigger: 'onChange',
    dependencies: [],
  });
  configRef.current = {
    rules: (rules ?? []) as AntRule[],
    initialValue,
    valuePropName,
    trigger: Array.isArray(trigger) ? String(trigger[0] ?? 'onChange') : String(trigger),
    dependencies: dependencies ?? [],
  };
  const configGetterRef = useRef(() => configRef.current);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (key === '[]') return;
    return form.registerField(key, configGetterRef.current);
  }, [form, key]);

  const previousValues = useRef<Record<string, unknown>>(form.getFieldsValue() as Record<string, unknown>);
  const currentValues = form.getFieldsValue() as Record<string, unknown>;
  let shouldRender = true;
  if (shouldUpdate !== undefined) {
    shouldRender = shouldUpdate === true
      || (typeof shouldUpdate === 'function' && (shouldUpdate as (p: unknown, c: unknown) => boolean)(previousValues.current, currentValues));
    previousValues.current = currentValues;
  }
  void shouldRender;

  const errors = key === '[]' ? [] : form.readErrors(path);
  const value = key === '[]' ? undefined : form.getFieldValue(path as unknown as Parameters<AntFormInstance['getFieldValue']>[0]);
  const isRequired = required === true || (rules ?? []).some((rule) =>
    typeof rule === 'object' && rule !== null && 'required' in rule && rule.required === true);

  const change = (...args: unknown[]) => {
    if (key === '[]') return;
    form.setFieldValue(path as unknown as Parameters<AntFormInstance['setFieldValue']>[0], changeValue(args, valuePropName));
    void form.validateOne(path as unknown as Parameters<AntFormInstance['getFieldValue']>[0]);
  };

  let content: ReactNode = typeof children === 'function'
    ? (children as (instance: FormInstance) => ReactNode)(form)
    : (children as ReactNode);
  if (key !== '[]' && !Array.isArray(content)) {
    content = enhanceChild(content, value, errors, configRef.current, generatedId, change);
  }

  const errorList = errors.length > 0 ? (
    <ul
      role="alert"
      data-oi-control="form-error-list"
      data-state="error"
      className={classNames(inputStyles.input)}
      style={{ color: 'var(--danger-control)', listStyle: 'none', margin: 0, padding: 0 }}
    >
      {errors.map((error, index) => <li key={index}>{error}</li>)}
    </ul>
  ) : null;

  if (noStyle) return <>{content}{errorList}</>;

  return (
    <div
      className={className}
      data-oi-control="form-item"
      data-state={errors.length > 0 ? 'invalid' : 'default'}
      style={{ ...(hidden ? { display: 'none' } : {}), ...style }}
    >
      {label !== undefined && (
        <label htmlFor={generatedId} data-oi-control="form-label">
          {markFor(label, isRequired, context?.requiredMark ?? true)}
        </label>
      )}
      {content}
      {help !== undefined ? <div className={inputStyles.input} style={{ color: 'var(--fg-muted)' }}>{help}</div> : null}
      {errorList}
      {extra !== undefined ? <div style={{ color: 'var(--fg-muted)' }}>{extra}</div> : null}
    </div>
  );
}

let listKeyCounter = 0;
function nextListKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `form-list-${++listKeyCounter}`;
}

/** Native Form.List with stable keys and AntD-shaped add/remove/move operations. */
export const FormList = function FormList({ name, rules, initialValue, children }: AntFormListProps) {
  void rules;
  const context = useContext(FormContext);
  const form = context?.form ?? DETACHED_FORM;
  const version = useFormVersion(form);
  void version;
  const path = pathOf(name as NamePath);
  const nameKey = keyOf(path);
  const pathRef = useRef(path);
  pathRef.current = path;
  const current = form.getFieldValue(name as Parameters<AntFormInstance['getFieldValue']>[0]);
  const list = Array.isArray(current) ? current : [];
  const keysRef = useRef<string[]>([]);
  while (keysRef.current.length < list.length) keysRef.current.push(nextListKey());
  if (keysRef.current.length > list.length) keysRef.current.length = list.length;

  useEffect(() => {
    if (form.getFieldValue(pathRef.current as unknown as Parameters<AntFormInstance['getFieldValue']>[0]) === undefined) {
      form.setFieldValue(
        pathRef.current as unknown as Parameters<AntFormInstance['setFieldValue']>[0],
        initialValue ?? [],
      );
    }
    // Initial value is applied once per list path; later updates come from callers.
  }, [form, nameKey]);

  const read = () => {
    const value = form.getFieldValue(pathRef.current as unknown as Parameters<AntFormInstance['getFieldValue']>[0]);
    return Array.isArray(value) ? [...value] : [];
  };
  const write = (next: unknown[]) => {
    form.setFieldValue(pathRef.current as unknown as Parameters<AntFormInstance['setFieldValue']>[0], next);
  };
  const fields = list.map((_, index) => ({ name: index, key: keysRef.current[index]! as unknown as number }));
  const operations = {
    add(defaultValue?: unknown, insertIndex?: number) {
      const next = read();
      const at = insertIndex === undefined ? next.length : Math.max(0, Math.min(insertIndex, next.length));
      next.splice(at, 0, defaultValue);
      keysRef.current.splice(at, 0, nextListKey());
      write(next);
    },
    remove(index: number | number[]) {
      const indexes = (Array.isArray(index) ? index : [index]).sort((a, b) => b - a);
      const next = read();
      for (const at of indexes) {
        next.splice(at, 1);
        keysRef.current.splice(at, 1);
      }
      write(next);
    },
    move(from: number, to: number) {
      const next = read();
      if (from < 0 || from >= next.length || to < 0 || to >= next.length) return;
      next.splice(to, 0, next.splice(from, 1)[0]);
      keysRef.current.splice(to, 0, keysRef.current.splice(from, 1)[0]!);
      write(next);
    },
  };
  return <>{children(fields, operations, { errors: [], warnings: [] })}</>;
};

/** Native error list; accepts both explicit messages and validation errorFields. */
export function FormErrorList({
  errors,
  errorFields,
  help,
  className,
}: AntErrorListProps & { errorFields?: Array<{ errors?: ReactNode[] }> }) {
  const messages: ReactNode[] = errors && errors.length > 0
    ? errors
    : (errorFields ?? []).flatMap((field) => field.errors ?? []);
  if (messages.length === 0 && help === undefined) return null;
  return (
    <ul
      role="alert"
      className={className}
      data-oi-control="form-error-list"
      data-state={messages.length > 0 ? 'error' : 'default'}
      style={{ color: 'var(--danger-control)', listStyle: 'none', margin: 0, padding: 0 }}
    >
      {messages.map((message, index) => <li key={index}>{message}</li>)}
      {help !== undefined ? <li>{help}</li> : null}
    </ul>
  );
}
