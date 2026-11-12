import React from 'react';
import { Button, Popover, Typography } from 'antd';
import type { AgentRunState, TeamRunPhase } from '../../../types/aiOffice';
import {
  AgentStatusRow,
  type AgentAttributionAgent,
} from './AgentAttributionRow';

/**
 * 37.1 D-21: the phase's own verb. Deliberately five entries and no fallback entry —
 * `idle`, `ready` and `awaiting-mutation-approval` render nothing at all (the mutation
 * gate has its own card).
 */
export const PHASE_ACTIVITY_VERB: Partial<Record<TeamRunPhase, string>> = {
  'lead-thinking': 'đang phân tích',
  'awaiting-plan': 'đang lập kế hoạch',
  'batch-running': 'đang làm việc',
  'lead-synthesizing': 'đang tổng hợp',
  'awaiting-budget': 'đang chờ ngân sách',
};

const WORKING = 'đang làm việc';
const WAITING_BUDGET = 'đang chờ ngân sách';

export interface TeamActivityIndicatorProps {
  phase: TeamRunPhase;
  agents: AgentRunState[];
  agentDirectory: Map<string, AgentAttributionAgent>;
  leadId: string | undefined;
  onStopAgent?: ((agentId: string) => void) | undefined;
}

/**
 * 37.1 D-20/D-22: one inline line at the end of the transcript, Slack-style. No bubble,
 * no spinner, no second line. Clicking it opens the per-agent detail popover, which is
 * also the only Stop affordance for a QUEUED agent once the live bubbles are gone.
 *
 * T-37.1-06-02: reads `status` and `steps` only — never the partial answer text, so a
 * half-written reply cannot leak through this surface.
 */
export const TeamActivityIndicator: React.FC<TeamActivityIndicatorProps> = ({
  phase,
  agents,
  agentDirectory,
  leadId,
  onStopAgent,
}) => {
  const nameOf = (agentId: string) => agentDirectory.get(agentId)?.name ?? agentId;

  // D-20: only an agent that is actually doing something claims to be doing it. A queued
  // agent is not, so it stays out of the working line (but stays in the popover, where it
  // can be stopped).
  const active = agents.filter((row) => row.status === 'running' || row.status === 'paused');
  const pending = agents.filter(
    (row) => row.status === 'queued' || row.status === 'running' || row.status === 'paused'
  );
  if (pending.length === 0) return null;

  const line =
    active.length > 0
      ? active
          .map((row) => {
            const verb =
              row.status === 'paused'
                ? WAITING_BUDGET
                : row.agentId === leadId
                  ? PHASE_ACTIVITY_VERB[phase] ?? WORKING
                  : WORKING;
            return `${nameOf(row.agentId)} ${verb}`;
          })
          .join(' · ')
      : // Every pending agent is queued: nothing is running, so say that instead of
        // claiming work — but keep the trigger, or the queued agent has no Stop.
        pending.map((row) => `${nameOf(row.agentId)} đang xếp hàng`).join(' · ');

  const content = (
    <div
      data-testid="team-activity-popover"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}
    >
      {pending.map((row) => {
        const agent: AgentAttributionAgent = agentDirectory.get(row.agentId) ?? {
          agentId: row.agentId,
          name: row.agentId,
          role: '',
          isLead: row.agentId === leadId,
          color: '#6c707e',
        };
        return (
          <div key={row.agentId} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              {agent.name}
            </Typography.Text>
            {row.steps && row.steps.length > 0 ? (
              row.steps.map((step) => (
                <Typography.Text key={step.id} type="secondary" style={{ fontSize: 11 }}>
                  {step.label}
                </Typography.Text>
              ))
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Chưa có bước nào
              </Typography.Text>
            )}
            <AgentStatusRow
              agent={agent}
              status={row.status}
              {...(onStopAgent ? { onStop: () => onStopAgent(row.agentId) } : {})}
              idPrefix="indicator"
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <Popover
      content={content}
      title={null}
      trigger="click"
      placement="topLeft"
      getPopupContainer={(node) => node.parentElement || document.body}
    >
      <Button
        type="text"
        size="small"
        data-testid="team-activity-indicator"
        style={{ fontSize: 12, height: 22, padding: '0 6px', alignSelf: 'flex-start' }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {line}
        </Typography.Text>
      </Button>
    </Popover>
  );
};

export default TeamActivityIndicator;
