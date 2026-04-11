interface CoachingDisplayProps {
  message: string | null;
  fallbackMessage: string;
}

type Token = { bold: boolean; italic: boolean; text: string };

function parseInlineMarkdown(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|_(.+?)_|\*(.+?)\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ bold: false, italic: false, text: text.slice(cursor, match.index) });
    }
    if (match[2] !== undefined) {
      tokens.push({ bold: true, italic: true, text: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ bold: true, italic: false, text: match[3] });
    } else if (match[4] !== undefined || match[5] !== undefined) {
      tokens.push({ bold: false, italic: true, text: match[4] ?? match[5] });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    tokens.push({ bold: false, italic: false, text: text.slice(cursor) });
  }

  return tokens;
}

export default function CoachingDisplay({ message, fallbackMessage }: CoachingDisplayProps) {
  const text = message ?? fallbackMessage;
  const tokens = parseInlineMarkdown(text);

  let wordIndex = 0;
  const rendered: React.ReactNode[] = [];

  for (const token of tokens) {
    const parts = token.text.split(/(\s+)/);
    const spans = parts.map((part) => {
      const delay = Math.min(wordIndex * 40, 800);
      if (!/\s/.test(part)) wordIndex++;
      return (
        <span
          key={`${wordIndex}-${part}`}
          className="coaching-word-fade"
          style={{ animationDelay: `${delay}ms` }}
        >
          {part}
        </span>
      );
    });

    if (token.bold && token.italic) {
      rendered.push(<strong key={`tok-${rendered.length}`}><em>{spans}</em></strong>);
    } else if (token.bold) {
      rendered.push(<strong key={`tok-${rendered.length}`}>{spans}</strong>);
    } else if (token.italic) {
      rendered.push(<em key={`tok-${rendered.length}`}>{spans}</em>);
    } else {
      rendered.push(...spans);
    }
  }

  return (
    <p className="text-base text-content-secondary leading-relaxed max-w-xl">
      {rendered}
    </p>
  );
}
