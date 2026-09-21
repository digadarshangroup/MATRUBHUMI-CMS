// app/hr/dashboard/profile/page.jsx
"use client";

import { Suspense } from "react";
import HRProfilePageContent from "./HRProfilePageContent";

export default function HRProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[900px] px-4 py-6 deck:px-8 text-sm text-ink-muted">
          Loading...
        </div>
      }
    >
      <HRProfilePageContent />
    </Suspense>
  );
}
