"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  Panel,
  PageHead,
  Chip,
  Button,
  Tabs,
  ErrorState,
  SkeletonRows,
} from "@/components/ceo/ui/Primitives";
import {
  ArrowLeft,
  Edit,
  Building,
  Phone,
  Mail,
  MapPin,
  FileText,
  Users,
  Factory,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  BarChart,
  Briefcase,
  Award,
  Shield,
  Clock,
  Package,
  Layers,
  Wrench,
  UserCheck,
  TrendingUp,
  AlertCircle,
  PenTool,
  Loader2,
  ChevronRight,
  Download,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function ViewVendorPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const vendorId = params.id;

  // Fetch vendor data
  useEffect(() => {
    if (vendorId) {
      fetchVendorData();
    }
  }, [vendorId]);

  const fetchVendorData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("Fetching vendor data for ID:", vendorId);

      const response = await fetch(`${API_URL}/api/hr/vendors/${vendorId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch vendor: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        console.log("Vendor data received:", data.data);
        setVendor(data.data);
      } else {
        throw new Error(data.message || "Failed to fetch vendor");
      }
    } catch (error) {
      console.error("Error fetching vendor data:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper component for detail items
  const DetailItem = ({ label, value, icon: Icon }) => (
    <div className="flex items-start gap-3 border-b border-hairline py-2 last:border-b-0">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-faint">{label}</p>
        <p data-figure className="mt-0.5 text-sm font-medium text-ink">
          {value || "N/A"}
        </p>
      </div>
    </div>
  );

  // Detail card component
  const DetailCard = ({ title, icon: Icon, children, className = "" }) => (
    <Panel label={title} className={className}>
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-inset bg-[var(--control)] p-2">
          <Icon className="h-5 w-5 text-ink-muted" />
        </div>
        <h3 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          {title}
        </h3>
      </div>
      {children}
    </Panel>
  );

  // Status badge component
  const StatusBadge = ({ status }) => (
    <Chip
      tone={
        status === "active"
          ? "positive"
          : status === "inactive"
            ? "overdue"
            : "neutral"
      }
    >
      {status?.toUpperCase() || "UNKNOWN"}
    </Chip>
  );

  // Rating stars component
  const RatingStars = ({ rating }) => (
    <div className="flex items-center gap-1">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${
            i < Math.floor(rating)
              ? "text-[var(--state-extension)]"
              : i < rating
                ? "text-[color-mix(in_srgb,var(--state-extension)_55%,transparent)]"
                : "text-[var(--control-active)]"
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span data-figure className="ml-1 text-sm font-medium text-ink">
        {rating?.toFixed(1) || "0.0"}
      </span>
    </div>
  );

  // Handle document download/view
  const handleDocumentClick = (url) => {
    if (url) {
      window.open(url, "_blank");
    }
  };

  // Loading state
  if (loading) {
    return (
      <DashboardLayout activeMenu="vendors">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead kicker="Human resources" title="Vendor" />
          <Panel label="Loading vendor details">
            <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading vendor details...
            </div>
            <SkeletonRows rows={6} />
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error || !vendor) {
    return (
      <DashboardLayout activeMenu="vendors">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <Button tone="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back to Vendors
          </Button>

          <Panel label="Unable to load vendor" className="mt-4">
            <ErrorState
              title="Unable to load vendor"
              body={error || "Vendor not found"}
            />
            <div className="flex justify-center">
              <Button
                tone="primary"
                onClick={() => router.push("/hr/dashboard/vendors")}
              >
                Return to Vendors
              </Button>
            </div>
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="vendors">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header */}
        <div className="mb-2">
          <Button tone="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back to Vendors
          </Button>
        </div>

        <PageHead
          kicker="Human resources"
          title={vendor.name}
          sub={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-ink-faint" />
                <span>{vendor.firmType || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-ink-faint" />
                <span>{vendor.category || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-ink-faint" />
                <span>
                  {vendor.city || "N/A"}, {vendor.state || "N/A"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-ink-faint" />
                <span>
                  Added:{" "}
                  <span data-figure>
                    {new Date(vendor.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </div>
            </div>
          }
          actions={
            <>
              <StatusBadge status={vendor.status} />
              <RatingStars rating={vendor.rating} />
              <RoleGate min="editor">
                <Button
                  tone="primary"
                  onClick={() =>
                    router.push(
                      `/hr/dashboard/vendors/edit/${vendor._id || vendor.id}`,
                    )
                  }
                >
                  <Edit className="h-4 w-4" />
                  Edit Vendor
                </Button>
              </RoleGate>
            </>
          }
        />

        {/* Tabs */}
        <div className="mb-6">
          <Tabs
            label="Vendor sections"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              "overview",
              "factory",
              "financial",
              "performance",
              "documents",
            ].map((tab) => ({
              id: tab,
              label: tab.charAt(0).toUpperCase() + tab.slice(1),
            }))}
          />
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              <DetailCard title="Basic Information" icon={Building}>
                <div className="grid md:grid-cols-2 gap-4">
                  <DetailItem
                    label="Contact Person"
                    value={vendor.contactPerson}
                    icon={Users}
                  />
                  <DetailItem label="Email" value={vendor.email} icon={Mail} />
                  <DetailItem label="Phone" value={vendor.phone} icon={Phone} />
                  <DetailItem
                    label="Alternate Phone"
                    value={vendor.alternatePhone}
                    icon={Phone}
                  />
                  <DetailItem
                    label="Products/Services"
                    value={vendor.productsHandled}
                    icon={Package}
                  />
                  <DetailItem
                    label="Firm Type"
                    value={vendor.firmType}
                    icon={Building}
                  />
                </div>
              </DetailCard>

              <DetailCard title="Legal Details" icon={Shield}>
                <div className="grid md:grid-cols-2 gap-4">
                  <DetailItem
                    label="GST Number"
                    value={vendor.gstNumber}
                    icon={FileText}
                  />
                  <DetailItem
                    label="PAN Number"
                    value={vendor.panNumber}
                    icon={FileText}
                  />
                  <DetailItem
                    label="Udyam Number"
                    value={vendor.udyamNumber}
                    icon={FileText}
                  />
                  <DetailItem
                    label="Labour License"
                    value={vendor.labourLicense}
                    icon={FileText}
                  />
                  <DetailItem
                    label="Factory Registration"
                    value={vendor.factoryRegistration}
                    icon={FileText}
                  />
                  <DetailItem
                    label="Last Audit"
                    value={
                      vendor.lastAudit
                        ? new Date(vendor.lastAudit).toLocaleDateString()
                        : "N/A"
                    }
                    icon={Calendar}
                  />
                  <DetailItem
                    label="Quality Control"
                    value={vendor.qualityControl ? "Yes" : "No"}
                    icon={UserCheck}
                  />
                  <DetailItem
                    label="Record System"
                    value={vendor.recordSystem}
                    icon={FileText}
                  />
                </div>
              </DetailCard>

              <DetailCard title="Business Terms" icon={Briefcase}>
                <div className="grid md:grid-cols-2 gap-4">
                  <DetailItem
                    label="Lead Time"
                    value={vendor.leadTime}
                    icon={Clock}
                  />
                  <DetailItem
                    label="Payment Terms"
                    value={vendor.paymentTerms}
                    icon={DollarSign}
                  />
                  <DetailItem
                    label="Bank Name"
                    value={vendor.bankName}
                    icon={Building}
                  />
                  <DetailItem
                    label="Account Number"
                    value={vendor.accountNumber}
                    icon={FileText}
                  />
                  <DetailItem
                    label="IFSC Code"
                    value={vendor.ifscCode}
                    icon={FileText}
                  />
                  <DetailItem
                    label="Account Holder"
                    value={vendor.accountHolderName}
                    icon={Users}
                  />
                </div>
              </DetailCard>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <DetailCard title="Performance Metrics" icon={BarChart}>
                <div className="space-y-3">
                  <DetailItem
                    label="On-time Delivery"
                    value={
                      vendor.onTimeDelivery
                        ? `${vendor.onTimeDelivery}%`
                        : "N/A"
                    }
                    icon={CheckCircle}
                  />
                  <DetailItem
                    label="Total Orders"
                    value={vendor.totalOrders || 0}
                    icon={Package}
                  />
                  <DetailItem
                    label="Avg Order Value"
                    value={vendor.averageOrderValue || "N/A"}
                    icon={DollarSign}
                  />
                  <DetailItem
                    label="Last Order"
                    value={
                      vendor.lastOrder
                        ? new Date(vendor.lastOrder).toLocaleDateString()
                        : "N/A"
                    }
                    icon={Calendar}
                  />
                </div>
              </DetailCard>

              <DetailCard title="Factory Summary" icon={Factory}>
                <div className="space-y-3">
                  <DetailItem
                    label="Factory Size"
                    value={vendor.factorySize}
                    icon={Layers}
                  />
                  <DetailItem
                    label="Total Operators"
                    value={vendor.totalOperators}
                    icon={Users}
                  />
                  <DetailItem
                    label="Monthly Production"
                    value={
                      vendor.monthlyProduction
                        ? `${vendor.monthlyProduction.toLocaleString()} pcs`
                        : "N/A"
                    }
                    icon={Package}
                  />
                  <DetailItem
                    label="Machine Condition"
                    value={vendor.machineCondition || "N/A"}
                    icon={PenTool}
                  />
                </div>
              </DetailCard>

              <DetailCard title="Financial Summary" icon={TrendingUp}>
                <div className="space-y-3">
                  <DetailItem
                    label="Yearly Turnover"
                    value={vendor.yearlyTurnover}
                    icon={DollarSign}
                  />
                  <DetailItem
                    label="Working Capital"
                    value={vendor.workingCapital}
                    icon={DollarSign}
                  />
                  <DetailItem
                    label="Capital Position"
                    value={vendor.workingCapitalPosition}
                    icon={BarChart}
                  />
                  <DetailItem
                    label="Sustainability"
                    value={
                      vendor.sustainabilityMonths
                        ? `${vendor.sustainabilityMonths} months`
                        : "N/A"
                    }
                    icon={AlertCircle}
                  />
                </div>
              </DetailCard>

              {vendor.notes && (
                <DetailCard title="Notes" icon={FileText}>
                  <p className="text-sm whitespace-pre-wrap text-ink">
                    {vendor.notes}
                  </p>
                </DetailCard>
              )}
            </div>
          </div>
        )}

        {/* Factory Tab */}
        {activeTab === "factory" && (
          <div className="space-y-6">
            <DetailCard title="Factory Infrastructure" icon={Factory}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <DetailItem label="Factory Size" value={vendor.factorySize} />
                <DetailItem
                  label="Production Lines"
                  value={vendor.productionLines}
                />
                <DetailItem
                  label="Total Machines"
                  value={vendor.totalMachines}
                />
                <DetailItem
                  label="Machine Condition"
                  value={vendor.machineCondition}
                />
                <DetailItem
                  label="Line Layout Available"
                  value={vendor.lineLayoutAvailable ? "Yes" : "No"}
                />
                <DetailItem
                  label="Cutting Facility"
                  value={vendor.cuttingFacility ? "Yes" : "No"}
                />
                <DetailItem
                  label="Pressing Facility"
                  value={vendor.pressingFacility ? "Yes" : "No"}
                />
                <DetailItem
                  label="Packing Facility"
                  value={vendor.packingFacility ? "Yes" : "No"}
                />
              </div>
              {vendor.machineBreakup && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-ink-faint">Machine Breakup</p>
                  <p className="text-sm text-ink">{vendor.machineBreakup}</p>
                </div>
              )}
              {vendor.specialMachines && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-ink-faint">
                    Special Machines
                  </p>
                  <p className="text-sm text-ink">{vendor.specialMachines}</p>
                </div>
              )}
            </DetailCard>

            <DetailCard title="Manpower Details" icon={Users}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <DetailItem
                  label="Total Operators"
                  value={vendor.totalOperators}
                />
                <DetailItem
                  label="Skilled Operators"
                  value={vendor.skilledOperators}
                />
                <DetailItem label="Supervisors" value={vendor.supervisors} />
                <DetailItem label="Helpers" value={vendor.helpers} />
                <DetailItem
                  label="Absenteeism Rate"
                  value={vendor.absenteeismRate}
                />
                <DetailItem label="Shifts" value={vendor.shifts} />
                <DetailItem label="Working Hours" value={vendor.workingHours} />
                <DetailItem label="Weekly Off" value={vendor.weeklyOff} />
              </div>
            </DetailCard>

            <DetailCard title="Production Details" icon={Package}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <DetailItem
                  label="Avg Production/Machine/Day"
                  value={vendor.avgProductionPerMachine}
                />
                <DetailItem
                  label="Monthly Production"
                  value={
                    vendor.monthlyProduction
                      ? `${vendor.monthlyProduction.toLocaleString()} pcs`
                      : "N/A"
                  }
                />
                <DetailItem
                  label="Rejection Rate"
                  value={vendor.rejectionRate}
                />
                <DetailItem label="Rework Rate" value={vendor.reworkRate} />
                <DetailItem
                  label="Overtime Required"
                  value={vendor.overtimeRequired}
                />
              </div>
            </DetailCard>

            <DetailCard title="Experience & Capacity" icon={Award}>
              <div className="grid md:grid-cols-2 gap-6">
                <DetailItem
                  label="Highest Complexity Handled"
                  value={vendor.highestComplexity}
                />
                <DetailItem
                  label="Sample Development Time"
                  value={vendor.sampleTime}
                />
                <DetailItem
                  label="Major Customers"
                  value={vendor.majorCustomers}
                />
                <DetailItem label="Average SAM" value={vendor.avgSAM} />
                <DetailItem
                  label="Total Monthly SAM Capacity"
                  value={
                    vendor.totalMonthlySAM
                      ? vendor.totalMonthlySAM.toLocaleString()
                      : "N/A"
                  }
                />
                <DetailItem
                  label="Comfortable Workload"
                  value={
                    vendor.comfortableWorkload
                      ? vendor.comfortableWorkload.toLocaleString()
                      : "N/A"
                  }
                />
                <DetailItem
                  label="Maximum Workload"
                  value={
                    vendor.maxWorkload
                      ? vendor.maxWorkload.toLocaleString()
                      : "N/A"
                  }
                />
              </div>
            </DetailCard>
          </div>
        )}

        {/* Financial Tab */}
        {activeTab === "financial" && (
          <div className="space-y-6">
            <DetailCard title="Financial Overview" icon={DollarSign}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <DetailItem
                  label="Yearly Turnover"
                  value={vendor.yearlyTurnover}
                />
                <DetailItem
                  label="Monthly Fixed Expenses"
                  value={vendor.monthlyFixedExpenses}
                />
                <DetailItem
                  label="Monthly Salary Payout"
                  value={vendor.monthlySalaryPayout}
                />
                <DetailItem
                  label="Working Capital"
                  value={vendor.workingCapital}
                />
                <DetailItem
                  label="Sustainability (Months)"
                  value={vendor.sustainabilityMonths}
                />
                <DetailItem
                  label="Existing Loans/EMIs"
                  value={vendor.existingLoans}
                />
                <DetailItem
                  label="Capital Position"
                  value={vendor.workingCapitalPosition}
                />
                <DetailItem label="Past Defaults" value={vendor.pastDefaults} />
              </div>
            </DetailCard>

            <DetailCard title="Bank Details" icon={Building}>
              <div className="grid md:grid-cols-2 gap-6">
                <DetailItem label="Bank Name" value={vendor.bankName} />
                <DetailItem
                  label="Account Number"
                  value={vendor.accountNumber}
                />
                <DetailItem label="IFSC Code" value={vendor.ifscCode} />
                <DetailItem
                  label="Account Holder"
                  value={vendor.accountHolderName}
                />
              </div>
            </DetailCard>

            <DetailCard title="Address Details" icon={MapPin}>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="mb-2 text-xs text-ink-faint">
                    Registered Address
                  </p>
                  <p className="text-sm text-ink">{vendor.registeredAddress}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs text-ink-faint">Factory Address</p>
                  <p className="text-sm text-ink">{vendor.factoryAddress}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs text-ink-faint">
                    Business Address
                  </p>
                  <p className="text-sm text-ink">{vendor.address}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    <span data-figure>
                      {vendor.city}, {vendor.state} - {vendor.pincode}
                    </span>
                  </p>
                </div>
              </div>
            </DetailCard>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === "performance" && (
          <div className="space-y-6">
            <DetailCard title="Order Performance" icon={BarChart}>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Total Orders
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.totalOrders || 0}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    On-time Delivery
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.onTimeDelivery
                      ? `${vendor.onTimeDelivery}%`
                      : "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Average Order Value
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.averageOrderValue || "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Vendor Rating
                  </p>
                  <div className="flex items-center gap-2">
                    <RatingStars rating={vendor.rating} />
                  </div>
                </div>
              </div>
            </DetailCard>

            <DetailCard title="Production Performance" icon={Factory}>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Monthly Capacity
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.monthlyProduction
                      ? `${vendor.monthlyProduction.toLocaleString()} pcs`
                      : "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Rejection Rate
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.rejectionRate || "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">Rework Rate</p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.reworkRate || "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">Avg SAM</p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.avgSAM || "N/A"}
                  </p>
                </div>
              </div>
            </DetailCard>

            <DetailCard title="Financial Performance" icon={TrendingUp}>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Yearly Turnover
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.yearlyTurnover || "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Working Capital
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.workingCapital || "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Capital Position
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.workingCapitalPosition || "N/A"}
                  </p>
                </div>
                <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                  <p className="truncate text-xs text-ink-faint">
                    Sustainability
                  </p>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {vendor.sustainabilityMonths
                      ? `${vendor.sustainabilityMonths} months`
                      : "N/A"}
                  </p>
                </div>
              </div>
            </DetailCard>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-6">
            <DetailCard title="Uploaded Documents" icon={FileText}>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Profile Image */}
                {vendor.documents?.profileImage?.url && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]">
                    <div className="flex items-start justify-between mb-3">
                      <Building className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() =>
                          handleDocumentClick(vendor.documents.profileImage.url)
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      Company Profile
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Factory/Company Image
                    </p>
                  </div>
                )}

                {/* GST Certificate */}
                {vendor.documents?.gstCertificate?.url && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]">
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() =>
                          handleDocumentClick(
                            vendor.documents.gstCertificate.url,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      GST Certificate
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Number: {vendor.gstNumber || "N/A"}
                    </p>
                  </div>
                )}

                {/* PAN Card */}
                {vendor.documents?.panFile?.url && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]">
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() =>
                          handleDocumentClick(vendor.documents.panFile.url)
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">PAN Card</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Number: {vendor.panNumber || "N/A"}
                    </p>
                  </div>
                )}

                {/* Udyam Certificate */}
                {vendor.documents?.udyamCertificate?.url && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]">
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() =>
                          handleDocumentClick(
                            vendor.documents.udyamCertificate.url,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      Udyam Certificate
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Number: {vendor.udyamNumber || "N/A"}
                    </p>
                  </div>
                )}

                {/* Labour License */}
                {vendor.documents?.labourLicenseCopy?.url && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]">
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() =>
                          handleDocumentClick(
                            vendor.documents.labourLicenseCopy.url,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      Labour License
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Number: {vendor.labourLicense || "N/A"}
                    </p>
                  </div>
                )}

                {/* Bank Cheque */}
                {vendor.documents?.bankCheque?.url && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]">
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() =>
                          handleDocumentClick(vendor.documents.bankCheque.url)
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      Cancelled Cheque
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Bank: {vendor.bankName || "N/A"}
                    </p>
                  </div>
                )}

                {/* Additional Documents */}
                {vendor.documents?.additionalDocuments?.map((doc, index) => (
                  <div
                    key={doc._id || index}
                    className="rounded-inset border border-hairline bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--control)]"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-ink-faint" />
                      <button
                        onClick={() => handleDocumentClick(doc.url)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      {doc.title || `Document ${index + 1}`}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Additional Document
                    </p>
                  </div>
                ))}

                {/* No documents message */}
                {!vendor.documents?.profileImage?.url &&
                  !vendor.documents?.gstCertificate?.url &&
                  !vendor.documents?.panFile?.url &&
                  !vendor.documents?.udyamCertificate?.url &&
                  !vendor.documents?.labourLicenseCopy?.url &&
                  !vendor.documents?.bankCheque?.url &&
                  (!vendor.documents?.additionalDocuments ||
                    vendor.documents.additionalDocuments.length === 0) && (
                    <div className="md:col-span-3 text-center py-8">
                      <FileText className="mx-auto mb-3 h-10 w-10 text-ink-faint" />
                      <p className="text-sm text-ink-muted">
                        No documents uploaded for this vendor
                      </p>
                    </div>
                  )}
              </div>
            </DetailCard>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
