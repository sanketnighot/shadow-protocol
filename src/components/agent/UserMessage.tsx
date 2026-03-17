type UserMessageProps = {
  content: string;
};

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="ml-auto max-w-2xl rounded-xl rounded-br-md border border-primary/22 bg-[linear-gradient(180deg,rgba(52,28,84,0.4),rgba(24,18,36,0.96))] px-3 py-2.5 text-xs leading-5 text-foreground shadow-[0_12px_32px_rgba(50,20,110,0.18)] sm:text-sm">
      <p className="font-mono text-[9px] tracking-[0.25em] text-primary uppercase">
        You
      </p>
      <p className="mt-1.5">{content}</p>
    </div>
  );
}
