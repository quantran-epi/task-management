import React, { useState } from 'react';
import { Button, Card, Space, theme } from 'antd';

export type GapQuestionOutcome = 'open' | 'answered' | 'omitted' | 'unknown';

export interface GapFillQuestion {
  id: string;
  topic: string;
  description: string;
  templateSection: string;
  suggestions?: readonly string[] | undefined;
  evidenceSources?: readonly string[] | undefined;
  answer: string | null;
  outcome: GapQuestionOutcome;
}

export interface GapFillQuestionCardProps {
  question: GapFillQuestion;
  onSuggestion: (questionId: string, suggestion: string) => void;
  onSkip: (questionId: string, outcome: 'omitted' | 'unknown') => void;
}

function evidenceCopy(sources: readonly string[]): string | null {
  if (sources.length === 0) return null;
  const visible = sources.slice(0, 3);
  const remainder = sources.length - visible.length;
  return `Dựa trên ${sources.length} nguồn đã tra cứu: ${visible.join(', ')}${remainder > 0 ? ` và ${remainder} nguồn khác` : ''}`;
}

export const GapFillQuestionCard: React.FC<GapFillQuestionCardProps> & {
  stackStyle: React.CSSProperties;
} = ({ question, onSuggestion, onSkip }) => {
  const { token } = theme.useToken();
  const [skipped, setSkipped] = useState(false);

  if (question.outcome !== 'open') {
    const summary = question.outcome === 'answered'
      ? `Đã trả lời: ${question.answer ?? '(chưa cung cấp)'}`
      : `Đã bỏ qua: ${question.answer ?? '(chưa cung cấp)'}`;
    return (
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div role="status" aria-live="polite" style={{ color: token.colorText, fontSize: 14, lineHeight: 1.5 }}>
          {summary}
        </div>
      </Card>
    );
  }

  if (skipped) {
    return <div role="status">Đã bỏ qua: {question.answer ?? '(chưa cung cấp)'}</div>;
  }

  const sourceNote = evidenceCopy(question.evidenceSources ?? []);
  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <h3 style={{ margin: 0, color: token.colorText, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
          Cần làm rõ: {question.topic}
        </h3>
        <p style={{ margin: 0, color: token.colorText, fontSize: 14, lineHeight: 1.5 }}>
          {question.description}
        </p>
        <span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
          Mục biểu mẫu: {question.templateSection}
        </span>
        <span style={{ color: token.colorTextSecondary, fontSize: 14, lineHeight: 1.5 }}>
          Nhập câu trả lời hoặc chọn gợi ý bên dưới
        </span>
        {(question.suggestions?.length ?? 0) > 0 && (
          <Space size={[8, 8]} wrap>
            {question.suggestions?.map((suggestion) => (
              <Button
                key={suggestion}
                size="small"
                shape="round"
                onClick={() => onSuggestion(question.id, suggestion)}
                style={{ minHeight: 28, fontWeight: 600 }}
              >
                {suggestion}
              </Button>
            ))}
          </Space>
        )}
        {sourceNote && (
          <span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
            {sourceNote}
          </span>
        )}
        <Button type="text" size="small" onClick={() => { setSkipped(true); onSkip(question.id, 'omitted'); }} style={{ alignSelf: 'flex-start', minHeight: 28 }}>
          Bỏ qua mục này
        </Button>
      </Space>
    </Card>
  );
};

GapFillQuestionCard.stackStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
};
