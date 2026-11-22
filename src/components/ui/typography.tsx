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

function roleStyle(role: FontRole, style?: CSSProperties, extra?: CSSProperties): CSSProperties {
  return {
    fontSize: fontRoleSize(role),
    '--ui-typography-font-role': role,
    ...extra,
    ...style,
  } as CSSProperties;
}

interface NativeTypographyProps {
  fontRole?: FontRole;
  style?: CSSProperties | undefined;
  className?: string | undefined;
  children?: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  title?: string;
  id?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  'aria-label'?: string;
  /** AntD-compatible presentational props, mapped to semantics/style instead of dropped. */
  strong?: boolean;
  code?: boolean;
  copyable?: boolean | { text?: string };
  ellipsis?: boolean | { rows?: number };
  type?: 'secondary' | 'success' | 'warning' | 'danger' | string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

const TYPE_COLOR: Record<string, string> = {
  secondary: 'var(--fg-muted)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

function nativeTypography(tag: 'span' | 'p' | 'a' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  return function NativeText({
    fontRole,
    style,
    className,
    children,
    strong,
    code,
    copyable,
    ellipsis,
    type,
    level,
    href,
    target,
    rel,
    onClick,
    ...rest
  }: NativeTypographyProps) {
    const Tag = tag;
    const extra: CSSProperties = {
      ...(strong ? { fontWeight: 600 } : {}),
      ...(type && TYPE_COLOR[type] ? { color: TYPE_COLOR[type] } : {}),
      ...(ellipsis
        ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(typeof ellipsis === 'object' && ellipsis.rows && ellipsis.rows > 1 ? { whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: ellipsis.rows, WebkitBoxOrient: 'vertical' } : {}) }
        : {}),
    };
    let content: ReactNode = children;
    if (code) content = <code className={classNames('ui-code')}>{content}</code>;
    const copyText = typeof copyable === 'object' ? copyable.text : undefined;
    const showCopy = copyable === true || typeof copyable === 'object';
    return (
      <Tag
        data-oi-control={tag === 'a' ? 'link' : tag.startsWith('h') ? 'heading' : 'text'}
        data-level={level}
        className={classNames(className, strong && 'ui-strong', code && 'ui-code-wrap')}
        style={roleStyle(fontRole ?? (tag.startsWith('h') ? 'heading' : 'body'), style, extra)}
        {...(href !== undefined ? { href, target, rel } : {})}
        {...(onClick ? { onClick } : {})}
        {...domProps(rest)}
      >
        {content}
        {showCopy ? (
          <button
            type="button"
            className="ui-copy"
            aria-label="Sao chép"
            onClick={() => {
              const text = copyText ?? (typeof content === 'string' ? content : '');
              if (text) void navigator.clipboard?.writeText(text);
            }}
          >
            ⧉
          </button>
        ) : null}
      </Tag>
    );
  };
}

/** Native N-33 typography roles; type aliases stay AntD-compatible. */
export function Text({ fontRole = 'body', ...rest }: TextProps & { fontRole?: FontRole }) {
  const Native = nativeTypography('span');
  return <Native fontRole={fontRole} {...(rest as Record<string, unknown>)} />;
}

/** Heading role defaults to 16px; `level` picks the native h1..h6 tag. */
export function Title({ fontRole = 'heading', level = 4, ...rest }: TitleProps & { fontRole?: FontRole }) {
  const Native = nativeTypography(`h${level}` as 'h1');
  return <Native fontRole={fontRole} level={level} {...(rest as Record<string, unknown>)} />;
}

/** Paragraph role renders a native block with the shared font metric. */
export function Paragraph({ fontRole = 'body', ...rest }: ParagraphProps & { fontRole?: FontRole }) {
  const Native = nativeTypography('p');
  return <Native fontRole={fontRole} {...(rest as Record<string, unknown>)} />;
}

/** AntD Typography namespace mirrored with native components. */
export const Typography = {
  Text,
  Title,
  Paragraph,
  Link: nativeTypography('a'),
};
