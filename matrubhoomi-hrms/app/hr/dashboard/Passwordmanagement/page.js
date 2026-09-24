"use client";

import RequireRole from "@/components/access/RequireRole";

import { useState, useEffect, useCallback, useRef } from "react";
import HRDashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  Search,
  Key,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Panel,
  PageHead,
  Chip,
  Button,
  Field,
  Input,
  Select as UISelect,
  EmptyState,
  SkeletonRows,
  InlineError,
} from "@/components/ceo/ui/Primitives";

const TH =
  "border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase";
const TD = "border-b border-hairline px-3 py-2.5";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ─── Password Strength ────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  const checks = [
    { label: "8+ chars", pass: password.length >= 8 },
    { label: "Uppercase", pass: /[A-Z]/.test(password) },
    { label: "Number", pass: /[0-9]/.test(password) },
    { label: "Special", pass: /[@#$!%^&*]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const bar = [
    "bg-[var(--state-overdue)]",
    "bg-[var(--state-rework)]",
    "bg-[var(--state-extension)]",
    "bg-[var(--state-positive)]",
  ];
  const label = ["Weak", "Fair", "Good", "Strong"];
  if (!password) return null;
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? bar[score - 1] : "bg-[var(--control-active)]"}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span
          className={`text-[11px] font-medium ${
            score === 4
              ? "text-[var(--state-positive-ink)]"
              : score >= 2
                ? "text-[var(--state-extension-ink)]"
                : "text-[var(--state-overdue-ink)]"
          }`}
        >
          {score > 0 ? label[score - 1] : "Too weak"}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map((c, i) => (
            <span
              key={i}
              className={`text-[11px] flex items-center gap-0.5 ${c.pass ? "text-[var(--state-positive-ink)]" : "text-ink-faint"}`}
            >
              {c.pass ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
// The dot is an identity marker, not a state, so it reads in ink at two
// weights: the four admin logins sit at full ink, the floor roles at half.
// Saturated colour in this system means meaning, and "which department" is
// already carried by the label next to it.
const TYPE_META = {
  employee: { label: "Employee", dot: "bg-ink/40" },
  hr: { label: "HR", dot: "bg-ink/75" },
  sales: { label: "Sales", dot: "bg-ink/40" },
  accountant: { label: "Accountant", dot: "bg-ink/75" },
  "cutting-master": { label: "Cutting Master", dot: "bg-ink/40" },
  project_manager: { label: "Project Manager", dot: "bg-ink/75" },
  "mpc-measurement": { label: "MPC Measurement", dot: "bg-ink/40" },
  "packaging-dispatch": { label: "Packaging & Dispatch", dot: "bg-ink/40" },
  "production-supervisor": {
    label: "Production Supervisor",
    dot: "bg-ink/40",
  },
  qc: { label: "QC", dot: "bg-ink/40" },
  ceo: { label: "CEO", dot: "bg-ink/75" },
};

// All user type filter options — add new departments here in future
const USER_TYPES = [
  { value: "all", label: "All Types" },
  { value: "employee", label: "Employee" },
  { value: "hr", label: "HR" },
  { value: "sales", label: "Sales" },
  { value: "accountant", label: "Accountant" },
  { value: "cutting-master", label: "Cutting Master" },
  { value: "project_manager", label: "Project Manager" },
  { value: "mpc-measurement", label: "MPC Measurement" },
  { value: "packaging-dispatch", label: "Packaging & Dispatch" },
  { value: "production-supervisor", label: "Production Supervisor" },
  { value: "qc", label: "QC" },
  { value: "ceo", label: "CEO" },
];

function TypeDot({ type }) {
  const m = TYPE_META[type] || { label: type, dot: "bg-ink/40" };
  return (
    <Chip tone="neutral">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`}
      />
      {m.label}
    </Chip>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────
function ChangePasswordModal({ user, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    if (newPassword !== confirmPassword)
      return setError("Passwords do not match.");
    if (newPassword.length < 8)
      return setError("Minimum 8 characters required.");
    if (!/[A-Z]/.test(newPassword))
      return setError("Must include an uppercase letter.");
    if (!/[0-9]/.test(newPassword)) return setError("Must include a number.");
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/hr/password-management/change-password/${user.userType}/${user._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newPassword, confirmPassword }),
        },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      onSuccess(`Password updated for ${user.name}.`);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
      <div className="frost-bar flex max-h-full w-full min-h-0 max-w-[440px] flex-col rounded-panel border border-hairline">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              Change Password
            </h3>
            <p className="mt-1 truncate text-xs text-ink-faint">
              {user.name} &middot; {user.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1.5 shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="New Password">
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
              >
                {showNew ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <PasswordStrength password={newPassword} />
          </Field>

          <Field label="Confirm Password">
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className={`pr-11 ${
                  confirmPassword && confirmPassword !== newPassword
                    ? "shadow-[inset_0_0_0_1.5px_var(--state-overdue)]"
                    : confirmPassword && confirmPassword === newPassword
                      ? "shadow-[inset_0_0_0_1.5px_var(--state-positive)]"
                      : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
              >
                {showConfirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--state-overdue-ink)]">
                <XCircle className="w-3 h-3" /> Passwords do not match
              </p>
            )}
            {confirmPassword && confirmPassword === newPassword && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--state-positive-ink)]">
                <CheckCircle2 className="w-3 h-3" /> Passwords match
              </p>
            )}
          </Field>

          {error && (
            <p className="flex items-center gap-1.5 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3 py-2 text-xs text-[var(--state-overdue-ink)]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2.5 border-t border-hairline px-5 py-3.5">
          <Button onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <RoleGate min="editor">
            <Button
              tone="primary"
              onClick={handleSubmit}
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {loading ? "Saving…" : "Save Password"}
            </Button>
          </RoleGate>
        </div>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [emailedTo, setEmailedTo] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/hr/password-management/reset-password/${user.userType}/${user._id}`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setTempPassword(data.temporaryPassword);
      setEmailedTo(data.emailedTo || null);
      setEmailError(data.emailError || null);
    } catch (err) {
      onSuccess(null, err.message || "Reset failed.");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
      <div className="frost-bar flex max-h-full w-full min-h-0 max-w-[440px] flex-col rounded-panel border border-hairline">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              Reset Password
            </h3>
            <p className="mt-1 truncate text-xs text-ink-faint">
              {user.name} &middot; {user.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1.5 shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!tempPassword ? (
            <div className="space-y-4">
              {user.userType === "employee" ? (
                <p className="text-sm leading-relaxed text-ink-muted">
                  <span className="font-medium text-ink">{user.name}</span>
                  &apos;s password goes back to their phone number, and the app
                  asks them to choose a new one when they sign in. If emails are
                  on, they are emailed the details as well.
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-ink-muted">
                  A secure temporary password will be generated for{" "}
                  <span className="font-medium text-ink">{user.name}</span>.
                  Share it with them through a secure channel. They should
                  update it on next login.
                </p>
              )}
              <div className="flex gap-2.5">
                <Button onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <RoleGate min="editor">
                  <Button
                    tone="primary"
                    onClick={handleReset}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    {loading ? "Generating…" : "Generate"}
                  </Button>
                </RoleGate>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-ink-muted">
                Temporary password generated. Copy and share it securely — it
                will not be shown again.
              </p>
              {emailedTo && (
                <p className="text-xs text-[var(--state-positive-ink)]">
                  Also emailed to {emailedTo}, with how to sign in.
                </p>
              )}
              {emailError && (
                <p className="text-xs text-[var(--state-overdue-ink)]">
                  The email to them could not be sent ({emailError}) — please
                  pass it on yourself.
                </p>
              )}
              <div className="flex items-center gap-2">
                <div
                  data-figure
                  className="flex-1 rounded-inset bg-slab px-4 py-3 font-mono text-sm tracking-widest text-slab-ink select-all"
                >
                  {tempPassword}
                </div>
                <button
                  onClick={copyToClipboard}
                  aria-label="Copy temporary password"
                  className={`shrink-0 rounded-inset p-3 transition-colors ${
                    copied
                      ? "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]"
                      : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)] hover:text-ink"
                  }`}
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <Button
                tone="primary"
                onClick={() => {
                  onSuccess(`Temp password set for ${user.name}.`);
                  onClose();
                }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-[90] flex max-w-sm items-center gap-2.5 rounded-panel px-4 py-3 text-sm shadow-[var(--deck-seat)] ${
        type === "success"
          ? "bg-slab text-slab-ink"
          : "bg-[var(--state-overdue)] text-[var(--slab-ink)]"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[var(--state-positive)]" />
      ) : (
        <XCircle className="w-4 h-4 flex-shrink-0" />
      )}
      {message}
    </div>
  );
}

// ─── Select Dropdown ──────────────────────────────────────────────────────────
function Select({ value, onChange, options }) {
  return (
    <UISelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-auto cursor-pointer"
      aria-label="Filter by user type"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </UISelect>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PasswordManagementPage(props) {
  return (
    <RequireRole min="editor">
      <PasswordManagementPageInner {...props} />
    </RequireRole>
  );
}
function PasswordManagementPageInner() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSync, setShowSync] = useState(false);
  const searchTimeout = useRef(null);
  const LIMIT = 15;

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        userType: userTypeFilter,
        page,
        limit: LIMIT,
      });
      const res = await fetch(
        `${API_BASE}/api/hr/password-management/users?${params}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
        setPagination(data.pagination);
      }
    } catch {
      showToast("Failed to load users.", "error");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, userTypeFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }
  function openModal(user, type) {
    setSelectedUser(user);
    setModal(type);
  }
  function closeModal() {
    setSelectedUser(null);
    setModal(null);
  }

  const start = pagination.total
    ? (pagination.page - 1) * pagination.limit + 1
    : 0;
  const end = pagination.total
    ? Math.min(pagination.page * pagination.limit, pagination.total)
    : 0;

  return (
    <HRDashboardLayout activeMenu="password-management">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* ── Header ── */}
        <PageHead
          kicker="Human resources"
          title="Password Management"
          sub="Manage staff credentials across all departments"
          actions={
            <>
              <RoleGate min="editor">
                <Button
                  size="sm"
                  onClick={() => setShowSync(true)}
                  title="Reconcile department login accounts with current employees"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync logins
                </Button>
              </RoleGate>
              {pagination.total !== undefined && (
                <Chip tone="neutral">
                  <span data-figure>{pagination.total}</span> accounts
                </Chip>
              )}
            </>
          }
        >
          {/* ── Controls ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or ID…"
                className="pl-9"
              />
            </div>
            <Select
              value={userTypeFilter}
              onChange={(v) => {
                setUserTypeFilter(v);
                setPage(1);
              }}
              options={USER_TYPES}
            />
          </div>
        </PageHead>

        {/* ── Table ── */}
        <Panel padded={false} label="Staff accounts">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH}>Name</th>
                  <th className={`${TH} hidden md:table-cell`}>Email</th>
                  <th className={`${TH} hidden lg:table-cell`}>Department</th>
                  <th className={TH}>Type</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6">
                      <SkeletonRows rows={6} />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="No users found"
                        body="Try adjusting your search or filter"
                      />
                    </td>
                  </tr>
                ) : (
                  users.map((user, idx) => (
                    <tr
                      key={user._id}
                      className="group transition-colors hover:bg-[var(--row-hover)]"
                    >
                      <td className={TD}>
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {user.name}
                          </p>
                          {user.employeeId && (
                            <p
                              data-figure
                              className="mt-0.5 text-[11px] text-ink-faint"
                            >
                              #{user.employeeId}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className={`${TD} hidden md:table-cell`}>
                        <span className="text-sm text-ink-muted">
                          {user.email}
                        </span>
                      </td>
                      <td className={`${TD} hidden lg:table-cell`}>
                        <span className="text-sm text-ink-muted">
                          {user.department || "—"}
                        </span>
                      </td>
                      <td className={TD}>
                        <TypeDot type={user.userType} />
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-2">
                          <RoleGate min="editor">
                            <Button
                              size="sm"
                              tone="primary"
                              onClick={() => openModal(user, "change")}
                            >
                              <Key className="w-3 h-3" />
                              Change
                            </Button>
                          </RoleGate>
                          <RoleGate min="editor">
                            <Button
                              size="sm"
                              onClick={() => openModal(user, "reset")}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset
                            </Button>
                          </RoleGate>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
              <p className="text-xs text-ink-faint">
                Showing <span data-figure>{start}</span>–
                <span data-figure>{end}</span> of{" "}
                <span data-figure>{pagination.total}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - page) <= 2)
                  .map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      data-figure
                      aria-current={p === page ? "page" : undefined}
                      className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                        p === page
                          ? "bg-ink text-[var(--body-bg)]"
                          : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === pagination.totalPages}
                  aria-label="Next page"
                  className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {modal === "change" && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          onClose={closeModal}
          onSuccess={(msg) => showToast(msg, "success")}
        />
      )}
      {modal === "reset" && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={closeModal}
          onSuccess={(msg, err) =>
            showToast(err || msg, err ? "error" : "success")
          }
        />
      )}

      {showSync && (
        <SyncDeptLoginsModal
          onClose={() => setShowSync(false)}
          onDone={(msg, type) => {
            showToast(msg, type);
            setShowSync(false);
            fetchUsers();
          }}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </HRDashboardLayout>
  );
}

