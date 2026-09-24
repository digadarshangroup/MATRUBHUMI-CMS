"use client";

import IdCardGenerator from "@/components/employee/IdCardGenerator";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Tabs,
  PageHead,
  EmptyState,
  ErrorState,
  StatPair,
  SkeletonRows,
} from "@/components/ceo/ui/Primitives";
import {
  User,
  Briefcase,
  CreditCard,
  FileText,
  MapPin,
  Calendar,
  Phone,
  Mail,
  Users,
  Building,
  DollarSign,
  Shield,
  Home,
  Download,
  Edit,
  ArrowLeft,
  ChevronRight,
  Activity,
  FileCheck,
  Clock,
  Award as AwardIcon,
  FileUser,
  BadgeCheck,
  MapPin as MapPinIcon,
  Banknote,
  MoreVertical,
  ExternalLink,
  Printer,
  Share2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock as ClockIcon,
  Users as UsersIcon,
  Target,
  Award as TargetAward,
  Image as ImageIcon,
  DownloadIcon,
  Fingerprint,
  IdCard,
  Send,
  Smartphone,
} from "lucide-react";

/* A read-only field: label above, value on a sunken inset. Presentation only. */
function ReadOnly({ label, children, className = "", figure = false }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
        {label}
      </p>
      <div className="rounded-inset border border-hairline bg-[var(--surface-sunken)] px-3.5 py-2.5">
        {figure ? (
          <p data-figure className="text-sm font-medium text-ink">
            {children}
          </p>
        ) : (
          <div className="text-sm font-medium text-ink">{children}</div>
        )}
      </div>
    </div>
  );
}

