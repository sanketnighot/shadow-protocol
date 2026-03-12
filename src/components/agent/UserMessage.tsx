type UserMessageProps = {
  content: string;
};

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="ml-auto max-w-2xl rounded-[24px] rounded-br-lg border border-primary/22 bg-[linear-gradient(180deg,rgba(52,28,84,0.4),rgba(24,18,36,0.96))] px-5 py-4 text-sm leading-6 text-foreground shadow-[0_18px_44px_rgba(50,20,110,0.2)]">
      <p className="font-mono text-[10px] tracking-[0.3em] text-primary uppercase">
        You
      </p>
      <p className="mt-2 sm:text-[15px]">{content}</p>
    </div>
  );
}