// ─── Sync Department Logins Modal ─────────────────────────────────────────────
// CLEANUP-ONLY. Lists department logins that can be removed, matched on BOTH
// biometric ID and mobile:
//   • Duplicates — the person already has an Employee login (e.g. the extra
//     "Cutting Master" row for ARNOLDIN). Pre-ticked for removal.
//   • Orphans — a dept login with no matching employee. Left unticked; HR opts in.
// Admin logins (HR, Accountant, CEO, Project Manager) are protected on the
// server and never appear here. Nothing is created — so no new duplicates.
function SyncDeptLoginsModal({ onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [orphans, setOrphans] = useState([]);
  const [checked, setChecked] = useState({}); // id -> bool

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE}/api/hr/password-management/sync-dept-logins`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (!data.success)
          throw new Error(data.message || "Failed to load preview");
        if (!alive) return;
        const dup = data.data.duplicates || [];
        const orp = data.data.orphans || [];
        setDuplicates(dup);
        setOrphans(orp);
        // Duplicates pre-checked (safe to remove — person keeps Employee login).
        // Orphans unchecked (HR decides — could be a standalone account).
        const init = {};
        dup.forEach((d) => {
          init[String(d._id)] = true;
        });
        orp.forEach((o) => {
          init[String(o._id)] = false;
        });
        setChecked(init);
      } catch (e) {
        if (alive) setError(e.message || "Failed to load preview");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedCount = [...duplicates, ...orphans].filter(
    (r) => checked[String(r._id)],
  ).length;
  const nothingToDo =
    !loading && duplicates.length === 0 && orphans.length === 0;

  function toggle(id) {
    setChecked((s) => ({ ...s, [String(id)]: !s[String(id)] }));
  }

  async function handleApply() {
    const removeIds = [...duplicates, ...orphans]
      .filter((r) => checked[String(r._id)])
      .map((r) => String(r._id));
    if (removeIds.length === 0) {
      setError("Nothing selected to remove.");
      return;
    }
    setApplying(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/hr/password-management/sync-dept-logins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ removeIds }),
        },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Sync failed");
      onDone(data.message || "Sync complete.", "success");
    } catch (e) {
      setError(e.message || "Sync failed");
    } finally {
      setApplying(false);
    }
  }

  function Row({ r, accent }) {
    const on = !!checked[String(r._id)];
    return (
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--row-hover)]">
        <input
          type="checkbox"
          checked={on}
          onChange={() => toggle(r._id)}
          className="h-4 w-4 shrink-0 accent-[var(--color-ink)]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{r.name}</p>
          <p data-figure className="truncate text-[11px] text-ink-faint">
            {r.email || "no email"} · {r.phone || "no phone"} · #
            {r.employeeId || "—"}
          </p>
        </div>
        <Chip tone={accent === "rose" ? "overdue" : "extension"}>
          {r.deptLabel}
        </Chip>
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
      <div className="frost-bar flex max-h-full w-full min-h-0 max-w-[640px] flex-col rounded-panel border border-hairline">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              Sync Department Logins
            </h3>
            <p className="mt-1 text-xs text-ink-faint">
              Remove duplicate &amp; orphaned department logins
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1.5 shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <SkeletonRows rows={6} />
          ) : nothingToDo ? (
            <EmptyState
              title="Everything is in sync"
              body="No duplicate or orphaned department logins found."
            />
          ) : (
            <div className="space-y-5">
              {/* Duplicates */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-[var(--state-overdue-ink)]" />
                  <h4 className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Duplicate logins (
                    <span data-figure>{duplicates.length}</span>)
                  </h4>
                </div>
                <p className="mb-2 pl-6 text-[11px] text-ink-muted">
                  These people already have an Employee login, so this extra
                  department login is redundant. Pre-selected for removal —
                  untick anyone who genuinely needs a separate department login.
                </p>
                {duplicates.length === 0 ? (
                  <p className="pl-6 text-xs text-ink-faint">None.</p>
                ) : (
                  <div className="divide-y divide-hairline rounded-inset border border-hairline">
                    {duplicates.map((r) => (
                      <Row key={r._id} r={r} accent="rose" />
                    ))}
                  </div>
                )}
              </div>

              {/* Orphans */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[var(--state-extension-ink)]" />
                  <h4 className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Orphaned logins (<span data-figure>{orphans.length}</span>)
                  </h4>
                </div>
                <p className="mb-2 pl-6 text-[11px] text-ink-muted">
                  No employee matches these on both biometric ID and mobile.
                  Left unticked — tick only if you're sure they should be
                  deleted.
                </p>
                {orphans.length === 0 ? (
                  <p className="pl-6 text-xs text-ink-faint">None.</p>
                ) : (
                  <div className="divide-y divide-hairline rounded-inset border border-hairline">
                    {orphans.map((r) => (
                      <Row key={r._id} r={r} accent="amber" />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-inset bg-[var(--surface-sunken)] p-3 text-xs text-ink-muted">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-faint" />
                <p>
                  Admin logins (HR, Accountant, CEO, Project Manager) are
                  protected and never listed here. Nothing is created — only the
                  ticked logins below are deleted.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3">
              <InlineError message={error} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
          <p className="text-xs text-ink-faint">
            <span data-figure>{selectedCount}</span> selected to remove
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <RoleGate min="owner">
              <Button
                tone="destructive"
                onClick={handleApply}
                disabled={
                  applying || loading || nothingToDo || selectedCount === 0
                }
              >
                {applying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Removing…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Remove selected
                  </>
                )}
              </Button>
            </RoleGate>
          </div>
        </div>
      </div>
    </div>
  );
}
