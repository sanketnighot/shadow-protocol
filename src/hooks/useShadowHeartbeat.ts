import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useUiStore } from "@/store/useUiStore";

type ShadowBriefPayload = {
  message: string;
  timestamp: number;
};

export function useShadowHeartbeat() {
  const addNotification = useUiStore((s) => s.addNotification);

  useEffect(() => {
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

    setupListener().catch(console.error);

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [addNotification]);
}
