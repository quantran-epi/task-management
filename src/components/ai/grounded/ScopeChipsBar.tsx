import React from 'react';
import { Tag, useAntdToken } from '../../ui';
import { EditOutlined } from '../../ui/icon';

export interface RoutedScopeInfo {
  domain?: string | null | undefined;
  environment?: string | null | undefined;
  version?: string | null | undefined;
  comparisonMode?: 'single' | 'baseline_vs_scope' | null | undefined;
}

export interface ScopeChipsBarProps {
  routedScope: RoutedScopeInfo;
  onEditScope: () => void;
  readOnly?: boolean | undefined;
}

/**
 * Checks whether the routed scope contains concrete, meaningful facets (domain, env, version, comparison).
 * Avoids showing redundant "Đang tra cứu: Mặc định" chips when scope is merely the default/unspecified corpus.
 */
export function hasMeaningfulRoutedScope(
  routedScope: RoutedScopeInfo | null | undefined
): boolean {
  if (!routedScope) return false;
  const hasDomain = Boolean(
    routedScope.domain &&
      routedScope.domain !== 'Mặc định' &&
      routedScope.domain !== 'default'
  );
  const hasEnv = Boolean(routedScope.environment);
  const hasVersion = Boolean(routedScope.version);
  const isComparison = routedScope.comparisonMode === 'baseline_vs_scope';
  return hasDomain || hasEnv || hasVersion || isComparison;
}

/**
 * ScopeChipsBar renders resolved scope after routing (D-15).
 * It is editable via onEditScope and never acts as a blocking pre-ask dropdown.
 */
export const ScopeChipsBar: React.FC<ScopeChipsBarProps> = ({
  routedScope,
  onEditScope,
  readOnly = false,
}) => {
  const { token } = useAntdToken();

  if (!hasMeaningfulRoutedScope(routedScope)) {
    return null;
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEditScope();
    }
  };

  const domain = routedScope.domain || 'Mặc định';
  const environment = routedScope.environment;
  const version = routedScope.version;
  const isComparison = routedScope.comparisonMode === 'baseline_vs_scope';

  return (
    <div
      className="scope-chips-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--gap-6)',
        padding: '6px 10px',
        background: token.colorFillTertiary,
        borderRadius: token.borderRadiusSM,
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 'var(--font-size-small)', fontWeight: 500, color: token.colorTextSecondary }}>
        Đang tra cứu:
      </span>

      <Tag
        {...(readOnly
          ? {}
          : { role: 'button', tabIndex: 0, onClick: onEditScope, onKeyDown: handleKeyDown })}
        style={{
          cursor: readOnly ? 'default' : 'pointer',
          margin: 0,
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          background: token.colorBgContainer,
          borderColor: token.colorBorder,
        }}
      >
        {domain}
      </Tag>

      {environment && (
        <Tag
          {...(readOnly
            ? {}
            : { role: 'button', tabIndex: 0, onClick: onEditScope, onKeyDown: handleKeyDown })}
          style={{
            cursor: readOnly ? 'default' : 'pointer',
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            background: token.colorBgContainer,
            borderColor: token.colorBorder,
          }}
        >
          {environment}
        </Tag>
      )}

      {version && (
        <Tag
          {...(readOnly
            ? {}
            : { role: 'button', tabIndex: 0, onClick: onEditScope, onKeyDown: handleKeyDown })}
          style={{
            cursor: readOnly ? 'default' : 'pointer',
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            background: token.colorBgContainer,
            borderColor: token.colorBorder,
          }}
        >
          {version}
        </Tag>
      )}

      {isComparison && (
        <Tag
          {...(readOnly
            ? {}
            : { role: 'button', tabIndex: 0, onClick: onEditScope, onKeyDown: handleKeyDown })}
          color="warning"
          style={{
            cursor: readOnly ? 'default' : 'pointer',
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
          }}
        >
          (so sánh môi trường)
        </Tag>
      )}

      {!readOnly && (
        <span
          role="button"
          tabIndex={0}
          onClick={onEditScope}
          onKeyDown={handleKeyDown}
          style={{
            cursor: 'pointer',
            fontSize: 'var(--font-size-small)',
            color: token.colorPrimary,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--gap-2)',
            marginLeft: 4,
          }}
          aria-label="Chỉnh sửa phạm vi tra cứu"
        >
          <EditOutlined style={{ fontSize: 'var(--font-size-xs)' }} />
        </span>
      )}
    </div>
  );
};
