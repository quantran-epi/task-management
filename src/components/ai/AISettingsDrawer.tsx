import React, { useState } from 'react';
import { Button, Collapse, CollapsePanel, Modal } from '../ui';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { NineRouterConfigCard } from '../settings/NineRouterConfigCard';
import { KnowledgeServerConfigCard } from '../settings/KnowledgeServerConfigCard';
import { McpConfigCard } from '../settings/McpConfigCard';
import { GraphitiSqlConfigCard } from '../settings/GraphitiSqlConfigCard';
import { OracleAiToolConfigCard } from '../settings/OracleAiToolConfigCard';
import { SshConfigCard } from '../settings/SshConfigCard';
import { SshFsAiToolConfigCard } from '../settings/SshFsAiToolConfigCard';
import { AiToolCatalogCard } from '../settings/AiToolCatalogCard';
import { GlobalConventionsCard } from '../settings/GlobalConventionsCard';

export interface AISettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase | undefined;
  standalone?: boolean | undefined;
}

interface SettingsGroup {
  label: string;
  header: string;
  render: (db: TaskPlannerDatabase) => React.ReactNode;
}

// Locked order from D-09 / 51-UI-SPEC. Global conventions stays inside the Provider card.
const GROUPS: SettingsGroup[] = [
  {
    label: 'Provider',
    header: 'NineRouter',
    render: (db) => (
      <>
        <NineRouterConfigCard db={db} />
        <GlobalConventionsCard db={db} />
      </>
    ),
  },
  { label: 'Knowledge Server', header: 'Knowledge Server', render: () => <KnowledgeServerConfigCard /> },
  { label: 'MCP', header: 'MCP servers', render: (db) => <McpConfigCard db={db} /> },
  { label: 'Graphiti', header: 'Graphiti', render: (db) => <GraphitiSqlConfigCard db={db} /> },
  { label: 'Oracle SQLcl', header: 'Oracle SQLcl', render: (db) => <OracleAiToolConfigCard db={db} /> },
  { label: 'SSH File System', header: 'SSH File System', render: (db) => <SshFsAiToolConfigCard db={db} /> },
  { label: 'Tool Catalog', header: 'Tool Catalog', render: (db) => <AiToolCatalogCard db={db} /> },
];

const STANDALONE_GROUPS: SettingsGroup[] = [
  ...GROUPS.slice(0, 5),
  { label: 'SSH Connections', header: 'SSH Connections', render: (db) => <SshConfigCard db={db} /> },
  ...GROUPS.slice(5),
];

export const AISettingsDrawerBody: React.FC<{
  db?: TaskPlannerDatabase | undefined;
  standalone?: boolean | undefined;
}> = ({ db = defaultDb, standalone = false }) => {
  const groups = standalone ? STANDALONE_GROUPS : GROUPS;
  const [activeIndex, setActiveIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const group = groups[activeIndex] ?? groups[0]!;

  const selectGroup = (index: number) => {
    setActiveIndex(index);
    setCollapsed(false);
  };

  return (
    <div style={{ display: 'flex', minHeight: 0, height: '100%' }}>
      <nav
        aria-label="Cài đặt AI"
        style={{ width: 190, flex: '0 0 190px', borderRight: '1px solid var(--border)', padding: 'var(--spacing-sm, 8px) 0' }}
      >
        {groups.map((item, index) => (
          <Button
            key={item.label}
            type="text"
            block
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => selectGroup(index)}
            style={{ justifyContent: 'flex-start', borderRadius: 0 }}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--spacing-md, 16px)' }}>
        <Collapse
          activeKey={collapsed ? [] : [group.header]}
          onChange={(keys) => setCollapsed(!Array.isArray(keys) || keys.length === 0)}
        >
          <CollapsePanel header={group.header} key={group.header} forceRender>
            {group.render(db)}
          </CollapsePanel>
        </Collapse>
      </div>
    </div>
  );
};

export const AISettingsDrawer: React.FC<AISettingsDrawerProps> = ({
  open,
  onClose,
  db = defaultDb,
  standalone = false,
}) => {
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const wasOpenRef = React.useRef(false);

  // Capture during render: the Modal autofocuses its panel in a layout effect,
  // so an effect here would record the panel instead of the gear trigger.
  if (open && !wasOpenRef.current) {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  return (
    <Modal
      title="AI Settings · tất cả"
      width="calc(100vw - 48px)"
      style={{ top: 24, maxWidth: 1200 }}
      styles={{ body: { padding: 0, height: 'min(72vh, 760px)' } }}
      mask
      open={open}
      onCancel={(event) => {
        // Event type differs by close path (mouse, keyboard); route every path through
        // the same callback so React state and focus restoration stay in one place.
        void event;
        onClose();
        queueMicrotask(() => triggerRef.current?.focus());
      }}
      afterClose={() => triggerRef.current?.focus()}
      closeIcon={<span aria-label="Đóng Cài đặt AI">✕</span>}
      destroyOnHidden
      footer={null}
    >
      <AISettingsDrawerBody db={db} standalone={standalone} />
    </Modal>
  );
};
