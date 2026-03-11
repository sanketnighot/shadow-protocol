import { toast } from "sonner";

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

      return toast.success(title, {
        description,
      });
    },
    info: (title: string, description = "") => {
      addNotification({
        title,
        description,
        type: "info",
        createdAtLabel: "Just now",
      });

      return toast(title, {
        description,
      });
    },
    warning: (title: string, description = "") => {
      addNotification({
        title,
        description,
        type: "warning",
        createdAtLabel: "Just now",
      });

      return toast.warning(title, {
        description,
      });
    },
  };
}
