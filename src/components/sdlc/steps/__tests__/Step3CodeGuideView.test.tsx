import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RemoteDiffViewer } from '../../diff/RemoteDiffViewer';

const SAMPLE_RAW_DIFF = `diff --git a/src/index.ts b/src/index.ts
index e69de29..49b78bb 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import React from 'react';
-const oldConst = 1;
+const newConst = 2;
+console.log('hello');
 export default {};
`;

describe('RemoteDiffViewer Component', () => {
  it('renders diff with file path and additions/deletions stats', () => {
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
      />
    );

    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.getByText("const newConst = 2;")).toBeInTheDocument();
  });

  it('switches between Unified and Split modes via Segmented control', () => {
    const handleModeChange = vi.fn();
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
        onViewModeChange={handleModeChange}
      />
    );

    const splitBtn = screen.getByRole('radio', { name: 'Split' });
    fireEvent.click(splitBtn);
    expect(handleModeChange).toHaveBeenCalledWith('split');
  });

  it('caps diff files exceeding 5000 lines with an alert and confirmation button', () => {
    // Generate diff with > 5000 lines
    const largeLines = ['diff --git a/huge.txt b/huge.txt', '--- a/huge.txt', '+++ b/huge.txt', '@@ -1,1 +1,5005 @@'];
    for (let i = 0; i < 5005; i++) {
      largeLines.push(`+line content ${i}`);
    }
    const hugeDiff = largeLines.join('\n');

    render(
      <RemoteDiffViewer
        rawDiff={hugeDiff}
        filePath="huge.txt"
      />
    );

    expect(
      screen.getByText(/Đã tự động giới hạn hiển thị 5\.000 dòng để đảm bảo hiệu năng giao diện\./i)
    ).toBeInTheDocument();

    const loadAllBtn = screen.getByRole('button', { name: /Tải toàn bộ nội dung diff/i });
    expect(loadAllBtn).toBeInTheDocument();

    fireEvent.click(loadAllBtn);
    expect(
      screen.queryByText(/Đã tự động giới hạn hiển thị 5\.000 dòng để đảm bảo hiệu năng giao diện\./i)
    ).not.toBeInTheDocument();
  });

  it('triggers toggle fullscreen callback when button is clicked', () => {
    const handleToggle = vi.fn();
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
        onToggleFullscreen={handleToggle}
      />
    );

    const fsBtn = screen.getByRole('button', { name: /Toàn màn hình/i });
    fireEvent.click(fsBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
