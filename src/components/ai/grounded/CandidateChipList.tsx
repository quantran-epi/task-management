import React from 'react';
import { Tag, Tooltip, theme } from 'antd';

export interface ChipItem {
  id: string;
  label: string;
  kind?: string | undefined;
  urn?: string | undefined;
}

export interface CandidateChipListProps {
  items: readonly ChipItem[];
  variant: 'candidate' | 'refinement';
  onSelect: (item: ChipItem) => void;
}

export const CandidateChipList: React.FC<CandidateChipListProps> = ({
  items,
  variant,
  onSelect,
}) => {
  const { token } = theme.useToken();

  // Max 3 chips rendered per D-04 / D-07
  const renderedItems = items.slice(0, 3);

  return (
    <div
      className={`candidate-chip-list candidate-chip-list--${variant}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginTop: 8,
      }}
    >
      {renderedItems.map((item) => {
        const handleActivate = (e?: React.SyntheticEvent) => {
          e?.preventDefault();
          e?.stopPropagation();
          onSelect(item);
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleActivate(e);
          }
        };

        if (variant === 'candidate') {
          const chipNode = (
            <Tag
              role="button"
              tabIndex={0}
              aria-label={item.urn ? `${item.label} (${item.kind ?? ''}) ${item.urn}` : item.label}
              onClick={handleActivate}
              onKeyDown={handleKeyDown}
              style={{
                cursor: 'pointer',
                margin: 0,
                padding: '4px 10px',
                borderRadius: token.borderRadiusSM,
                background: token.colorBgContainer,
                borderColor: token.colorInfoBorder ?? token.colorInfo,
                color: token.colorText,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                outline: 'none',
              }}
              className="grounded-candidate-chip"
            >
              <span>{item.label}</span>
              {item.kind && (
                <Tag
                  color="processing"
                  style={{
                    margin: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: '16px',
                    padding: '0 4px',
                  }}
                >
                  {item.kind}
                </Tag>
              )}
            </Tag>
          );

          if (item.urn) {
            return (
              <Tooltip key={item.id} title={item.urn}>
                {chipNode}
              </Tooltip>
            );
          }
          return <React.Fragment key={item.id}>{chipNode}</React.Fragment>;
        }

        // Refinement variant (NO_EVIDENCE / UNSUPPORTED per D-07)
        return (
          <Tag
            key={item.id}
            role="button"
            tabIndex={0}
            aria-label={item.label}
            onClick={handleActivate}
            onKeyDown={handleKeyDown}
            style={{
              cursor: 'pointer',
              margin: 0,
              padding: '4px 10px',
              borderRadius: token.borderRadiusSM,
              background: token.colorFillTertiary,
              borderColor: token.colorBorderSecondary,
              color: token.colorText,
              fontSize: 13,
              fontWeight: 500,
              outline: 'none',
            }}
            className="grounded-refinement-chip"
          >
            {item.label}
          </Tag>
        );
      })}
    </div>
  );
};
