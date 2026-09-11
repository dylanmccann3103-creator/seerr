import type { ColumnOptions, ColumnType } from 'typeorm';
import { Column } from 'typeorm';

// ponytail: sqlite is the only backend now, so this is a passthrough. Signature kept
// identical because entity files call it directly; sweep once those are revisited.
export function resolveDbType(pgType: ColumnType): ColumnType {
  return pgType;
}

export function DbAwareColumn(columnOptions: ColumnOptions) {
  if (columnOptions.type) {
    columnOptions.type = resolveDbType(columnOptions.type);
  }
  return Column(columnOptions);
}
