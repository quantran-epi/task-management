import React from 'react';
import { renderSafeMarkdown, type MarkdownRenderOptions } from '../../../utils/markdown';

export interface SafeMarkdownProps extends MarkdownRenderOptions {
  source: string;
  style?: React.CSSProperties | undefined;
  className?: string | undefined;
  'data-testid'?: string | undefined;
}

/**
 * The single sanctioned `dangerouslySetInnerHTML` boundary for SDLC step views.
 *
 * `renderSafeMarkdown` escapes raw HTML and strips dangerous link/image schemes, so the
 * injected string is the renderer's own output — never model text verbatim (T-31.2-41).
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({
  source,
  sourceLines,
  style,
  className,
  'data-testid': testId,
}) => (
  <div
    className={className}
    style={style}
    data-testid={testId}
    dangerouslySetInnerHTML={{
      __html: renderSafeMarkdown(source, sourceLines === undefined ? undefined : { sourceLines }),
    }}
  />
);
