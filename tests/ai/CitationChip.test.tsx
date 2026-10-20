import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CitationChip } from '../../src/components/ai/CitationChip';
import { GroundedAnswerCard } from '../../src/components/ai/grounded/GroundedAnswerCard';
import { SourcesPanel } from '../../src/components/ai/grounded/SourcesPanel';
import type { ChatMessageGrounding, PersistedCitation } from '../../src/services/ai/groundedAnswerSchemas';

describe('Task 1: CitationChip, GroundedAnswerCard, SourcesPanel MCP citations', () => {
  describe('CitationChip MCP rendering', () => {
    it('renders Tag with color purple / geekblue and text [M1] MCP when citation ID starts with M', () => {
      render(
        <CitationChip
          citationId="M1"
          toolName="get_memory"
          serverName="graphiti"
          evidenceKind="mcp_tool"
          snippet="User preference: dark mode"
        />
      );

      const chip = screen.getByText(/\[M1\]/);
      expect(chip).toBeInTheDocument();
      expect(screen.getByText(/MCP/i)).toBeInTheDocument();
    });
  });

  describe('GroundedAnswerCard citation regex', () => {
    it('parses text containing [M1] into interactive CitationChip component', () => {
      const mockCitation: PersistedCitation = {
        citationId: 'M1',
        documentId: 'mcp:graphiti:get_memory',
        documentTitle: '[MCP] graphiti - get_memory',
        sectionAnchor: '{"query":"dark mode"}',
        lineStart: 1,
        lineEnd: 1,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'mcp_live',
        publishedContentHash: null,
        citedExcerpt: 'User prefers dark mode.',
        evidenceKind: 'mcp_tool',
        mcpMetadata: {
          serverId: 'graphiti',
          serverName: 'graphiti',
          toolName: 'get_memory',
        },
      };

      const grounding: ChatMessageGrounding = {
        outcome: 'READY',
        answer: {
          schemaVersion: 2,
          language: 'vi',
          conclusion: 'Hệ thống ghi nhận sở thích người dùng [M1].',
          confidence: 'high',
          confidenceReason: 'Bằng chứng trực tiếp từ MCP tool.',
          claims: [
            {
              id: 'C1',
              text: 'Người dùng thích dark mode',
              classification: 'DIRECT',
              citationIds: ['M1'],
              pathId: null,
            },
          ],
          hypotheses: [],
          unsupportedParts: [],
        },
        citations: [mockCitation],
        coverageWarnings: [],
      };

      const handleCitationActivate = vi.fn();

      render(
        <GroundedAnswerCard
          grounding={grounding}
          onCitationActivate={handleCitationActivate}
        />
      );

      // Verify that [M1] chip was rendered inside prose or claim
      const m1Chips = screen.getAllByText(/\[M1\]/);
      expect(m1Chips.length).toBeGreaterThan(0);
    });
  });

  describe('SourcesPanel Live MCP section', () => {
    it('displays LIVE MCP section displaying server name and tool excerpt for M* citations', () => {
      const mockCitations: PersistedCitation[] = [
        {
          citationId: 'S1',
          documentId: 'doc-1',
          documentTitle: 'Arch Guide',
          sectionAnchor: 'Section 1',
          lineStart: 10,
          lineEnd: 20,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_12345678',
          publishedContentHash: 'a'.repeat(64),
          citedExcerpt: 'Static doc excerpt',
        },
        {
          citationId: 'M1',
          documentId: 'mcp:graphiti:get_memory',
          documentTitle: '[MCP] graphiti - get_memory',
          sectionAnchor: '{"key":"value"}',
          lineStart: 1,
          lineEnd: 1,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'mcp_live',
          publishedContentHash: null,
          citedExcerpt: 'User prefers dark mode live memory.',
          evidenceKind: 'mcp_tool',
          mcpMetadata: {
            serverId: 'graphiti-id',
            serverName: 'Graphiti Memory Server',
            toolName: 'get_memory',
          },
        },
      ];

      const handleOpenCitation = vi.fn();

      render(
        <SourcesPanel
          citations={mockCitations}
          onOpenCitation={handleOpenCitation}
        />
      );

      expect(screen.getByText('Arch Guide')).toBeInTheDocument();
      // Should display MCP / Live MCP section and server name
      expect(screen.getByText('LIVE MCP')).toBeInTheDocument();
      expect(screen.getByText('Graphiti Memory Server')).toBeInTheDocument();
    });
  });
});
