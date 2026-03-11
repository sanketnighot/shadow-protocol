import { useEffect, useState } from "react";

export function useSimulatedLoading(delayMs = 550) {
  const [isLoading, setIsLoading] = useState(import.meta.env.MODE !== "test");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsLoading(false), delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs]);

  return isLoading;
}
