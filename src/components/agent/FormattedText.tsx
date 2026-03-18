import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type FormattedTextProps = { content: string };

export const FormattedText = memo(function FormattedText({ content }: FormattedTextProps) {
  if (!content.trim()) return null;

  return (
    <div className="markdown-content text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 mt-6 text-2xl font-bold tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-5 text-xl font-bold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-lg font-bold tracking-tight first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-4 last:mb-0 leading-7">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 ml-4 list-disc space-y-2">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 ml-4 list-decimal space-y-2">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em] text-primary">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-6 border-white/10" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
