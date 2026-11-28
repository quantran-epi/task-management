import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeAppHolder } from '../ui';
import { SystemTable } from './SystemTable';

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));

const sourceUrl = 'https://github.com/acme/web.git';
const gitOpsUrl = 'git@github.com:acme/web-gitops.git';

const system = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Web app',
  code: 'WEB',
  type: 'LOGICAL_GROUP',
  parentId: null,
  gitSourceUrl: sourceUrl,
  gitOpsUrl,
  createdAt: '2026-11-28T10:00:00.000Z',
  updatedAt: '2026-11-28T10:00:00.000Z',
} as any;

function renderTable() {
  return render(
    <ThemeAppHolder>
      <SystemTable
        systems={[system]}
        onAddSubsystem={vi.fn()}
        onEditSystem={vi.fn()}
        onDeleteSystem={vi.fn()}
      />
    </ThemeAppHolder>
  );
}

describe('SystemTable git links', () => {
  it('keeps https href and renders SCP links as https href with short label', () => {
    renderTable();
    const source = screen.getByRole('link', { name: 'https://github.com/acme/web' });
    const gitops = screen.getByRole('link', { name: 'github.com/acme/web-gitops' });

    expect(source).toHaveAttribute('href', sourceUrl);
    expect(gitops).toHaveAttribute('href', 'https://github.com/acme/web-gitops.git');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
