import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PanelGroup, Panel } from 'react-resizable-panels';
import { WorkbenchResizeHandle } from '../WorkbenchResizeHandle';

describe('WorkbenchResizeHandle', () => {
  it('renders horizontal resize handle with proper attributes', () => {
    const { container } = render(
      <PanelGroup direction="horizontal">
        <Panel defaultSize={50}>
          <div>Panel 1</div>
        </Panel>
        <WorkbenchResizeHandle direction="horizontal" id="test-handle" />
        <Panel defaultSize={50}>
          <div>Panel 2</div>
        </Panel>
      </PanelGroup>
    );

    const handle = container.querySelector('#test-handle');
    expect(handle).toBeDefined();
    expect(handle?.getAttribute('data-direction')).toBe('horizontal');
    expect(handle?.classList.contains('workbench-resize-handle')).toBe(true);
  });

  it('renders vertical resize handle with proper attributes', () => {
    const { container } = render(
      <PanelGroup direction="vertical">
        <Panel defaultSize={50}>
          <div>Panel 1</div>
        </Panel>
        <WorkbenchResizeHandle direction="vertical" id="test-v-handle" />
        <Panel defaultSize={50}>
          <div>Panel 2</div>
        </Panel>
      </PanelGroup>
    );

    const handle = container.querySelector('#test-v-handle');
    expect(handle).toBeDefined();
    expect(handle?.getAttribute('data-direction')).toBe('vertical');
  });
});
