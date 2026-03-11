import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CreateStrategyButton() {
  return (
    <Button asChild className="rounded-full px-5">
      <Link to="/strategy" aria-label="Create new strategy">
        <Plus className="size-4" />
        Create New Strategy
      </Link>
    </Button>
  );
}
