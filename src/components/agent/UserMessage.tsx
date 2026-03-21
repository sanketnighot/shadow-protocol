import { User } from "lucide-react";
import { FormattedText } from "@/components/agent/FormattedText";

type UserMessageProps = {
  content: string;
};

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex max-w-[85%] sm:max-w-[75%] flex-col items-end gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
          You
        </span>
        <div className="flex size-5 items-center justify-center rounded-sm bg-primary/20 text-primary">
          <User className="size-3" />
        </div>
      </div>
      <div className="border-r-2 border-white/20 bg-transparent pr-4 sm:pr-5 font-mono text-sm leading-relaxed text-foreground/80">
        <FormattedText content={content} />
      </div>
    </div>
  );
}
