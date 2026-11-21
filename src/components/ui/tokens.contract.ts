import {
  sharedTokens,
  statusColorMap,
  type ThemeMode,
} from '../../styles/tokens';

/** AntD control sizes accepted by the shared wrapper policy. */
export type ControlSize = 'small' | 'middle' | 'large';

/** Policy props available on status-like wrappers (Tag/Badge/StatusDot). */
export type StatusKind = keyof (typeof statusColorMap)[ThemeMode];

/** Shared, token-derived defaults applied by every wrapper family. */
export interface WrapperPolicy {
  controlHeight: number;
  borderRadius: number;
  fontSize: number;
  paddingInline: number;
  /** Whole-pixel icon size from the spacing scale — never a fractional font-size. */
  iconSize: string;
}

/**
 * Single home for control metrics. Values come from tokens.ts only; wrappers
 * must never spell a hex or raw metric themselves (CTRL-06, D-02, D-10).
 */
export function getSharedControlTokens(): WrapperPolicy {
  const { controlHeight, borderRadius, fontSize, buttonPaddingInlinePrimary } = sharedTokens;
  return {
    controlHeight,
    borderRadius,
    fontSize,
    paddingInline: buttonPaddingInlinePrimary,
    iconSize: sharedTokens.spacing.md,
  };
}

/** Status color comes only from the shared D-12 map — never a view literal. */
export function getStatusTokens(kind: StatusKind, mode: ThemeMode = 'light'): string {
  return statusColorMap[mode][kind];
}

/** `exactOptionalPropertyTypes`: omit keys whose value is undefined. */
export type DefinedProperties<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

export function withoutUndefined<T extends object>(value: T): DefinedProperties<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as DefinedProperties<T>;
}
