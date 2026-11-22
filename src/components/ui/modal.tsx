import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { ModalFuncProps, ModalProps as AntModalProps } from 'antd';
import { classNames } from './native/classNames';
import { DialogSurface, type DialogCloseReason } from './native/dialog';
import {
  createImperativeChannel,
  useImperativeChannel,
  type ImperativeChannel,
} from './native/imperativeChannel';
import buttonStyles from './openidea/Button.module.css';
import dialogStyles from './openidea/Dialog.module.css';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

/** Fixed overlay width scale, derived from the shared control height (CTRL-04, T-49-17). */
export type OverlayWidth = 'sm' | 'md' | 'lg';

const WIDTH_FACTOR: Record<OverlayWidth, number> = { sm: 10, md: 18, lg: 28 };

export function getOverlayWidth(scale: OverlayWidth): number {
  const { controlHeight } = getSharedControlTokens();
  return controlHeight * WIDTH_FACTOR[scale];
}

export interface ModalProps extends AntModalProps {
  widthScale?: OverlayWidth;
  footerPolicy?: 'default' | 'none';
  closePolicy?: 'closable' | 'silent';
  defaultOpen?: boolean;
}

/**
 * Preserve an explicit boolean `mask` (especially `false`) instead of replacing
 * it with a config object, which AntD reads as "mask on" (WR-04). Object form
 * keeps the close policy as its default and lets caller keys override it.
 */
export function resolveMask(
  mask: AntModalProps['mask'],
  closableByDefault: boolean,
  maskClosable?: boolean,
): AntModalProps['mask'] {
  if (typeof mask === 'boolean') return mask;
  return { closable: maskClosable ?? closableByDefault, ...(mask ?? {}) };
}

function isMasked(mask: AntModalProps['mask'], closable: boolean, maskClosable?: boolean): boolean {
  const resolved = resolveMask(mask, closable, maskClosable);
  if (typeof resolved === 'boolean') return resolved;
  return resolved?.closable ?? closable;
}

function confirmEvent(event?: ReactMouseEvent<HTMLElement>): MouseEvent {
  return event?.nativeEvent ?? new MouseEvent('click');
}

function okDanger(config: ModalFuncProps): boolean {
  return config.okType === 'danger' || config.okButtonProps?.danger === true;
}

function defaultFooter(config: ModalFuncProps, dismiss: () => void): ReactNode {
  const cancel = (
    <button
      type="button"
      data-oi-control="button"
      className={classNames(buttonStyles.button, buttonStyles.secondary)}
      onClick={(event) => {
        config.onCancel?.(confirmEvent(event) as never);
        dismiss();
      }}
    >
      {config.cancelText ?? 'Hủy'}
    </button>
  );
  const ok = (
    <button
      type="button"
      data-oi-control="button"
      className={classNames(buttonStyles.button, buttonStyles.primary, okDanger(config) && buttonStyles.danger)}
      onClick={(event) => {
        void Promise.resolve(config.onOk?.(confirmEvent(event) as never)).then(dismiss);
      }}
    >
      {config.okText ?? 'OK'}
    </button>
  );
  return (
    <div className={dialogStyles.buttons}>
      {cancel}
      {ok}
    </div>
  );
}

/** Single swap point for declarative Modals; no runtime AntD in the render path. */
function rawWidth(width: AntModalProps['width']): number | string | undefined {
  return typeof width === 'number' || typeof width === 'string' ? width : undefined;
}

