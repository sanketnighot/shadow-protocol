import { Outlet } from "react-router-dom";

export function MainContent() {
  return (
    <main className="min-h-[calc(100vh-8rem)] min-w-0 pb-24 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pb-24">
      <Outlet />
    </main>
  );
}
