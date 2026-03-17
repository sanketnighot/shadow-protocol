import { memo } from "react";

type FormattedTextProps = { content: string };

function parseInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <strong key={key++} className="font-semibold text-foreground">
        {match[1]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : [text];
}

export const FormattedText = memo(function FormattedText({ content }: FormattedTextProps) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const paragraphs = trimmed.split(/\n\n+/);
  return (
    <div className="space-y-2 text-xs leading-relaxed text-foreground/88 sm:text-sm">
      {paragraphs.map((para, i) => {
        const lines = para.split("\n").filter(Boolean);
        const firstLine = lines[0] ?? "";
        const isList =
          lines.length > 1 &&
          lines.every((l) => /^\s*[-*•]\s/.test(l) || /^\s*\d+\.\s/.test(l));

        if (isList) {
          return (
            <ul key={i} className="list-none space-y-1.5 pl-0">
              {lines.map((line, j) => {
                const bullet = line.replace(/^\s*[-*•]\s*|\s*\d+\.\s*/, "").trim();
                return (
                  <li key={j} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{parseInlineFormatting(bullet)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p key={i} className="leading-7">
            {lines.length === 1
              ? parseInlineFormatting(firstLine)
              : lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {parseInlineFormatting(line)}
                  </span>
                ))}
          </p>
        );
      })}
    </div>
  );
});
