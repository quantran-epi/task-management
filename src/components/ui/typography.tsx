import type { Typography as AntTypography } from 'antd';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { classNames, domProps } from './native/classNames';
import { getSharedControlTokens } from './tokens.contract';

export type TextProps = ComponentProps<typeof AntTypography.Text>;
export type TitleProps = ComponentProps<typeof AntTypography.Title>;
export type ParagraphProps = ComponentProps<typeof AntTypography.Paragraph>;

/** Only the four locked roles from the design contract are reachable. */
export type FontRole = 'meta' | 'label' | 'body' | 'heading';

/** 11/12/13/16px roles; heading uses the whole-pixel spacing token. */
export function fontRoleSize(role: FontRole): string {
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

function nativeTypography(tag: 'span' | 'p' | 'h1' | 'a') {
  return function NativeText({
    fontRole,
    style,
    className,
    children,
    ...rest
  }: {
    fontRole?: FontRole;
    style?: CSSProperties | undefined;
    className?: string;
    children?: ReactNode;
    href?: string;
    target?: string;
    rel?: string;
    title?: string;
    id?: string;
    onClick?: React.MouseEventHandler<HTMLElement>;
    'aria-label'?: string;
  }) {
    const Tag = tag;
    return (
      <Tag
        data-oi-control={tag === 'a' ? 'link' : 'text'}
        className={classNames(className)}
        style={roleStyle(fontRole ?? 'body', style)}
        {...domProps(rest)}
      >
        {children}
      </Tag>
    );
  };
}

/** Native N-33 typography roles; type aliases stay AntD-compatible. */
export function Text({ fontRole = 'body', style, ...rest }: TextProps & { fontRole?: FontRole }) {
  const Native = nativeTypography('span');
  return <Native fontRole={fontRole} style={style} {...(rest as Record<string, unknown>)} />;
}

/** Heading role defaults to the 16px legacy display size. */
export function Title({ fontRole = 'heading', style, ...rest }: TitleProps & { fontRole?: FontRole }) {
  const Native = nativeTypography('h1');
  return <Native fontRole={fontRole} style={style} {...(rest as Record<string, unknown>)} />;
}

/** Paragraph role renders a native block with the shared font metric. */
export function Paragraph({ fontRole = 'body', style, ...rest }: ParagraphProps & { fontRole?: FontRole }) {
  const Native = nativeTypography('p');
  return <Native fontRole={fontRole} style={style} {...(rest as Record<string, unknown>)} />;
}

/** AntD Typography namespace mirrored with a native link component. */
export const Typography = {
  Text,
  Title,
  Paragraph,
  Link: nativeTypography('a'),
};
