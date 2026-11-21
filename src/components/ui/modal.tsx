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
  title,
  ...rest
}: ModalProps) {
  const resolvedFooter = footerPolicy === 'none' ? null : footer;
  return (
    <AntModal
      {...withoutUndefined(rest)}
      width={width ?? getOverlayWidth(widthScale)}
      footer={resolvedFooter}
      title={title}
      closable={closePolicy === 'closable' ? (closable ?? true) : false}
      mask={{ closable: closePolicy === 'closable', ...(typeof mask === 'object' ? mask : {}) }}
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
