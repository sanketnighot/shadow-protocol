import { useUiStore } from "@/store/useUiStore";

export function useToast() {
  const addNotification = useUiStore((state) => state.addNotification);

  return {
    success: (title: string, description = "") => {
      addNotification({
        title,
        description,
        type: "success",
        createdAtLabel: "Just now",
      });
    },
    info: (title: string, description = "") => {
      addNotification({
        title,
        description,
        type: "info",
        createdAtLabel: "Just now",
      });
    },
    warning: (title: string, description = "") => {
      addNotification({
        title,
        description,
        type: "warning",
        createdAtLabel: "Just now",
      });
    },
  };
}
