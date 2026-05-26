import { Suspense } from "react";

import { Dashboard } from "./dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-4 p-6">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
