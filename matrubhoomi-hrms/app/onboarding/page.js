// app/onboarding/page.js
//
// Same portal as the root page. Kept as its own address because it is the one
// people get told to bookmark, and because "go to /onboarding" is easier to say
// over a factory floor than "go to the website".

import DepartmentPortal from "@/components/onboarding/DepartmentPortal";

export const metadata = {
  title: "Sign in · Matrubhoomi Farms & Developers",
};

export default function OnboardingPage() {
  return <DepartmentPortal />;
}
