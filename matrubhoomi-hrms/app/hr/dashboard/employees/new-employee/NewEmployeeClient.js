"use client";

import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import EmployeeForm from "./components/EmployeeForm";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { UserPlus, User, Edit2 } from "lucide-react";
import { Panel, Chip, PageHead } from "@/components/ceo/ui/Primitives";

export default function NewEmployeeClient() {
  const [pageState, setPageState] = useState({
    mode: "add",      // "add" | "view" | "edit"
    employeeId: null,
    employeeData: null,
    loading: true,
  });

  const searchParams = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  useEffect(() => {
    const employeeId = searchParams.get("id");
    const editParam = searchParams.get("edit");

    // Derive mode:
    //   no id            → adding a brand-new employee
    //   id + edit=true   → editing an existing employee
    //   id only          → viewing an existing employee
    let mode = "add";
    if (employeeId) {
      mode = editParam === "true" ? "edit" : "view";
    }

    setPageState((prev) => ({ ...prev, mode, employeeId }));

    if (employeeId) {
      fetchEmployeeData(employeeId);
    } else {
      setPageState((prev) => ({ ...prev, loading: false }));
    }
  }, [searchParams]);

  const fetchEmployeeData = async (id) => {
    try {
      setPageState((prev) => ({ ...prev, loading: true }));

      const response = await fetch(`${API_URL}/api/employees/${id}`, {
        method: "GET",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        const transformedData = {
          basicInfo: {
            firstName: data.data.firstName,
            lastName: data.data.lastName,
            email: data.data.email,
            phone: data.data.phone,
            alternatePhone: data.data.alternatePhone || "",
            dateOfBirth: data.data.dateOfBirth
              ? new Date(data.data.dateOfBirth).toISOString().split("T")[0]
              : "",
            gender: data.data.gender,
            maritalStatus: data.data.maritalStatus,
          },
          work: {
            department: data.data.department,
            jobPosition: data.data.jobPosition,
            jobTitle: data.data.jobTitle,
            manager: data.data.manager || "",
            employeeId: data.data.employeeId,
            dateOfJoining: data.data.dateOfJoining
              ? new Date(data.data.dateOfJoining).toISOString().split("T")[0]
              : "",
            employmentType: data.data.employmentType,
            workLocation: data.data.workLocation,
          },
          salary: {
            basicSalary: data.data.salary?.basic || "",
            allowances: data.data.salary?.allowances || "",
            deductions: data.data.salary?.deductions || "",
            bankName: data.data.bankDetails?.bankName || "",
            accountNumber: data.data.bankDetails?.accountNumber || "",
            ifscCode: data.data.bankDetails?.ifscCode || "",
          },
          documents: {
            aadharNumber: data.data.documents?.aadharNumber || "",
            panNumber: data.data.documents?.panNumber || "",
            uanNumber: data.data.documents?.uanNumber || "",
          },
          address: {
            currentAddress: data.data.address?.current?.street || "",
            permanentAddress: data.data.address?.permanent?.street || "",
            city: data.data.address?.current?.city || "",
            state: data.data.address?.current?.state || "",
            pincode: data.data.address?.current?.pincode || "",
          },
        };

        setPageState((prev) => ({
          ...prev,
          employeeData: transformedData,
          loading: false,
        }));
      }
    } catch (error) {
      console.error("Error fetching employee data:", error);
      setPageState((prev) => ({ ...prev, loading: false }));
    }
  };

  // ── Derived display values based on mode ──────────────────────────────────
  const { mode, employeeData } = pageState;

  const employeeName = employeeData
    ? [employeeData.basicInfo?.firstName, employeeData.basicInfo?.lastName]
      .filter(Boolean).join(" ")
    : null;

  const pageConfig = {
    add: {
      heading: "Add New Employee",
      subheading: "Fill in employee details to add to the system",
      breadcrumb: "New Employee",
      Icon: UserPlus,
      badgeText: null,
    },
    view: {
      heading: employeeName || "Employee Profile",
      subheading: employeeData?.work?.employeeId
        ? `${employeeData.work?.department || ""} · ${employeeData.work?.employeeId}`.replace(/^ · /, "")
        : "Employee profile",
      breadcrumb: employeeName || "Employee Profile",
      Icon: User,
      badgeText: employeeData?.work?.employeeId || null,
    },
    edit: {
      heading: `Edit${employeeName ? " — " + employeeName : " Employee"}`,
      subheading: "Update employee information",
      breadcrumb: employeeName || "Edit Employee",
      Icon: Edit2,
      badgeText: employeeData?.work?.employeeId || null,
    },
  };

  const cfg = pageConfig[mode] || pageConfig.add;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (pageState.loading) {
    return (
      <Hr_DashboardLayout activeMenu="employees" pageTitle={cfg.breadcrumb}>
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <div
            className="flex h-64 items-center justify-center"
            role="status"
            aria-label="Loading employee data"
          >
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-hairline border-b-ink" />
              <p className="mt-4 text-sm text-ink-muted">
                Loading employee data…
              </p>
            </div>
          </div>
        </div>
      </Hr_DashboardLayout>
    );
  }

  return (
    <Hr_DashboardLayout activeMenu="employees" pageTitle={cfg.breadcrumb}>
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* ── Page header ── */}
        <PageHead
          kicker="Human resources"
          title={cfg.heading}
          sub={cfg.subheading}
          actions={
            <>
              {/* Employee ID badge — shown in view/edit mode */}
              {cfg.badgeText && (
                <Chip tone="neutral">
                  <span data-figure>{cfg.badgeText}</span>
                </Chip>
              )}
              <span
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-full bg-[var(--control)] text-ink"
              >
                <cfg.Icon className="h-[18px] w-[18px]" />
              </span>
            </>
          }
        />

        {/* ── Form ── */}
        <Panel padded={false} className="overflow-hidden">
          <EmployeeForm
            initialData={pageState.employeeData}
            isEditMode={mode === "edit"}
            employeeId={pageState.employeeId}
          />
        </Panel>
      </div>
    </Hr_DashboardLayout>
  );
}