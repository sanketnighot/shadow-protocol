import { useEffect, useMemo, useState } from "react";
import { RouterProvider } from "react-router-dom";

import { TauriDevContextMenu } from "@/components/system/TauriDevContextMenu";
import { hasTauriRuntime } from "@/lib/tauri";
import { createAppRouter } from "@/routes";
import { useUiStore } from "@/store/useUiStore";

function App() {
  const router = useMemo(() => createAppRouter(), []);
  const [devMenu, setDevMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (!hasTauriRuntime()) {
        return;
      }
      const allowInspect =
        import.meta.env.DEV || useUiStore.getState().developerModeEnabled;
      if (!allowInspect) {
        return;
      }
      event.preventDefault();
      setDevMenu({ x: event.clientX, y: event.clientY });
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {devMenu ? (
        <TauriDevContextMenu
          x={devMenu.x}
          y={devMenu.y}
          onClose={() => setDevMenu(null)}
        />
      ) : null}
    </>
  );
}

export default App;
