import React, { useMemo } from 'react';
import { Select, message } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getDistinctOpsOwners,
  getDistinctBusinessAnalysts,
} from '../../db/repositories/tagRepo';

export interface TagSelectProps {
  value?: string[] | undefined;
  onChange?: ((value: string[]) => void) | undefined;
  field: 'opsOwners' | 'businessAnalysts';
  inheritedText?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
}

const MAX_TAG_COUNT = 10;
const MAX_TAG_LENGTH = 50;

export const TagSelect: React.FC<TagSelectProps> = ({
  value = [],
  onChange,
  field,
  inheritedText,
  placeholder,
  disabled,
}) => {
  const suggestions = useLiveQuery(
    () =>
      field === 'opsOwners'
        ? getDistinctOpsOwners()
        : getDistinctBusinessAnalysts(),
    [field],
    []
  );

  const options = useMemo(() => {
    const set = new Set<string>();
    (suggestions ?? []).forEach((tag) => set.add(tag));
    (value ?? []).forEach((tag) => set.add(tag));
    return Array.from(set).map((tag) => ({
      label: tag,
      value: tag,
    }));
  }, [suggestions, value]);

  const defaultPlaceholder =
    field === 'opsOwners' ? 'Thêm Ops Owner...' : 'Thêm Business Analyst...';

  const computedPlaceholder =
    (!value || value.length === 0) && inheritedText
      ? inheritedText
      : placeholder || defaultPlaceholder;

  const handleChange = (newVals: string[]) => {
    // Trim, case-insensitive deduplication, length check, max 10
    const processed: string[] = [];
    const seenLower = new Set<string>();

    for (const raw of newVals) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      if (trimmed.length > MAX_TAG_LENGTH) {
        message.warning({
          content: 'Tên thẻ tối đa 50 ký tự',
          key: 'tag-length-warning',
        });
        continue;
      }

      const lower = trimmed.toLowerCase();
      if (seenLower.has(lower)) {
        continue;
      }
      seenLower.add(lower);
      processed.push(trimmed);

      if (processed.length === MAX_TAG_COUNT) {
        if (newVals.length > MAX_TAG_COUNT) {
          message.warning({
            content: 'Tối đa 10 thẻ cho mỗi trường',
            key: 'tag-count-warning',
          });
        }
        break;
      }
    }

    if (newVals.length > MAX_TAG_COUNT && processed.length === MAX_TAG_COUNT) {
      message.warning({
        content: 'Tối đa 10 thẻ cho mỗi trường',
        key: 'tag-count-warning',
      });
    }

    onChange?.(processed);
  };

  const selectProps: React.ComponentProps<typeof Select<string[]>> = {
    mode: 'tags',
    value,
    onChange: handleChange,
    placeholder: computedPlaceholder,
    options,
    style: { width: '100%' },
    tokenSeparators: [','],
    allowClear: true,
  };
  if (disabled !== undefined) {
    selectProps.disabled = disabled;
  }

  return <Select {...selectProps} />;
};
