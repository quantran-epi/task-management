import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadProps } from 'antd';
import { ConfigProfileImportCard } from '../../../src/components/settings/ConfigProfileImportCard';
import { TaskPlannerDatabase } from '../../../src/db';

const testState: { capturedBeforeUpload?: UploadProps['beforeUpload'] } = {};

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  const Dragger = (props: Record<string, unknown>) => {
    testState.capturedBeforeUpload = props.beforeUpload as UploadProps['beforeUpload'];
    return null;
  };
  return {
    ...actual,
    Upload: Object.assign(
      (props: Record<string, unknown>) => {
        testState.capturedBeforeUpload = props.beforeUpload as UploadProps['beforeUpload'];
        return null;
      },
      { Dragger }
    ),
    notification: {
      ...actual.notification,
      error: (...args: unknown[]) => (globalThis as any).__p46ImportCardError?.(...args),
    },
  };
});

describe('ConfigProfileImportCard FileReader errors (WR-05)', () => {
  beforeEach(() => {
    (globalThis as any).__p46ImportCardError = vi.fn();
  });

  it('shows a Vietnamese error notification when FileReader fails', async () => {
    const db = new TaskPlannerDatabase(`ImportCard_${Date.now()}_${Math.random()}`);
    render(<ConfigProfileImportCard db={db} />);
    expect(testState.capturedBeforeUpload).toBeTypeOf('function');

    const originalFileReader = globalThis.FileReader;
    class FailingFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsText() {
        this.onerror?.();
      }
    }
    // @ts-expect-error minimal FileReader stub for the focused error path
    globalThis.FileReader = FailingFileReader;
    try {
      const result = testState.capturedBeforeUpload!(
        Object.assign(new File(['{}'], 'profile.json'), { uid: 'test' }) as any,
        []
      );
      expect(result).toBe(false);
      expect((globalThis as any).__p46ImportCardError).toHaveBeenCalledWith({
        message: 'Không đọc được tệp',
        description: 'Không thể đọc nội dung tệp cấu hình. Vui lòng thử lại.',
      });
    } finally {
      globalThis.FileReader = originalFileReader;
      await db.delete();
    }
  });
});