/* A label/value row separated by a hairline. */
function DataRow({ label, value, figure = false, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-ink-muted">{label}</span>
      <span
        {...(figure ? { "data-figure": "" } : {})}
        className={`text-sm font-medium ${tone ? `text-[var(--state-${tone}-ink)]` : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function EmployeeViewPage() {
  const router = useRouter();
  const params = useParams();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const employeeId = params.id;

  useEffect(() => {
    fetchEmployeeDetails();
  }, [employeeId]);

  const fetchEmployeeDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/api/employees/${employeeId}/details`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      const data = await response.json();

      if (data.success) {
        setEmployee(data.data);
      } else {
        setError(data.message || "Failed to fetch employee details");
      }
    } catch (err) {
      console.error("Error fetching employee details:", err);
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    router.push(
      `/hr/dashboard/employees/new-employee?edit=true&id=${employeeId}`,
    );
  };

  // The welcome email again — for one that never arrived. The server refuses
  // once they have chosen their own password (a reset is the way then) and
  // says why, so the message is shown as it comes.
  const [sendingLogin, setSendingLogin] = useState(false);
  const sendLoginDetails = async () => {
    const who = employee?.basicInfo?.fullName || "this employee";
    const to = employee?.basicInfo?.email;
    if (!confirm(`Email ${who} how to sign in to the app${to ? ` (to ${to})` : ""}?`)) return;
    setSendingLogin(true);
    try {
      const r = await fetch(
        `${API_URL}/api/employees/${employeeId}/send-login-details`,
        { method: "POST", credentials: "include" },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.message || "Could not send the email");
      toast.success(d.message);
      fetchEmployeeDetails();
    } catch (e) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setSendingLogin(false);
    }
  };

  const handleBack = () => {
    router.push("/hr/dashboard/employees");
  };

  // Tab configuration
  const tabs = [
    { id: "overview", label: "Overview", icon: User },
    { id: "work", label: "Work Details", icon: Briefcase },
    { id: "salary", label: "Salary & Bank", icon: CreditCard },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "address", label: "Address", icon: MapPin },
    { id: "team", label: "Team", icon: Users },
    { id: "idcard", label: "ID Card", icon: CreditCard },
    { id: "activities", label: "Activities", icon: Activity },
  ];

  // Status badge styling
  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: "positive", icon: CheckCircle },
      inactive: { color: "overdue", icon: XCircle },
      on_leave: { color: "rework", icon: ClockIcon },
      draft: { color: "neutral", icon: AlertCircle },
    };

    const config = statusConfig[status?.toLowerCase()] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Chip tone={config.color}>
        <Icon className="h-3.5 w-3.5" />
        {status?.toUpperCase() || "DRAFT"}
      </Chip>
    );
  };

  const generateQRCode = async (text) => {
    // Using a free QR code API
    const encodedText = encodeURIComponent(text);
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodedText}&format=png&margin=10`;
  };

  // Render loading state
  if (loading) {
    return (
      <Hr_DashboardLayout activeMenu="employees">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead kicker="Human resources" title="Employee details" />
          <Panel label="Loading employee details">
            <SkeletonRows rows={6} />
          </Panel>
        </div>
      </Hr_DashboardLayout>
    );
  }

  // Render error state
  if (error) {
    return (
      <Hr_DashboardLayout activeMenu="employees">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead kicker="Human resources" title="Employee details" />
          <Panel label="Error loading employee">
            <ErrorState
              title="Error loading employee"
              body={error}
              onRetry={handleBack}
            />
          </Panel>
        </div>
      </Hr_DashboardLayout>
    );
  }

  // Render employee not found
  if (!employee) {
    return (
      <Hr_DashboardLayout activeMenu="employees">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead kicker="Human resources" title="Employee details" />
          <Panel label="Employee not found">
            <EmptyState
              title="Employee not found"
              body="The employee you're looking for doesn't exist."
              action={
                <Button tone="primary" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to employees
                </Button>
              }
            />
          </Panel>
        </div>
      </Hr_DashboardLayout>
    );
  }

  // Helper function to render file download link
  const renderFileLink = (file, label, fileName = null) => {
    // Handle both object format {url, publicId} and direct URL string
    const fileUrl = file?.url || file;

    if (!fileUrl) return <span className="text-ink-faint">Not Uploaded</span>;

    // Check if it's a valid URL
    const isValidUrl =
      fileUrl.startsWith("http") || fileUrl.startsWith("https");

    if (!isValidUrl) return <span className="text-ink-faint">Invalid URL</span>;

    // Get file name for download
    const getFileName = () => {
      if (fileName) return fileName;
      if (file?.title) return file.title;

      // Extract from URL
      try {
        const urlParts = fileUrl.split("/");
        const lastPart = urlParts[urlParts.length - 1];
        const withoutQuery = lastPart.split("?")[0];
        return withoutQuery || `${label.replace(/\s+/g, "_")}.pdf`;
      } catch (e) {
        return `${label.replace(/\s+/g, "_")}.pdf`;
      }
    };

    const downloadFileName = getFileName();

    return (
      <div className="flex items-center gap-3">
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]"
        >
          <ExternalLink className="h-4 w-4" />
          View {label}
        </a>
        <a
          href={fileUrl}
          download={downloadFileName}
          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          title={`Download ${label}`}
          onClick={(e) => {
            // For Cloudinary URLs, we might need to force download
            if (fileUrl.includes("cloudinary.com")) {
              e.preventDefault();

              // Create a temporary anchor element for download
              const link = document.createElement("a");
              link.href = fileUrl;
              link.download = downloadFileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          }}
        >
          <DownloadIcon className="w-4 h-4" />
        </a>
      </div>
    );
  };

  // Tab Content Components
  const OverviewTab = () => {
    // Function to get the correct profile photo URL
    const getProfilePhoto = () => {
      // Check multiple possible locations
      const photoSources = [employee.basicInfo?.profilePhoto];

      for (const source of photoSources) {
        if (source?.url && source.url.trim() !== "") {
          // Transform Cloudinary URL if needed
          if (source.url.includes("cloudinary.com")) {
            return transformCloudinaryUrl(source.url);
          }
          return source.url;
        }
      }

      // Fallback
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(
        employee.basicInfo.fullName,
      )}&background=7c3aed&color=fff&bold=true&size=500`;
    };

    const transformCloudinaryUrl = (url) => {
      if (!url.includes("/upload/")) return url;

      const parts = url.split("/upload/");
      if (parts.length === 2) {
        return `${parts[0]}/upload/w_500,h_500,c_fill,g_face,q_auto,f_auto/${parts[1]}`;
      }
      return url;
    };

    return (
      <div className="space-y-4">
        {/* Employee Summary Card */}
        <Panel label={employee.basicInfo.fullName}>
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            {/* Avatar Section - Updated */}
            <div className="flex-shrink-0">
              <div className="relative h-32 w-32 overflow-hidden rounded-full border border-hairline bg-[var(--control)]">
                <img
                  src={getProfilePhoto()}
                  alt={employee.basicInfo.fullName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      employee.basicInfo.fullName,
                    )}&background=7c3aed&color=fff&bold=true&size=500`;
                  }}
                />
              </div>
            </div>
            {/* Details Section */}
            <div className="flex-1">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h2 className="text-[22px] leading-tight font-medium tracking-[-0.025em] text-ink">
                    {employee.basicInfo.fullName}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {employee.workInfo.designation}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Chip>
                      <Building className="h-3.5 w-3.5" />
                      {employee.workInfo.department}
                    </Chip>
                    <Chip>
                      <Fingerprint className="h-3.5 w-3.5" />
                      BioID: <span data-figure>{employee.basicInfo.biometricId}</span>
                    </Chip>
                    {/* NEW: Add Biometric ID and Identity ID */}
                    {employee.basicInfo.identityId && (
                      <Chip>
                        <IdCard className="h-3.5 w-3.5" />
                        Identity: <span data-figure>{employee.basicInfo.identityId}</span>
                      </Chip>
                    )}
                    {employee.workInfo.needsToOperate && (
                      <Chip tone="risk">
                        <Activity className="h-3 w-3" />
                        Operator
                      </Chip>
                    )}
                    {getStatusBadge(employee.workInfo.status)}
                    {employee.loginInfo?.appLastSeenAt ? (
                      <Chip
                        tone="positive"
                        title={`Last used the app ${new Date(employee.loginInfo.appLastSeenAt).toLocaleString("en-IN")}`}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Uses the app
                      </Chip>
                    ) : employee.loginInfo?.emailError ? (
                      <Chip tone="overdue" title={employee.loginInfo.emailError}>
                        <Mail className="h-3.5 w-3.5" />
                        Sign-in email failed
                      </Chip>
                    ) : employee.loginInfo?.emailSent ? (
                      <Chip
                        title={`Emailed ${employee.loginInfo.emailSentAt ? new Date(employee.loginInfo.emailSentAt).toLocaleString("en-IN") : ""}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Sign-in details emailed
                      </Chip>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <RoleGate min="editor">
                    <Button
                      size="sm"
                      onClick={sendLoginDetails}
                      disabled={sendingLogin}
                      title="Email them their phone number and first password for the employee app"
                    >
                      <Send className="h-4 w-4" />
                      {sendingLogin ? "Sending…" : "Email sign-in details"}
                    </Button>
                  </RoleGate>
                  <RoleGate min="editor">
                    <Button tone="primary" size="sm" onClick={handleEdit}>
                      <Edit className="h-4 w-4" />
                      Edit Profile
                    </Button>
                  </RoleGate>
                  <Button tone="ghost" size="sm" aria-label="More">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Contact Info */}
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-faint">Email</p>
                    <p className="truncate text-sm font-medium text-ink">
                      {employee.basicInfo.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-faint">Phone</p>
                    <p data-figure className="truncate text-sm font-medium text-ink">
                      {employee.basicInfo.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                    <Calendar className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-faint">Date of Joining</p>
                    <p data-figure className="truncate text-sm font-medium text-ink">
                      {employee.workInfo.dateOfJoining}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-faint">Tenure</p>
                    <p data-figure className="truncate text-sm font-medium text-ink">
                      {employee.workInfo.tenure?.years || 0} years,{" "}
                      {employee.workInfo.tenure?.months || 0} months
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Salary Card */}
          <Panel label="Salary details">
            <PanelHead
              title="Salary Details"
              aside={<DollarSign className="h-5 w-5" />}
            />
            <p data-figure className="text-[28px] leading-none tracking-[-0.03em] text-ink">
              {(() => {
                // Calculate net salary
                const basic =
                  parseFloat(
                    employee.salaryInfo.basic.replace(/[^0-9.-]+/g, ""),
                  ) || 0;
                const allowances =
                  parseFloat(
                    employee.salaryInfo.allowances.replace(/[^0-9.-]+/g, ""),
                  ) || 0;
                const deductions =
                  parseFloat(
                    employee.salaryInfo.deductions.replace(/[^0-9.-]+/g, ""),
                  ) || 0;
                const netSalary = basic + allowances - deductions;

                return new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(netSalary);
              })()}
            </p>
            <p className="mt-1.5 text-xs text-ink-faint">Monthly Take Home</p>
            <div className="mt-4 border-t border-hairline pt-2">
              <DataRow label="Basic" value={employee.salaryInfo.basic} figure />
              <DataRow
                label="Allowances"
                value={employee.salaryInfo.allowances}
                figure
              />
            </div>
          </Panel>

          {/* Managers Card */}
          <Panel label="Reporting to">
            <PanelHead
              title="Reporting To"
              aside={<Users className="h-5 w-5" />}
            />
            {employee.managers.primary ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {employee.managers.primary.name}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {employee.managers.primary.jobTitle}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState compact title="No manager assigned" />
            )}
          </Panel>

          {/* Team Card */}
          <Panel label="Team members">
            <PanelHead
              title="Team Members"
              aside={<UsersIcon className="h-5 w-5" />}
            />
            {employee.relatedData.teamMembers.length > 0 ? (
              <div className="space-y-2">
                {employee.relatedData.teamMembers.slice(0, 3).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {member.name}
                      </p>
                      <p className="truncate text-xs text-ink-faint">
                        {member.department}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </div>
                ))}
                {employee.relatedData.teamMembers.length > 3 && (
                  <p className="mt-2 text-xs text-ink-faint">
                    +<span data-figure>{employee.relatedData.teamMembers.length - 3}</span> more team
                    members
                  </p>
                )}
              </div>
            ) : (
              <EmptyState compact title="No team members" />
            )}
          </Panel>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Personal Info */}
          <Panel label="Personal information">
            <PanelHead
              title="Personal Information"
              aside={<User className="h-5 w-5" />}
            />
            <div className="divide-y divide-hairline">
              <DataRow
                label="Date of Birth"
                value={employee.basicInfo.dateOfBirth}
                figure
              />
              <DataRow
                label="Age"
                value={`${employee.basicInfo.age} years`}
                figure
              />
              <DataRow label="Gender" value={employee.basicInfo.gender} />
              <DataRow
                label="Marital Status"
                value={employee.basicInfo.maritalStatus}
              />
              <DataRow
                label="Alternate Phone"
                value={employee.basicInfo.alternatePhone}
                figure
              />
            </div>
          </Panel>

          {/* Work Info */}
          <Panel label="Work information">
            <PanelHead
              title="Work Information"
              aside={<Briefcase className="h-5 w-5" />}
            />
            <div className="divide-y divide-hairline">
              <DataRow
                label="Department"
                value={employee.workInfo.department}
              />
              <DataRow
                label="Designation"
                value={employee.workInfo.designation}
              />
              <DataRow label="Job Title" value={employee.workInfo.jobTitle} />
              <DataRow
                label="Employment Type"
                value={employee.workInfo.employmentType}
              />
              <DataRow
                label="Work Location"
                value={employee.workInfo.workLocation}
              />
            </div>
          </Panel>
        </div>
      </div>
    );
  };
  const WorkDetailsTab = () => (
    <div className="space-y-4">
      <Panel label="Employment details">
        <PanelHead
          title="Employment Details"
          aside={<Briefcase className="h-5 w-5" />}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            {/* REMOVED: Employee ID field */}
            {/* ADDED: Biometric ID (Required) */}
            <ReadOnly label="Biometric ID *" figure>
              {employee.workInfo.biometricId}
            </ReadOnly>
            {/* ADDED: Identity ID (Optional) */}
            <ReadOnly label="Identity ID" figure>
              {employee.workInfo.identityId || "Not assigned"}
            </ReadOnly>
            <ReadOnly label="Department">
              {employee.workInfo.department}
            </ReadOnly>
            <ReadOnly label="Designation">
              {employee.workInfo.designation}
            </ReadOnly>
            <ReadOnly label="Job Title">{employee.workInfo.jobTitle}</ReadOnly>
          </div>

          <div className="space-y-4">
            <ReadOnly label="Date of Joining" figure>
              {employee.workInfo.dateOfJoining}
            </ReadOnly>
            <ReadOnly label="Employment Type">
              {employee.workInfo.employmentType}
            </ReadOnly>
            <ReadOnly label="Work Location">
              {employee.workInfo.workLocation}
            </ReadOnly>
            <ReadOnly label="Employment Status">
              <div className="flex flex-wrap items-center gap-2">
                {getStatusBadge(employee.workInfo.status)}
                <span className="text-xs text-ink-faint">
                  ({employee.workInfo.isActive ? "Active" : "Inactive"})
                </span>
              </div>
            </ReadOnly>
            <ReadOnly label="Operator Status">
              <div className="flex items-center gap-2">
                {employee.workInfo.needsToOperate ? (
                  <Chip tone="risk">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Required to Operate
                  </Chip>
                ) : (
                  <Chip>
                    <XCircle className="h-3.5 w-3.5" />
                    Not Required to Operate
                  </Chip>
                )}
              </div>
            </ReadOnly>
          </div>
        </div>
      </Panel>

      {/* Manager Hierarchy */}
      <Panel label="Reporting structure">
        <PanelHead
          title="Reporting Structure"
          aside={<Users className="h-5 w-5" />}
        />
        {employee.relatedData.managerHierarchy.length > 0 ? (
          <div className="divide-y divide-hairline">
            {employee.relatedData.managerHierarchy.map((manager, index) => (
              <div key={manager.id} className="flex items-center gap-4 py-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                    index === employee.relatedData.managerHierarchy.length - 1
                      ? "bg-ink text-[var(--body-bg)]"
                      : "bg-[var(--control)] text-ink-muted"
                  }`}
                >
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {manager.name}
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {manager.department} • ID:{" "}
                    <span data-figure>{manager.employeeId}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-medium text-ink-faint">
                    Level <span data-figure>{manager.level}</span>
                  </p>
                  {index < employee.relatedData.managerHierarchy.length - 1 && (
                    <ChevronRight className="ml-auto h-4 w-4 text-ink-faint" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact title="No reporting structure available" />
        )}
      </Panel>
    </div>
  );

  const SalaryBankTab = () => {
    // Calculate net salary from basic, allowances, and deductions
    const calculateNetSalary = () => {
      if (!employee.salaryInfo) return "0";

      const basic =
        parseFloat(employee.salaryInfo.basic.replace(/[^0-9.-]+/g, "")) || 0;
      const allowances =
        parseFloat(employee.salaryInfo.allowances.replace(/[^0-9.-]+/g, "")) ||
        0;
      const deductions =
        parseFloat(employee.salaryInfo.deductions.replace(/[^0-9.-]+/g, "")) ||
        0;

      const netSalary = basic + allowances - deductions;

      // Format the result back to currency format
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(netSalary);
    };

    const netSalary = calculateNetSalary();

    return (
      <div className="space-y-4">
        {/* Salary Breakdown */}
        <Panel label="Salary details">
          <PanelHead
            title="Salary Details"
            aside={<DollarSign className="h-5 w-5" />}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <ReadOnly label="Basic Salary">
                <StatPair
                  label="Monthly"
                  value={employee.salaryInfo.basic}
                />
              </ReadOnly>
              <ReadOnly label="Allowances">
                <StatPair
                  label="Additional benefits"
                  value={employee.salaryInfo.allowances}
                />
              </ReadOnly>
            </div>

            <div className="space-y-4">
              <ReadOnly label="Deductions">
                <StatPair
                  label="Taxes & other deductions"
                  value={employee.salaryInfo.deductions}
                />
              </ReadOnly>
              <ReadOnly label="Net Salary">
                <StatPair label="Monthly take-home" value={netSalary} />
              </ReadOnly>
            </div>
          </div>

          {/* Salary Calculation */}
          <div className="mt-6 border-t border-hairline pt-4">
            <h4 className="mb-2 text-sm font-medium text-ink">
              Salary Breakdown
            </h4>
            <div className="divide-y divide-hairline">
              <DataRow
                label="Basic Salary"
                value={employee.salaryInfo.basic}
                figure
              />
              <DataRow
                label="Allowances"
                value={`+ ${employee.salaryInfo.allowances}`}
                figure
                tone="positive"
              />
              <DataRow
                label="Deductions"
                value={`- ${employee.salaryInfo.deductions}`}
                figure
                tone="overdue"
              />
              <div className="flex items-baseline justify-between gap-4 pt-3">
                <span className="text-sm font-medium text-ink">Net Salary</span>
                <span
                  data-figure
                  className="text-[22px] leading-none tracking-[-0.025em] text-ink"
                >
                  {netSalary}
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Bank Details */}
        <Panel label="Bank account details">
          <PanelHead
            title="Bank Account Details"
            aside={<Banknote className="h-5 w-5" />}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ReadOnly label="Bank Name">
              {employee.bankDetails.bankName}
            </ReadOnly>
            <ReadOnly label="Account Number">
              <p data-figure className="text-sm font-medium text-ink">
                {employee.bankDetails.accountNumber}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                Last 4 digits shown
              </p>
            </ReadOnly>
            <ReadOnly label="IFSC Code" figure>
              {employee.bankDetails.ifscCode}
            </ReadOnly>
          </div>
        </Panel>
      </div>
    );
  };

  const DocumentsTab = () => {
    // Helper function to get file type icon
    const getFileIcon = (fileName) => {
      if (!fileName) return <FileText className="h-5 w-5 text-ink-faint" />;

      const ext = fileName.split(".").pop().toLowerCase();
      switch (ext) {
        case "pdf":
          return (
            <FileText className="h-5 w-5 text-[var(--state-overdue-ink)]" />
          );
        case "doc":
        case "docx":
          return <FileText className="h-5 w-5 text-[var(--state-risk-ink)]" />;
        case "jpg":
        case "jpeg":
        case "png":
          return (
            <ImageIcon className="h-5 w-5 text-[var(--state-positive-ink)]" />
          );
        default:
          return <FileText className="h-5 w-5 text-ink-faint" />;
      }
    };

    // Helper to get file name from URL
    const getFileNameFromUrl = (url) => {
      if (!url) return "Document";
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const fileName = pathname.split("/").pop() || "Document";
        // Remove query parameters
        return fileName.split("?")[0];
      } catch (e) {
        const fileName = url.split("/").pop() || "Document";
        return fileName.split("?")[0];
      }
    };

    // Enhanced download handler for all documents
    const handleDownload = (url, title = "Document") => {
      if (!url) return;

      // Get filename
      let fileName = title;
      if (!fileName.includes(".")) {
        // Try to extract from URL
        const extractedName = getFileNameFromUrl(url);
        fileName = extractedName || `${title.replace(/\s+/g, "_")}.pdf`;
      }

      // Create download link
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";

      // For Cloudinary URLs, add force download parameter
      if (url.includes("cloudinary.com")) {
        const cloudinaryUrl = new URL(url);
        cloudinaryUrl.searchParams.append("fl_attachment", "");
        link.href = cloudinaryUrl.toString();
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="space-y-4">
        <Panel label="Identity documents">
          <PanelHead
            title="Identity Documents"
            aside={<FileText className="h-5 w-5" />}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Aadhar Card */}
            <div className="rounded-inset border border-hairline bg-[var(--surface-sunken)] p-5 text-center transition-colors hover:bg-[var(--control)]">
              <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                <FileUser className="h-6 w-6" />
              </span>
              <h4 className="mb-1.5 text-sm font-medium text-ink">Aadhar Card</h4>
              <p className="mb-3 text-xs text-ink-faint">
                ID: <span data-figure>{employee.documents.aadharNumber}</span>
              </p>
              <div className="space-y-3">
                {employee.documents.aadharFile?.url ? (
                  <div className="flex items-center justify-center gap-2">
                    <a
                      href={employee.documents.aadharFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View
                    </a>
                    <button
                      onClick={() =>
                        handleDownload(
                          employee.documents.aadharFile.url,
                          `Aadhar_${employee.basicInfo.fullName.replace(/\s+/g, "_")}`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      title="Download Aadhar Card"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-ink-faint">Not Uploaded</span>
                )}
              </div>
            </div>

            {/* PAN Card */}
            <div className="rounded-inset border border-hairline bg-[var(--surface-sunken)] p-5 text-center transition-colors hover:bg-[var(--control)]">
              <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                <FileCheck className="h-6 w-6" />
              </span>
              <h4 className="mb-1.5 text-sm font-medium text-ink">PAN Card</h4>
              <p className="mb-3 text-xs text-ink-faint">
                ID: <span data-figure>{employee.documents.panNumber}</span>
              </p>
              <div className="space-y-3">
                {employee.documents.panFile?.url ? (
                  <div className="flex items-center justify-center gap-2">
                    <a
                      href={employee.documents.panFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View
                    </a>
                    <button
                      onClick={() =>
                        handleDownload(
                          employee.documents.panFile.url,
                          `PAN_${employee.basicInfo.fullName.replace(/\s+/g, "_")}`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      title="Download PAN Card"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-ink-faint">Not Uploaded</span>
                )}
              </div>
            </div>

            {/* Resume */}
            <div className="rounded-inset border border-hairline bg-[var(--surface-sunken)] p-5 text-center transition-colors hover:bg-[var(--control)]">
              <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                <FileText className="h-6 w-6" />
              </span>
              <h4 className="mb-1.5 text-sm font-medium text-ink">Resume</h4>
              <p className="mb-3 text-xs text-ink-faint">
                Professional document
              </p>
              <div className="space-y-3">
                {employee.documents.resumeFile?.url ? (
                  <div className="flex items-center justify-center gap-2">
                    <a
                      href={employee.documents.resumeFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View
                    </a>
                    <button
                      onClick={() =>
                        handleDownload(
                          employee.documents.resumeFile.url,
                          `Resume_${employee.basicInfo.fullName.replace(/\s+/g, "_")}`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                      title="Download Resume"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-ink-faint">Not Uploaded</span>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* Additional Documents Section */}
        {employee.documents.additionalDocuments &&
          employee.documents.additionalDocuments.length > 0 && (
            <Panel label="Additional documents">
              <PanelHead
                title="Additional Documents"
                aside={
                  <span data-figure>
                    {employee.documents.additionalDocuments.length} documents
                  </span>
                }
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {employee.documents.additionalDocuments.map((doc, index) => {
                  const fileName = doc.title || getFileNameFromUrl(doc.url);
                  const fileExtension = fileName.split(".").pop().toLowerCase();

                  return (
                    <div
                      key={index}
                      className="rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4 transition-colors hover:bg-[var(--control)]"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-[var(--control)]">
                            {getFileIcon(fileName)}
                          </span>
                          <div className="max-w-[180px] min-w-0">
                            <h4
                              className="truncate text-sm font-medium text-ink"
                              title={fileName}
                            >
                              {fileName}
                            </h4>
                            <p className="truncate text-[11px] text-ink-faint capitalize">
                              {fileExtension} •{" "}
                              <span data-figure>
                                {doc.uploadedAt
                                  ? new Date(doc.uploadedAt).toLocaleDateString()
                                  : "Date not available"}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {doc.url && (
                        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View
                          </a>
                          <button
                            onClick={() => handleDownload(doc.url, fileName)}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                            title={`Download ${fileName}`}
                          >
                            <DownloadIcon className="h-4 w-4" />
                            Download
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

        {/* Government IDs Section */}
        <Panel label="Government IDs">
          <PanelHead
            title="Government IDs"
            aside={<Shield className="h-5 w-5" />}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Aadhar Number</p>
                <p className="text-xs text-ink-faint">
                  Unique Identification Authority of India
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p data-figure className="text-sm text-ink">
                  {employee.documents.aadharNumber}
                </p>
                {employee.documents.aadharFile?.url && (
                  <button
                    onClick={() =>
                      handleDownload(
                        employee.documents.aadharFile.url,
                        `Aadhar_${employee.documents.aadharNumber}`,
                      )
                    }
                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                    title="Download Aadhar"
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">PAN Number</p>
                <p className="text-xs text-ink-faint">
                  Permanent Account Number
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p data-figure className="text-sm text-ink">
                  {employee.documents.panNumber}
                </p>
                {employee.documents.panFile?.url && (
                  <button
                    onClick={() =>
                      handleDownload(
                        employee.documents.panFile.url,
                        `PAN_${employee.documents.panNumber}`,
                      )
                    }
                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                    title="Download PAN"
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">UAN Number</p>
                <p className="text-xs text-ink-faint">
                  Universal Account Number
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p data-figure className="text-sm text-ink">
                  {employee.documents.uanNumber}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    );
  };

  const AddressTab = () => (
    <div className="space-y-4">
      <Panel label="Current address">
        <PanelHead title="Current Address" aside={<Home className="h-5 w-5" />} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <ReadOnly label="Address">
              <p className="text-sm font-medium whitespace-pre-line text-ink">
                {employee.address.current.street}
              </p>
            </ReadOnly>
            <ReadOnly label="City">{employee.address.current.city}</ReadOnly>
          </div>
          <div className="space-y-4">
            <ReadOnly label="State">{employee.address.current.state}</ReadOnly>
            <ReadOnly label="Pincode" figure>
              {employee.address.current.pincode}
            </ReadOnly>
            <ReadOnly label="Country">
              {employee.address.current.country}
            </ReadOnly>
          </div>
        </div>
      </Panel>

      <Panel label="Permanent address">
        <PanelHead
          title="Permanent Address"
          aside={<MapPinIcon className="h-5 w-5" />}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <ReadOnly label="Address">
              <p className="text-sm font-medium whitespace-pre-line text-ink">
                {employee.address.permanent.street}
              </p>
            </ReadOnly>
            <ReadOnly label="City">{employee.address.permanent.city}</ReadOnly>
          </div>
          <div className="space-y-4">
            <ReadOnly label="State">{employee.address.permanent.state}</ReadOnly>
            <ReadOnly label="Pincode" figure>
              {employee.address.permanent.pincode}
            </ReadOnly>
            <ReadOnly label="Country">
              {employee.address.permanent.country}
            </ReadOnly>
          </div>
        </div>
      </Panel>
    </div>
  );

  const TeamTab = () => (
    <div className="space-y-4">
      <Panel label="Direct reports">
        <PanelHead title="Direct Reports" aside={<Users className="h-5 w-5" />} />
        {employee.relatedData.teamMembers.length > 0 ? (
          <div className="space-y-3">
            {employee.relatedData.teamMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4 transition-colors hover:bg-[var(--control)]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-[var(--body-bg)]">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {member.name}
                    </p>
                    <p className="truncate text-xs text-ink-faint">
                      {member.jobTitle} • {member.department}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Chip>
                        ID: <span data-figure>{member.employeeId}</span>
                      </Chip>
                      <Chip
                        tone={
                          member.status === "active"
                            ? "positive"
                            : member.status === "inactive"
                              ? "overdue"
                              : "rework"
                        }
                      >
                        {member.status?.toUpperCase() || "ACTIVE"}
                      </Chip>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    router.push(`/hr/dashboard/employees/${member.id}`)
                  }
                >
                  View Profile
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Team Members"
            body="This employee doesn't have any direct reports."
          />
        )}
      </Panel>

      <Panel label="Team performance">
        <PanelHead
          title="Team Performance (Coming Soon)"
          aside={<Target className="h-5 w-5" />}
        />
        <EmptyState
          title="Coming soon"
          body="Performance metrics and team analytics will be available soon."
        />
      </Panel>
    </div>
  );

  const IdCardTab = () => {
    if (!employee) {
      return (
        <Panel label="Loading employee data">
          <EmptyState title="Loading employee data…" />
        </Panel>
      );
    }

    return (
      <div className="space-y-4">
        <IdCardGenerator employee={employee} employeeId={employeeId} />
      </div>
    );
  };

  const ActivitiesTab = () => (
    <div className="space-y-4">
      <Panel label="Recent activities">
        <PanelHead
          title="Recent Activities"
          aside={<Activity className="h-5 w-5" />}
        />
        <div className="space-y-3">
          {employee.relatedData.recentActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-4 rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                  activity.type === "update"
                    ? "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]"
                    : activity.type === "security"
                      ? "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]"
                      : "bg-[var(--control)] text-ink-muted"
                }`}
              >
                {activity.type === "update" ? (
                  <Edit className="h-5 w-5" />
                ) : activity.type === "security" ? (
                  <Shield className="h-5 w-5" />
                ) : (
                  <DollarSign className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {activity.activity}
                </p>
                <p data-figure className="mt-1 text-xs text-ink-faint">
                  {activity.date}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="System information">
        <PanelHead
          title="System Information"
          aside={<Clock className="h-5 w-5" />}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <ReadOnly label="Created By">
              {employee.systemInfo.createdBy}
            </ReadOnly>
            <ReadOnly label="Created On" figure>
              {employee.systemInfo.createdAt}
            </ReadOnly>
          </div>
          <div className="space-y-4">
            <ReadOnly label="Last Updated" figure>
              {employee.systemInfo.updatedAt}
            </ReadOnly>
            <ReadOnly label="Last Login" figure>
              {employee.systemInfo.lastLogin}
            </ReadOnly>
          </div>
        </div>
      </Panel>
    </div>
  );

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab />;
      case "work":
        return <WorkDetailsTab />;
      case "salary":
        return <SalaryBankTab />;
      case "documents":
        return <DocumentsTab />;
      case "address":
        return <AddressTab />;
      case "team":
        return <TeamTab />;
      case "idcard":
        return <IdCardTab />;
      case "activities":
        return <ActivitiesTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <Hr_DashboardLayout activeMenu="employees">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header with Back Button */}
        <PageHead
          kicker="Human resources"
          title="Employee Details"
          sub="View and manage employee information"
          actions={
            <>
              <Button tone="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button size="sm">
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button size="sm">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
              <RoleGate min="editor">
                <Button tone="primary" size="sm" onClick={handleEdit}>
                  <Edit className="h-4 w-4" />
                  Edit Employee
                </Button>
              </RoleGate>
            </>
          }
        >
          {/* Tabs Navigation */}
          <Tabs
            label="Employee sections"
            value={activeTab}
            onChange={setActiveTab}
            options={tabs.map((t) => ({ id: t.id, label: t.label }))}
          />
        </PageHead>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </Hr_DashboardLayout>
  );
}
