import { Typography as AntTypography } from 'antd';
import type { ComponentProps, CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type TextProps = ComponentProps<typeof AntTypography.Text>;
export type TitleProps = ComponentProps<typeof AntTypography.Title>;
export type ParagraphProps = ComponentProps<typeof AntTypography.Paragraph>;

/** Only the four locked roles from 49-UI-SPEC §Typography are reachable. */
export type FontRole = 'meta' | 'label' | 'body' | 'heading';

/**
 * 11/12/13/16px roles. The first three are the locked CSS font tokens; the
 * heading fallback is the whole-pixel spacing.md token (16px) from the shared
 * contract, so no odd or fractional inline font-size is ever produced (D-10).
 */
function fontRoleSize(role: FontRole): string {
  const { iconSize } = getSharedControlTokens();
  const sizes: Record<FontRole, string> = {
    meta: 'var(--font-size-xs)',
    label: 'var(--font-size-small)',
    body: 'var(--font-size-ui)',
    heading: `var(--font-size-heading, ${iconSize})`,
  };
  return sizes[role];
}

function roleStyle(role: FontRole, style?: CSSProperties): CSSProperties {
  return {
    fontSize: fontRoleSize(role),
    '--ui-typography-font-role': role,
    ...style,
  } as CSSProperties;
}

/** Single swap point for AntD Typography.Text. */
export function Text({ fontRole = 'body', style, ...rest }: TextProps & { fontRole?: FontRole }) {
  return <AntTypography.Text {...rest} style={roleStyle(fontRole, style)} />;
}

/** Single swap point for AntD Typography.Title; heading size comes from tokens. */
export function Title({ fontRole = 'heading', style, ...rest }: TitleProps & { fontRole?: FontRole }) {
  return <AntTypography.Title {...rest} style={roleStyle(fontRole, style)} />;
}

/** Single swap point for AntD Typography.Paragraph. */
export function Paragraph({
  fontRole = 'body',
  style,
  ...rest
}: ParagraphProps & { fontRole?: FontRole }) {
  return <AntTypography.Paragraph {...rest} style={roleStyle(fontRole, style)} />;
}

/** AntD Typography namespace mirrored for callers needing the raw component. */
export const Typography = {
  Text,
  Title,
  Paragraph,
  Link: AntTypography.Link,
};
