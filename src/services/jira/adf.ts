export interface AdfTextNode {
  type: 'text';
  text: string;
}

export interface AdfParagraphNode {
  type: 'paragraph';
  content?: AdfTextNode[];
}

export interface AdfDoc {
  version: 1;
  type: 'doc';
  content: AdfParagraphNode[];
}

export function textToAdf(text?: string): AdfDoc {
  if (!text || !text.trim()) {
    return {
      version: 1,
      type: 'doc',
      content: [],
    };
  }

  const lines = text.split('\n');
  return {
    version: 1,
    type: 'doc',
    content: lines.map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) {
        return { type: 'paragraph', content: [] };
      }
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed }],
      };
    }),
  };
}
