import { Suspense } from "react";
import NewEmployeeClient from "./NewEmployeeClient.js";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading"
          className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8"
        >
          <p className="text-sm text-ink-muted">Loading…</p>
        </div>
      }
    >
      <NewEmployeeClient />
    </Suspense>
  );
}
