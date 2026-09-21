"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import VendorFormComponent from "@/components/vendor/VendorFormComponent";

export default function EditVendorPage() {
  const params = useParams();
  const vendorId = params.id;

  return (
    <DashboardLayout activeMenu="vendors">
      <VendorFormComponent vendorId={vendorId} />
    </DashboardLayout>
  );
}
