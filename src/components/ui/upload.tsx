import { Upload as AntUpload, type UploadProps as AntUploadProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type { UploadProps, UploadFile } from 'antd';

export interface UploadWrapperProps extends AntUploadProps {
  width?: 'full' | 'auto';
}

/** Upload with token-derived font/metrics; Dragger and LIST_IGNORE mirror AntD statics. */
export function Upload({ width = 'full', style, ...rest }: UploadWrapperProps) {
  const { fontSize, controlHeight, borderRadius } = getSharedControlTokens();
  const uploadStyle = {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...style,
  } as CSSProperties;
  return <AntUpload {...rest} style={uploadStyle} />;
}

export const UploadDragger = AntUpload.Dragger;
export const UPLOAD_LIST_IGNORE = AntUpload.LIST_IGNORE;
