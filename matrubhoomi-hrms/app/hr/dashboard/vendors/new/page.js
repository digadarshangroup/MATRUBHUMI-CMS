"use client";

import { useState } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import VendorFormComponent from "@/components/vendor/VendorFormComponent";

export default function NewVendorPage() {
  return (
    <DashboardLayout activeMenu="vendors">
      <VendorFormComponent />
    </DashboardLayout>
  );
}
