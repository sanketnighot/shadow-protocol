import { toast } from "sonner";

export function useToast() {
  return {
    success: (title: string, description?: string) =>
      toast.success(title, {
        description,
      }),
    info: (title: string, description?: string) =>
      toast(title, {
        description,
      }),
  };
}
