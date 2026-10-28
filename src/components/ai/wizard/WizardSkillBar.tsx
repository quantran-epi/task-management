import React, { useRef, useState } from 'react';
import { Button, Tooltip, theme } from 'antd';
import type { WizardSkill } from '../../../services/ai/wizardSchemas';

export interface WizardSkillBarProps {
  projectScoped: boolean;
  activeSession?: boolean;
  selectedSkill?: WizardSkill | undefined;
  onActivate: (skill: Exclude<WizardSkill, 'SOLUTION'>) => void;
}

type Entry = {
  skill: Exclude<WizardSkill, 'SOLUTION'>;
  label: string;
  ariaLabel: string;
};

const ENTRIES: Entry[] = [
  { skill: 'PL02', label: '📋 Soạn PL02', ariaLabel: 'Soạn PL02 — Tài liệu Đặc tả Chức năng' },
  { skill: 'PL03', label: '⚙️ Soạn PL03', ariaLabel: 'Soạn PL03 — Tài liệu Triển khai' },
  { skill: 'PL07', label: '🔍 Checklist PL07', ariaLabel: 'Checklist PL07 — Checklist Review Code' },
  { skill: 'CAB', label: '📢 Tờ trình CAB', ariaLabel: 'Tờ trình CAB — Tóm tắt thay đổi' },
];

export const WizardSkillBar: React.FC<WizardSkillBarProps> = ({
  projectScoped,
  activeSession = false,
  selectedSkill,
  onActivate,
}) => {
  const { token } = theme.useToken();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const gateTitle = activeSession
    ? 'Đang trong phiên wizard. Hãy hoàn tất hoặc hủy phiên hiện tại.'
    : 'Chọn phạm vi Dự án để dùng wizard tài liệu.';

  const moveFocus = (index: number) => {
    const next = (index + ENTRIES.length) % ENTRIES.length;
    setFocusIndex(next);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      aria-label="Thanh chọn wizard tài liệu"
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '0 0 8px',
        scrollbarWidth: 'thin',
      }}
    >
      {ENTRIES.map((entry, index) => {
        const gated = !projectScoped || activeSession;
        return (
          <Tooltip key={entry.skill} title={gated ? gateTitle : undefined}>
            <Button
              ref={(node) => { buttonRefs.current[index] = node; }}
              size="small"
              shape="round"
              type={selectedSkill === entry.skill ? 'primary' : 'default'}
              aria-label={entry.ariaLabel}
              aria-disabled={gated ? 'true' : undefined}
              tabIndex={focusIndex === index ? 0 : -1}
              onFocus={() => setFocusIndex(index)}
              onClick={() => {
                if (!gated) onActivate(entry.skill);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus(index + 1);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(index - 1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  moveFocus(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  moveFocus(ENTRIES.length - 1);
                } else if ((event.key === 'Enter' || event.key === ' ') && gated) {
                  event.preventDefault();
                }
              }}
              style={{
                flex: '0 0 auto',
                minHeight: 28,
                fontWeight: 600,
                color: selectedSkill === entry.skill ? undefined : token.colorText,
              }}
            >
              {entry.label}
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
};
