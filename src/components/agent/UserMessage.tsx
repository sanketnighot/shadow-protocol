type UserMessageProps = {
  content: string;
};

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="ml-auto max-w-xl rounded-[28px] rounded-br-md border border-primary/25 bg-primary/15 px-5 py-4 text-sm leading-6 text-foreground">
      <p className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">You</p>
      <p className="mt-2">{content}</p>
    </div>
  );
}
