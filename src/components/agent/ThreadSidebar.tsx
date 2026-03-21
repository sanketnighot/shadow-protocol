import { MessageSquareMore, MessageSquarePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Thread } from "@/store/useAgentThreadStore";
import { useAgentThreadStore } from "@/store/useAgentThreadStore";

function formatThreadTime(updatedAt: number): string {
  const diff = Date.now() - updatedAt;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString();
}

function getThreadPreview(thread: Thread): string {
  const lastMessage = thread.messages[thread.messages.length - 1];
  const firstBlock = lastMessage?.blocks[0];

  if (!lastMessage || !firstBlock) {
    return "Start a new conversation";
  }

  if (firstBlock.type === "text") {
    return firstBlock.content;
  }
  if (firstBlock.type === "opportunity") {
    return firstBlock.title;
  }
  if (firstBlock.type === "toolResult") {
    return firstBlock.toolName;
  }
  if (firstBlock.type === "approvalRequest") {
    return firstBlock.message.slice(0, 48);
  }
  return "Start a new conversation";
}

function ThreadItem({
  thread,
  isActive,
  canDelete,
  onSelect,
  onDelete,
}: {
  thread: Thread;
  isActive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-[24px] border px-4 py-3.5 text-left transition-all duration-300",
        isActive
          ? "border-primary/20 bg-primary/10 shadow-[0_8px_30px_rgba(139,92,246,0.12)]"
          : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5 hover:shadow-lg",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={cn(
          "absolute inset-y-3 left-0 w-1 rounded-r-full bg-transparent transition-colors",
          isActive && "bg-primary shadow-[0_0_12px_rgba(139,92,246,0.8)]",
        )}
      />
      <div className="min-w-0 flex-1 pl-1">
        <div className="flex items-center justify-between gap-3">
          <p className={cn("truncate text-sm font-semibold", isActive ? "text-primary" : "text-foreground")}>
            {thread.title ?? "New chat"}
          </p>
          <p className="shrink-0 text-[10px] tracking-[0.18em] text-muted uppercase">
            {formatThreadTime(thread.updatedAt)}
          </p>
        </div>
        <p className="mt-1 truncate text-xs font-medium leading-5 text-muted">
          {getThreadPreview(thread)}
        </p>
      </div>
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Delete thread"
          className="size-6 shrink-0 rounded-full opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </div>
  );
}

type ThreadSidebarProps = {
  onClose?: () => void;
};

export function ThreadSidebar({ onClose }: ThreadSidebarProps) {
  const threads = useAgentThreadStore((state) => state.threads);
  const activeThreadId = useAgentThreadStore((state) => state.activeThreadId);
  const createThread = useAgentThreadStore((state) => state.createThread);
  const setActiveThreadId = useAgentThreadStore((state) => state.setActiveThreadId);
  const deleteThread = useAgentThreadStore((state) => state.deleteThread);

  const handleSelect = (id: string) => {
    setActiveThreadId(id);
    onClose?.();
  };

  const handleCreate = () => {
    createThread();
    onClose?.();
  };

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-[32px] border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="shrink-0 border-b border-border px-5 pb-5 pt-6 bg-linear-to-b from-white/[0.02] to-transparent">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
              Threads
            </p>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {threads.length} conversations
            </p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-2xl border border-border bg-surface-elevated text-muted shadow-inner">
            <MessageSquareMore className="size-4" />
          </div>
        </div>
        <Button
          type="button"
          className="mt-5 h-12 w-full justify-start gap-3 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
          onClick={handleCreate}
        >
          <MessageSquarePlus className="size-4" />
          New conversation
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
        <nav className="space-y-1" aria-label="Chat threads">
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              canDelete={threads.length > 1}
              onSelect={() => handleSelect(thread.id)}
              onDelete={() => deleteThread(thread.id)}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
