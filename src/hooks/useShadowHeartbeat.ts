import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logError } from "@/lib/logger";
import { useUiStore } from "@/store/useUiStore";

type ShadowBriefPayload = {
  message: string;
  timestamp: number;
};

export function useShadowHeartbeat() {
  const addNotification = useUiStore((s) => s.addNotification);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    let unlisten: UnlistenFn | null = null;

    async function setupListener() {
      unlisten = await listen<ShadowBriefPayload>("shadow_brief_ready", (event) => {
        const { message } = event.payload;
        addNotification({
          title: "Shadow Brief",
          description: message,
          type: "info",
          createdAtLabel: "Just now",
        });
      });
    }

    setupListener().catch((error) => logError("Failed to listen for shadow heartbeat", error));

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [addNotification]);
}
