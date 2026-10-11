import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentSetForm } from '../../src/components/knowledge/DocumentSetForm';
import type { DocumentSet, Note } from '../../src/types/models';

describe('DocumentSetForm (D-17, D-18, D-32, D-35)', () => {
  const mockNotes: Note[] = [
    {
      id: 'doc-1',
      title: 'Doc One',
      body: 'Content 1',
      type: 'document',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'doc-2',
      title: 'Doc Two',
      body: 'Content 2',
      type: 'document',
      isPinned: false,
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
    },
  ];

  const parentSet: DocumentSet = {
    id: 'parent-set-123',
    name: 'Parent Base Set',
    documentIds: ['doc-1'],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    scope: { domain: 'Core', environment: null, version: null },
    aliases: [],
    relations: [],
    isBase: true,
    presentationRevision: 0,
    preset: 'Chung',
  };

  it('1. "Chung" preset submits with isBase: true, no environment/version', async () => {
    const handleSave = vi.fn();
    render(
      <DocumentSetForm
        notes={mockNotes}
        onSave={handleSave}
      />
    );

    // Enter set name
    const nameInput = screen.getByRole('textbox', { name: /Tên bộ tài liệu/i });
    fireEvent.change(nameInput, { target: { value: 'Chung Knowledge Set' } });

    // Submit
    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    const saved = handleSave.mock.calls[0]![0];
    expect(saved.preset).toBe('Chung');
    expect(saved.isBase).toBe(true);
    expect(saved.scope.environment).toBeNull();
    expect(saved.scope.version).toBeNull();
    expect(saved.scope.domain).toBe('General');
  });

  it('2. "Theo môi trường" preset shows environment select; submit fails without environment', async () => {
    const handleSave = vi.fn();
    render(
      <DocumentSetForm
        notes={mockNotes}
        onSave={handleSave}
      />
    );

    // Name set
    const nameInput = screen.getByRole('textbox', { name: /Tên bộ tài liệu/i });
    fireEvent.change(nameInput, { target: { value: 'Env Set' } });

    // Select "Theo môi trường" preset
    const envRadio = screen.getByRole('radio', { name: /Theo môi trường/i });
    fireEvent.click(envRadio);

    // Try submit without selecting environment -> should fail
    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
    fireEvent.click(saveBtn);

    expect(handleSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Vui lòng chọn hoặc nhập môi trường/i)).toBeInTheDocument();
  });

  it('3. "Bổ sung" preset requires relation + parent setId; submit writes relations[0] = {kind, targetSetId}', async () => {
    const handleSave = vi.fn();
    render(
      <DocumentSetForm
        notes={mockNotes}
        availableSets={[parentSet]}
        onSave={handleSave}
      />
    );

    // Set name
    const nameInput = screen.getByRole('textbox', { name: /Tên bộ tài liệu/i });
    fireEvent.change(nameInput, { target: { value: 'Supplement Set' } });

    // Select "Bổ sung"
    const boSungRadio = screen.getByRole('radio', { name: /Bổ sung/i });
    fireEvent.click(boSungRadio);

    // Choose EXTENDS
    const extendsRadio = screen.getByRole('radio', { name: /EXTENDS/i });
    fireEvent.click(extendsRadio);

    // Click save without selecting parent -> fails
    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
    fireEvent.click(saveBtn);
    expect(handleSave).not.toHaveBeenCalled();

    // Select parent set via ant select
    const parentSelect = screen.getByRole('combobox', { name: /Parent set selector/i });
    fireEvent.mouseDown(parentSelect);

    await waitFor(() => {
      expect(screen.getByText('Parent Base Set')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Parent Base Set'));

    // Save again -> succeeds
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    const saved = handleSave.mock.calls[0]![0];
    expect(saved.preset).toBe('BoSung');
    expect(saved.relations).toEqual([
      { kind: 'EXTENDS', targetSetId: 'parent-set-123' },
    ]);
  });

  it('4. Advanced panel closed by default (first render); opens on click', () => {
    render(
      <DocumentSetForm
        notes={mockNotes}
        onSave={vi.fn()}
      />
    );

    // Collapse header is in document
    const collapseHeader = screen.getByText(/Thiết lập nâng cao/i);
    expect(collapseHeader).toBeInTheDocument();

    // Aliases input shouldn't be visible before clicking collapse
    expect(screen.queryByRole('textbox', { name: /Nhập bí danh/i })).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(collapseHeader);

    // Aliases input now visible
    expect(screen.getByRole('textbox', { name: /Nhập bí danh/i })).toBeInTheDocument();
  });

  it('5. Aliases input accepts chips; submit stores aliases: ["foo", "bar"]', async () => {
    const handleSave = vi.fn();
    render(
      <DocumentSetForm
        notes={mockNotes}
        onSave={handleSave}
      />
    );

    const nameInput = screen.getByRole('textbox', { name: /Tên bộ tài liệu/i });
    fireEvent.change(nameInput, { target: { value: 'Aliased Set' } });

    // Open collapse
    fireEvent.click(screen.getByText(/Thiết lập nâng cao/i));

    const aliasInput = screen.getByRole('textbox', { name: /Nhập bí danh/i });
    const addBtn = screen.getByRole('button', { name: /Thêm bí danh/i });

    // Add 'foo'
    fireEvent.change(aliasInput, { target: { value: 'foo' } });
    fireEvent.click(addBtn);

    // Add 'bar'
    fireEvent.change(aliasInput, { target: { value: 'bar' } });
    fireEvent.click(addBtn);

    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();

    // Save
    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    const saved = handleSave.mock.calls[0]![0];
    expect(saved.aliases).toEqual(['foo', 'bar']);
  });

  it('6. Form reload with existing DocumentSet renders preset radio pre-selected per preset field', () => {
    const existingSet: DocumentSet = {
      id: 'existing-123',
      name: 'Existing Module Set',
      documentIds: ['doc-1'],
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      scope: { domain: 'CreditModule', environment: null, version: null },
      aliases: ['credit'],
      relations: [],
      isBase: false,
      presentationRevision: 3,
      preset: 'TheoModule',
    };

    render(
      <DocumentSetForm
        notes={mockNotes}
        initialSet={existingSet}
        onSave={vi.fn()}
      />
    );

    const theoModuleRadio = screen.getByRole('radio', { name: /Theo module/i });
    expect(theoModuleRadio).toBeChecked();

    const domainInput = screen.getByRole('textbox', { name: /Domain input/i });
    expect(domainInput).toHaveValue('CreditModule');
  });
});
