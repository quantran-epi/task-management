import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostProfileImportChecklist } from '../../../src/components/settings/PostProfileImportChecklist';
import * as ariaLive from '../../../src/components/common/AriaLiveRegion';
import { getMachineSpecificFields, getSecretFields } from '../../../src/services/configProfiles/catalog';
import type { z } from 'zod';
import type { ConfigProfileEnvelopeSchema } from '../../../src/validation/configProfileSchemas';

type Envelope = z.infer<typeof ConfigProfileEnvelopeSchema>;

describe('PostProfileImportChecklist', () => {
  let announceSpy: ReturnType<typeof vi.spyOn>;

  const envelope: Envelope = {
    app: 'taskmate-config-profile',
    profileSchemaVersion: 1,
    exportedAt: '2026-11-19T10:00:00.000Z',
    profile: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Profile nhận được',
      createdAt: '2026-11-19T09:00:00.000Z',
      updatedAt: '2026-11-19T09:00:00.000Z',
      config: {
        settings: { github_owner: 'octocat' },
        capacityRules: [],
        capacityOverrides: [],
        secretFields: { github_pat: '', ninerouter_api_key: '' },
      },
    },
  };

  beforeEach(() => {
    announceSpy = vi.spyOn(ariaLive, 'announceToScreenReader');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('separates secret re-entry from machine-specific review, excludes Telegram and announces', () => {
    const onClose = vi.fn();
    render(
      <PostProfileImportChecklist
        envelope={envelope}
        blankSecretFields={['github_pat', 'ninerouter_api_key']}
        visible
        onClose={onClose}
      />
    );

    const secrets = document.querySelector('[data-checklist-group="secrets"]');
    const machine = document.querySelector('[data-checklist-group="machine-specific"]');
    expect(secrets).not.toBeNull();
    expect(machine).not.toBeNull();

    for (const field of Object.keys(envelope.profile.config.secretFields)) {
      expect(secrets?.querySelector(`[data-field="${field}"]`)).not.toBeNull();
    }
    const undeclared = getSecretFields().find(
      (field) => !(field in envelope.profile.config.secretFields)
    );
    if (undeclared) {
      expect(secrets?.querySelector(`[data-field="${undeclared}"]`)).toBeNull();
    }
    for (const field of getMachineSpecificFields()) {
      expect(machine?.querySelector(`[data-field="${field}"]`)).not.toBeNull();
    }
    expect(machine?.querySelector('[data-field="ghostDevConfig.claudePath"]')).not.toBeNull();
    expect(screen.queryByText(/telegram/i)).not.toBeInTheDocument();
    expect(announceSpy).toHaveBeenCalled();
  });

  it('can be hidden by the parent', () => {
    const { rerender } = render(
      <PostProfileImportChecklist
        envelope={envelope}
        blankSecretFields={[]}
        visible
        onClose={vi.fn()}
      />
    );
    expect(screen.getAllByText(/cần rà soát/).length).toBeGreaterThan(0);

    rerender(
      <PostProfileImportChecklist
        envelope={envelope}
        blankSecretFields={[]}
        visible={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/cần rà soát/)).not.toBeInTheDocument();
  });
});
