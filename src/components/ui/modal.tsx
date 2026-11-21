import { Modal as AntModal, type ModalProps as AntModalProps } from 'antd';
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

/**
 * Single swap point for declarative AntD Modals. Width comes only from the token
 * scale; callers cannot inject a raw CSS width through `widthScale`.
 */
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
  ...rest
}: ModalProps) {
  const resolvedFooter = footerPolicy === 'none' ? null : footer;
  const closableByDefault = closePolicy === 'closable';
  return (
    <AntModal
      {...withoutUndefined(rest)}
      width={width ?? getOverlayWidth(widthScale)}
      footer={resolvedFooter}
      title={title}
      closable={closableByDefault ? (closable ?? true) : false}
      {...withoutUndefined({ maskClosable, mask: resolveMask(mask, closableByDefault, maskClosable) })}
    />
  );
}

/**
 * Imperative confirms must keep ConfigProvider context. Phase 50 swaps the 637
 * static `Modal.confirm`/`message.*`/`notification.*` call sites to this hook
 * (and useMessage/useNotification); never use the AntD static methods in ui/.
 */
export function useTaskMateModal() {
  const [modal, contextHolder] = AntModal.useModal();
  return { modal, contextHolder };
}
