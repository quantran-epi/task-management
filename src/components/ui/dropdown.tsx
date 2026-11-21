import { Dropdown as AntDropdown, type DropdownProps as AntDropdownProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type DropdownProps = AntDropdownProps;

/** AntD Dropdown.Button mirrored as a named export; no bare re-export. */
export const DropdownButton = AntDropdown.Button;

/** Single swap point for AntD Dropdown; menu metrics come from shared tokens. */
export function Dropdown({ styles, ...rest }: DropdownProps) {
  const { borderRadius, controlHeight, fontSize } = getSharedControlTokens();
  const menuMetrics = {
    '--ui-control-radius': `${borderRadius}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-font-size': `${fontSize}px`,
  } as CSSProperties;
  return <AntDropdown {...rest} styles={{ root: menuMetrics, ...styles }} />;
}
