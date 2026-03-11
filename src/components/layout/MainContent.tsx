import { Outlet } from "react-router-dom";

export function MainContent() {
  return (
    <main className="min-h-[calc(100vh-10rem)]">
      <Outlet />
    </main>
  );
}
