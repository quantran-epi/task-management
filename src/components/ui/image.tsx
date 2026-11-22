import type { ImageProps as AntImageProps } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { classNames } from './native/classNames';
import { DialogSurface } from './native/dialog';
import buttonStyles from './openidea/Button.module.css';
import dialogStyles from './openidea/Dialog.module.css';
import spinnerStyles from './openidea/Spinner.module.css';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

export type ImageProps = AntImageProps;

interface PreviewItem { src: string; alt: string }
interface PreviewState {
  items: PreviewItem[];
  open: boolean;
  index: number;
  show: (src: string) => void;
  close: () => void;
  step: (delta: number) => void;
}

const PreviewContext = createContext<PreviewState | null>(null);

/** Native ImagePreviewGroup: owns the preview list and the shared dialog state. */
export function ImagePreviewGroup({ children }: { children?: ReactNode }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [images, setImages] = useState<PreviewItem[]>([]);
  useEffect(() => setImages(collectImages(children)), [children]);
  const show = useCallback((src: string) => {
    const next = collectImages(children);
    setItems(next);
    const found = next.findIndex((item) => item.src === src);
    setIndex(found >= 0 ? found : 0);
    setOpen(true);
  }, [children]);
  const close = useCallback(() => setOpen(false), []);
  const allItems = images.length > 0 ? images : items;
  const step = useCallback((delta: number) => {
    const count = allItems.length;
    if (count === 0) return;
    setIndex((value) => (value + delta + count) % count);
  }, [allItems.length]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, step]);
  const value = useMemo<PreviewState>(() => ({ items: allItems, open, index, show, close, step }), [allItems, open, index, show, close, step]);
  return (
    <PreviewContext.Provider value={value}>
      {children}
      <ImagePreviewDialog state={value} />
    </PreviewContext.Provider>
  );
}

function collectImages(children: ReactNode): PreviewItem[] {
  const items: PreviewItem[] = [];
  const visit = (node: ReactNode) => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node === 'object' && 'props' in node) {
      const element = node as { props: { src?: unknown; alt?: unknown; children?: ReactNode }; type?: unknown };
      if (typeof element.props.src === 'string') {
        items.push({ src: element.props.src, alt: typeof element.props.alt === 'string' ? element.props.alt : '' });
      }
      visit(element.props.children as ReactNode);
    }
  };
  visit(children);
  return items;
}

function ImagePreviewDialog({ state }: { state: PreviewState }) {
  const current = state.items[state.index];
  return (
    <DialogSurface
      open={state.open && current !== undefined}
      width="min(90vw, 900px)"
      label={current?.alt || 'Xem ảnh'}
      onClose={state.close}
      footer={state.items.length > 1 ? (
        <div className={dialogStyles.buttons}>
          <button type="button" data-oi-control="button" className={classNames(buttonStyles.button, buttonStyles.secondary)} onClick={() => state.step(-1)}>‹</button>
          <button type="button" data-oi-control="button" className={classNames(buttonStyles.button, buttonStyles.secondary)} onClick={() => state.step(1)}>›</button>
        </div>
      ) : null}
    >
      <div
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); state.step(-1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); state.step(1); }
        }}
      >
        {current ? <img src={current.src} alt={current.alt} className="image" /> : null}
      </div>
    </DialogSurface>
  );
}

/** Native Image: caller styles.root win, preview uses the group dialog or a per-image dialog. */
export function Image({ styles, ...rest }: ImageProps) {
  const { borderRadius, iconSize } = getSharedControlTokens();
  const group = useContext(PreviewContext);
  const [innerOpen, setInnerOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const tokenStyle = {
    '--ui-image-radius': `${borderRadius}px`,
    '--ui-image-preview-icon-size': iconSize,
  } as CSSProperties;
  const rootStyle =
    styles && typeof styles === 'object' && 'root' in styles
      ? { ...tokenStyle, ...(styles.root as CSSProperties | undefined) }
      : tokenStyle;
  const previewConfig = rest.preview;
  const previewEnabled = previewConfig !== false;
  const show = () => {
    if (group) group.show(rest.src ?? '');
    else setInnerOpen(true);
  };
  const close = () => {
    setInnerOpen(false);
    imageRef.current?.focus();
  };
  const previewDialog = !group && previewEnabled && rest.src ? (
    <DialogSurface open={innerOpen} label={rest.alt ?? 'Xem ảnh'} onClose={close}>
      <img src={rest.src} alt={rest.alt ?? ''} className="image" />
    </DialogSurface>
  ) : null;

  return (
    <>
      <img
        ref={imageRef}
        src={failed && rest.fallback ? rest.fallback : rest.src}
        alt={rest.alt ?? ''}
        width={rest.width as number | string | undefined}
        height={rest.height as number | string | undefined}
        className={classNames('image', rest.className)}
        style={{ ...rootStyle, ...rest.style }}
        aria-busy={rest.placeholder ? 'true' : undefined}
        tabIndex={previewEnabled ? 0 : undefined}
        onClick={(event) => {
          if (previewEnabled) show();
          (rest.onClick as ((event: React.MouseEvent<HTMLImageElement>) => void) | undefined)?.(event);
        }}
        onKeyDown={(event) => {
          if (previewEnabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            show();
          }
        }}
        onError={(event) => {
          setFailed(true);
          (rest.onError as ((event: React.SyntheticEvent<HTMLImageElement>) => void) | undefined)?.(event);
        }}
        {...withoutUndefined({ title: rest.title })}
      >
        {rest.children}
      </img>
      {rest.placeholder ? <span className={spinnerStyles.spinner} role="status" aria-label="Đang tải" /> : null}
      {previewDialog}
    </>
  );
}
