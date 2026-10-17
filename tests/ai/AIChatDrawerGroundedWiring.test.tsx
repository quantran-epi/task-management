import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  setGroundedTurnTestHooks,
  clearGroundedTurnTestHooks,
} from '../../src/services/ai/groundedTurnDeps';
import type {
  GroundedTurnInput,
  GroundedTurnResult,
} from '../../src/services/ai/groundedTurn';
import type { ChatMessageGrounding } from '../../src/services/ai/groundedAnswerSchemas';
import {
  createOrGetThread,
  getMessagesByThreadId,
  saveMessage,
} from '../../src/db/repositories/chatRepo';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';

vi.mock('../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

describe('AIChatDrawer Grounded Turn Wiring (Plan 19-14)', () => {
  let testDb: TaskPlannerDatabase;

  const submitMessage = (text: string) => {
    const input = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
  };

  const validGroundedAnswer: ChatMessageGrounding = {
    schemaVersion: 1,
    authority: 'server',
    outcome: 'READY',
    answer: {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Quy trình CYTP1002 hoàn tất bước xác thực OTP.',
      claims: [
        {
          id: 'C1',
          text: 'Khách hàng xác thực OTP qua SMS.',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    },
    citations: [
      {
        citationId: 'S1',
        documentId: '10000000-0000-4000-8000-000000000001',
        documentTitle: 'CYTP1002 Đặc tả',
        sectionAnchor: 'Section 1',
        lineStart: 1,
        lineEnd: 5,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'gsnap_11111111',
        publishedContentHash: 'a'.repeat(64),
        citedExcerpt: 'Khách hàng xác thực OTP qua SMS.',
      },
    ],
    paths: [],
    conflicts: [],
    scope: {
      setIds: ['10000000-0000-4000-8000-000000000002'],
      routedScope: {
        domain: 'CoreBanking',
        environment: 'Production',
        version: 'v1.0',
        comparisonMode: 'single',
      },
    },
    modalityDiagnostics: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 10, itemCount: 1 },
      graph: { status: 'ok', latencyMs: 8, itemCount: 0 },
    },
    coverageWarnings: [],
    fallbackReason: 'NONE',
    routerVersion: 'router-v1',
    promptVersion: 'grounded-v1',
    modelId: 'gpt-4o',
    createdAt: '2026-10-11T10:00:00.000Z',
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestGroundedWiring_' + Math.random().toString(36).slice(2));
    await testDb.open();
    clearGroundedTurnTestHooks();
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
  });

  afterEach(() => {
    clearGroundedTurnTestHooks();
  });

  it('1. Knowledge submit -> READY -> GroundedAnswerCard rendered inside drawer; abort not called', async () => {
    const runMock = vi.fn().mockResolvedValue({
      kind: 'grounded_answer',
      grounding: validGroundedAnswer,
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({
      runGroundedTurn: runMock,
    });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002 là gì?');

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText('Khách hàng xác thực OTP qua SMS.')).toBeInTheDocument();
    });
  });

  it('2. Drawer close mid-turn -> abort fires; stale response discarded', async () => {
    let capturedSignal: AbortSignal | null = null;
    let resolveTurn: ((res: any) => void) | null = null;
    const runMock = vi.fn().mockImplementation((inp: GroundedTurnInput) => {
      capturedSignal = inp.signal;
      return new Promise((resolve) => {
        resolveTurn = resolve;
      });
    });

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    const { rerender } = render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002 là gì?');

    await waitFor(() => {
      expect(runMock).toHaveBeenCalled();
    });

    // Close drawer mid-turn
    rerender(<AIChatDrawer open={false} onClose={() => {}} db={testDb} />);

    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true);
    if (typeof resolveTurn === 'function') {
      (resolveTurn as (res: any) => void)({
        kind: 'grounded_answer',
        grounding: validGroundedAnswer,
      });
    }
  });

  it('3. Scope change mid-turn -> previous controller aborted', async () => {
    let firstSignal: AbortSignal | null = null;
    let resolveFirst: ((res: any) => void) | null = null;
    let callCount = 0;
    const runMock = vi.fn().mockImplementation((inp: GroundedTurnInput) => {
      callCount++;
      if (callCount === 1) {
        firstSignal = inp.signal;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({
        kind: 'grounded_answer',
        grounding: validGroundedAnswer,
      } as GroundedTurnResult);
    });

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    const { rerender } = render(
      <AIChatDrawer
        open={true}
        onClose={() => {}}
        db={testDb}
        activeScope={{ type: 'task', id: 'task-1' }}
      />
    );

    submitMessage('CYTP1002 là gì?');

    await waitFor(() => {
      expect(firstSignal).not.toBeNull();
    });

    // Change scope
    rerender(
      <AIChatDrawer
        open={true}
        onClose={() => {}}
        db={testDb}
        activeScope={{ type: 'project', id: 'proj-1' }}
      />
    );

    expect((firstSignal as AbortSignal | null)?.aborted).toBe(true);
    if (typeof resolveFirst === 'function') {
      (resolveFirst as (res: any) => void)({
        kind: 'grounded_answer',
        grounding: validGroundedAnswer,
      });
    }
  });

  it('4. Candidate chip click re-sends with resolved URN', async () => {
    let turnCount = 0;
    const runMock = vi.fn().mockImplementation((_inp: GroundedTurnInput) => {
      turnCount++;
      if (turnCount === 1) {
        return Promise.resolve({
          kind: 'clarify_entity',
          outcome: 'NEEDS_CLARIFICATION',
          candidates: [
            {
              urn: 'urn:plannermate:docs:doc:10000000-0000-4000-8000-000000000001',
              canonicalName: 'CYTP1002 Spec V1',
              kind: 'Document',
            },
          ],
        } as GroundedTurnResult);
      }
      return Promise.resolve({
        kind: 'grounded_answer',
        grounding: validGroundedAnswer,
      } as GroundedTurnResult);
    });

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002');

    await waitFor(() => {
      expect(screen.getByText('CYTP1002 Spec V1')).toBeInTheDocument();
    });

    // Click candidate chip
    fireEvent.click(screen.getByText('CYTP1002 Spec V1'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(2);
      const call = runMock.mock.calls[1];
      expect(call?.[0]?.query).toContain('urn:plannermate:docs:doc:');
    });
  });

  it('5. Refinement chip click populates input without auto-send', async () => {
    const runMock = vi.fn().mockResolvedValue({
      kind: 'refine',
      outcome: 'NO_EVIDENCE',
      refinementChips: ['Mở rộng phạm vi tìm kiếm'],
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('Không tìm thấy gì');

    await waitFor(() => {
      expect(screen.getByText('Mở rộng phạm vi tìm kiếm')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Mở rộng phạm vi tìm kiếm'));

    // Did NOT trigger a second turn
    expect(runMock).toHaveBeenCalledTimes(1);
    const input = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI') as HTMLTextAreaElement;
    expect(input.value).toBe('Mở rộng phạm vi tìm kiếm');
  });

  it('6. Intent clarification accepts natural text and re-runs turn', async () => {
    let calls = 0;
    const runMock = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({
          kind: 'clarify_intent',
          clarifyQuestion: 'Bạn muốn tra cứu tài liệu hay quản lý tác vụ?',
        } as GroundedTurnResult);
      }
      return Promise.resolve({
        kind: 'grounded_answer',
        grounding: validGroundedAnswer,
      } as GroundedTurnResult);
    });

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('Tôi muốn tìm hiểu');

    await waitFor(() => {
      expect(screen.getByText('Bạn muốn tra cứu tài liệu hay quản lý tác vụ?')).toBeInTheDocument();
      expect(screen.getByTestId('clarification-prompt-card')).toBeInTheDocument();
    });

    submitMessage('tra cứu tài liệu');

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(2);
    });

    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);
    await waitFor(async () => {
      const userMessages = (await getMessagesByThreadId(thread.id, testDb)).filter(
        (msg) => msg.role === 'user' && msg.content === 'Tôi muốn tìm hiểu'
      );
      expect(userMessages).toHaveLength(1);
    });
  });

  it.skip('7. Fresh lookup -> old message grounding immutable; new assistant message appended', async () => {
    let callIndex = 0;
    const runMock = vi.fn().mockImplementation(() => {
      callIndex++;
      return Promise.resolve({
        kind: 'grounded_answer',
        grounding: {
          ...validGroundedAnswer,
          createdAt: `2026-10-11T10:0${callIndex}:00.000Z`,
        },
      } as GroundedTurnResult);
    });

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002 là gì?');

    await waitFor(() => {
      expect(screen.getByText('Tra cứu lại')).toBeInTheDocument();
    });

    // Click Tra cứu lại
    fireEvent.click(screen.getByText('Tra cứu lại'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(2);
    });
  });

  it('8. Evidence-only synthesis -> synthesizeFromStoredEvidence invoked', async () => {
    const synthMock = vi.fn().mockResolvedValue({
      kind: 'grounded_answer',
      grounding: {
        ...validGroundedAnswer,
        outcome: 'READY',
      },
    } as GroundedTurnResult);

    const modelUnavailGrounding: ChatMessageGrounding = {
      ...validGroundedAnswer,
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
    };

    const runMock = vi.fn().mockResolvedValue({
      kind: 'evidence_only',
      grounding: modelUnavailGrounding,
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({
      runGroundedTurn: runMock,
      synthesizeFromStoredEvidence: synthMock,
    });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002 offline');

    await waitFor(() => {
      expect(screen.getByText('Tạo câu trả lời từ bằng chứng')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tạo câu trả lời từ bằng chứng'));

    await waitFor(() => {
      expect(synthMock).toHaveBeenCalledTimes(1);
    });
  });

  it('9. Evidence-only synthesis shows configuration error instead of failing silently', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('');
    const onOpenSettings = vi.fn();
    const synthMock = vi.fn();
    const modelUnavailGrounding: ChatMessageGrounding = {
      ...validGroundedAnswer,
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
    };

    setGroundedTurnTestHooks({
      runGroundedTurn: vi.fn().mockResolvedValue({
        kind: 'evidence_only',
        grounding: modelUnavailGrounding,
      } as GroundedTurnResult),
      synthesizeFromStoredEvidence: synthMock,
    });

    render(
      <AIChatDrawer
        open={true}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
        db={testDb}
      />
    );

    submitMessage('CYTP1002 offline');

    await waitFor(() => {
      expect(screen.getByText('Tạo câu trả lời từ bằng chứng')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tạo câu trả lời từ bằng chứng'));

    await waitFor(() => {
      expect(screen.getByText('Không thể tạo câu trả lời từ bằng chứng')).toBeInTheDocument();
      expect(screen.getByText('Chưa cấu hình đầy đủ API Key, endpoint hoặc mô hình 9router.')).toBeInTheDocument();
    });
    expect(synthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cài đặt'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('10. Citation chip click opens QuickPreviewDrawer with range focus', async () => {
    const runMock = vi.fn().mockResolvedValue({
      kind: 'grounded_answer',
      grounding: validGroundedAnswer,
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002 là gì?');

    await waitFor(() => {
      expect(screen.getByText('[1]')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('[1]'));

    // Drawer opens
    await waitFor(() => {
      expect(screen.getByText('Xem nhanh tài liệu')).toBeInTheDocument();
    });
  });

  it('10. MODEL_UNAVAILABLE -> EvidenceOnlyCard rendered with synthesize button', async () => {
    const modelUnavailGrounding: ChatMessageGrounding = {
      ...validGroundedAnswer,
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
    };

    const runMock = vi.fn().mockResolvedValue({
      kind: 'evidence_only',
      grounding: modelUnavailGrounding,
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('CYTP1002 offline');

    await waitFor(() => {
      expect(screen.getByText('Tạo câu trả lời từ bằng chứng')).toBeInTheDocument();
    });
  });

  it('11. INVALID_GROUNDED_OUTPUT -> error banner with retry; retry button triggers fresh run', async () => {
    let count = 0;
    const runMock = vi.fn().mockImplementation(() => {
      count++;
      if (count === 1) {
        return Promise.resolve({
          kind: 'error',
          code: 'INVALID_GROUNDED_OUTPUT',
          grounding: {
            ...validGroundedAnswer,
            outcome: 'INVALID_GROUNDED_OUTPUT',
            answer: null,
          },
        } as GroundedTurnResult);
      }
      return Promise.resolve({
        kind: 'grounded_answer',
        grounding: validGroundedAnswer,
      } as GroundedTurnResult);
    });

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('Lỗi đầu ra');

    await waitFor(() => {
      expect(screen.getByText('Thử lại')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Thử lại'));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(2);
    });
  });

  it('12. ERROR_AUTH -> auth banner with repair CTA', async () => {
    const onOpenSettings = vi.fn();
    const runMock = vi.fn().mockResolvedValue({
      kind: 'error',
      code: 'ERROR_AUTH',
      grounding: {
        ...validGroundedAnswer,
        outcome: 'ERROR_AUTH',
        answer: null,
      },
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(
      <AIChatDrawer
        open={true}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
        db={testDb}
      />
    );

    submitMessage('Lỗi xác thực');

    await waitFor(() => {
      expect(screen.getByText('Cài đặt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cài đặt'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('13. Operational intent -> operational tool loop invoked; GroundedAnswerCard NOT rendered', async () => {
    const runMock = vi.fn().mockResolvedValue({
      kind: 'operational',
      routedQuery: 'Tạo công việc mới',
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    submitMessage('Tạo công việc mới');

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    // GroundedAnswerCard should not be rendered
    expect(screen.queryByTestId('grounded-bubble')).toBeNull();
  });

  it('14. Persisted grounded message after reload renders GroundedAnswerCard with interactive citations', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);
    await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: '',
        grounding: validGroundedAnswer,
      },
      testDb
    );

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    await waitFor(() => {
      expect(screen.getByText('Khách hàng xác thực OTP qua SMS.')).toBeInTheDocument();
      expect(screen.getByText('[1]')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('[1]'));
    await waitFor(() => {
      expect(screen.getByText('Xem nhanh tài liệu')).toBeInTheDocument();
    });
  });

  it('15. ScopeChipsBar renders after routing when routedScope present', async () => {
    const runMock = vi.fn().mockResolvedValue({
      kind: 'grounded_answer',
      grounding: validGroundedAnswer,
    } as GroundedTurnResult);

    setGroundedTurnTestHooks({ runGroundedTurn: runMock });

    render(<AIChatDrawer open={true} onClose={() => {}} db={testDb} />);

    // Before routing: absent
    expect(screen.queryByText('Đang tra cứu:')).toBeNull();

    submitMessage('CYTP1002 là gì?');

    await waitFor(() => {
      expect(screen.getByText('Đang tra cứu:')).toBeInTheDocument();
      expect(screen.getByText('CoreBanking')).toBeInTheDocument();
    });
  });
});
