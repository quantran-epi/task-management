import { Image as AntImage, type ImageProps as AntImageProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type ImageProps = AntImageProps;
export const ImagePreviewGroup = AntImage.PreviewGroup;

/** AntD 6 Image carries token metrics via `styles.root`; caller styles win. */
export function Image({ styles, ...rest }: ImageProps) {
  const { borderRadius, iconSize } = getSharedControlTokens();
  const tokenStyle = {
    '--ui-image-radius': `${borderRadius}px`,
    '--ui-image-preview-icon-size': iconSize,
  } as CSSProperties;
  const rootStyle =
    styles && typeof styles === 'object' && 'root' in styles
      ? { ...tokenStyle, ...(styles.root as CSSProperties | undefined) }
      : tokenStyle;
  return <AntImage {...rest} styles={{ ...(styles as object), root: rootStyle } as typeof styles} />;
}