export function Modal({
  widthScale = 'md',
  footerPolicy = 'default',
  closePolicy = 'closable',
  width,
  footer,
  closable,
  mask,
  maskClosable,
  title,
  open,
  defaultOpen,
  onCancel,
  okText,
  cancelText,
  okButtonProps,
  cancelButtonProps,
  okType,
  onOk,
  children,
  className,
  style,
  ...rest
}: ModalProps) {
  const { controlHeight } = getSharedControlTokens();
  const [innerOpen, setInnerOpen] = useState(defaultOpen === true);
  // RR-03: controlled/uncontrolled is decided before falling back to a default.
  const currentOpen = open !== undefined ? open : innerOpen;
  const closableByDefault = closePolicy === 'closable';
  const canClose = closableByDefault ? (typeof closable === 'boolean' ? closable : true) : false;
  const masked = isMasked(mask, closableByDefault, maskClosable);
  const dismiss = () => {
    if (open === undefined) setInnerOpen(false);
  };
  const footerNode = (() => {
    if (footerPolicy === 'none') return null;
    if (footer !== undefined && footer !== null) {
      return typeof footer === 'function' ? (footer as () => ReactNode)() : footer;
    }
    const footerConfig = withoutUndefined({
      okText, cancelText, okButtonProps, cancelButtonProps, okType, onOk,
    }) as ModalFuncProps;
    return defaultFooter(footerConfig, dismiss);
  })();

  return (
    <DialogSurface
      open={currentOpen}
      title={title}
      width={rawWidth(width) ?? getOverlayWidth(widthScale)}
      masked={masked}
      closable={canClose}
      className={className}
      style={{ '--ui-control-height': `${controlHeight}px`, ...style } as React.CSSProperties}
      footer={footerNode}
      {...withoutUndefined({ label: typeof title === 'string' ? title : undefined })}
      onClose={(reason?: DialogCloseReason) => {
        if (reason === 'outside' && maskClosable === false) return;
        dismiss();
        onCancel?.(new MouseEvent('click') as never);
      }}
    >
      <div {...withoutUndefined(rest)}>{children}</div>
    </DialogSurface>
  );
}

interface ConfirmRecord extends ModalFuncProps {
  key: string;
}

/** Imperative confirms own a channel per hook, so only this hook's holder renders its dialogs. */
export function useTaskMateModal() {
  const channelRef = useRef<ImperativeChannel<ConfirmRecord> | null>(null);
  if (channelRef.current === null) channelRef.current = createImperativeChannel<ConfirmRecord>();
  const channel = channelRef.current;
  const records = useImperativeChannel(channel);

  const modal = {
    confirm(config: ModalFuncProps) {
      const key = crypto.randomUUID();
      channel.push({ ...config, key }, key);
      return {
        destroy: () => channel.remove(key),
        update: (patch: Partial<ModalFuncProps>) => channel.update(key, patch),
      };
    },
    destroy: () => channel.clear(),
  };

  const contextHolder = (
    <>
      {records.map((record) => (
        <ConfirmDialog
          key={record.key}
          config={record.payload}
          onDismiss={() => channel.remove(record.key)}
        />
      ))}
    </>
  );

  return { modal, contextHolder };
}

/** One native confirm dialog rendered by the matching hook's contextHolder. */
function ConfirmDialog({ config, onDismiss }: { config: ConfirmRecord; onDismiss: () => void }) {
  const confirmWidth = config.width;
  const footer = (() => {
    if (config.footer === null) return null;
    if (typeof config.footer === 'function') {
      return (config.footer as (node: ReactNode, extra: unknown) => ReactNode)(null, {
        OkBtn: () => null,
        CancelBtn: () => null,
      });
    }
    if (config.footer !== undefined) return config.footer;
    return defaultFooter(config, onDismiss);
  })();

  const content: ReactNode = (
    <>
      {config.icon ? <span className={dialogStyles.messageIcon}>{config.icon}</span> : null}
      <div className={dialogStyles.messageText}>{config.content}</div>
    </>
  );

  return (
    <DialogSurface
      open
      title={config.title}
      {...withoutUndefined({
        width: typeof confirmWidth === 'number' || typeof confirmWidth === 'string' ? confirmWidth : undefined,
        label: typeof config.title === 'string' ? config.title : undefined,
      })}
      closable={config.closable !== false}
      masked={config.mask !== false}
      footer={footer}
      onClose={(reason) => {
        if (reason === 'escape' || reason === 'outside' || reason === 'close') {
          config.onCancel?.(new MouseEvent('click') as never);
          onDismiss();
        }
      }}
    >
      <div className={dialogStyles.message}>{content}</div>
    </DialogSurface>
  );
}
