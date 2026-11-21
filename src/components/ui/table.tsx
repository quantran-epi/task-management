import { Table as AntTable, type TableProps as AntTableProps } from 'antd';
import type { CSSProperties } from 'react';
import { sharedTokens } from '../../styles/tokens';
import { getSharedControlTokens } from './tokens.contract';

export type TableSize = 'small' | 'middle' | 'large';

export interface TableProps<RecordType = unknown> extends AntTableProps<RecordType> {
  /** Density policy; maps to AntD size, never a raw CSS height. */
  density?: TableSize;
}

/** Token-derived Table padding/font as custom properties, never inline hex. */
export function tableStyle(): CSSProperties {
  const { tablePadding, tableFontSize } = sharedTokens;
  const { controlHeight } = getSharedControlTokens();
  return {
    '--ui-table-padding': `${tablePadding}px`,
    '--ui-table-font-size': `${tableFontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
  } as CSSProperties;
}

/** Single swap point for AntD Table; `Summary` mirrors the AntD static without a pass-through file. */
export function Table<RecordType = unknown>({ density, style, ...rest }: TableProps<RecordType>) {
  return (
    <AntTable
      {...(rest as AntTableProps<RecordType>)}
      {...(density ? { size: density } : {})}
      style={{ ...tableStyle(), ...style }}
    />
  );
}

export const TableSummary = AntTable.Summary;
