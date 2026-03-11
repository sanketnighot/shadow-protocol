import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import App from "./App";
import "./styles/globals.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        richColors
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "glass-panel border-white/10",
            title: "text-sm font-semibold text-foreground",
            description: "text-sm text-muted",
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
