import { useEffect, useMemo } from "react";
import { RouterProvider } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { createAppRouter } from "@/routes";

function App() {
  const router = useMemo(() => createAppRouter(), []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (import.meta.env.DEV) {
        event.preventDefault();
        invoke("open_devtools");
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
