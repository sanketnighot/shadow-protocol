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
        <div className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-primary">
          <User className="size-3" />
        </div>
      </div>
      <div className="rounded-[24px] rounded-tr-[8px] bg-linear-to-br from-primary to-[#5b21b6] px-5 py-3.5 text-sm leading-relaxed text-white shadow-lg shadow-primary/20">
        <FormattedText content={content} />
      </div>
    </div>
  );
}
