import {
  Descriptions as AntDescriptions,
  type DescriptionsProps as AntDescriptionsProps,
} from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type DescriptionsProps = AntDescriptionsProps;

/** AntD Descriptions.Item mirrored under a wrapper-owned name. */
export const DescriptionsItem = AntDescriptions.Item;

function descriptionsStyle(): CSSProperties {
  const { fontSize, controlHeight } = getSharedControlTokens();
  return {
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-label-font-size': 'var(--font-size-small)',
    '--ui-control-height': `${controlHeight}px`,
  } as CSSProperties;
}

/** Single swap point for AntD Descriptions; label/value metrics come from tokens. */
export function Descriptions({ style, ...rest }: DescriptionsProps) {
  return <AntDescriptions {...rest} style={{ ...descriptionsStyle(), ...style }} />;
}
