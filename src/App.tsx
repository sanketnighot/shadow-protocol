import { useMemo } from "react";
import { RouterProvider } from "react-router-dom";

import { createAppRouter } from "@/routes";

function App() {
  const router = useMemo(() => createAppRouter(), []);

  return <RouterProvider router={router} />;
}

export default App;
