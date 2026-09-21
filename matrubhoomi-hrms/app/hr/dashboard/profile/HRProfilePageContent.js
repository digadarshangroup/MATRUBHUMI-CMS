"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Save,
  KeyRound,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Panel,
  PanelHead,
  PageHead,
  Tabs,
  Field,
  Input,
  Button,
  Meter,
  SkeletonRows,
  InlineError,
} from "@/components/ceo/ui/Primitives";

export default function HRProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
    employeeId: "",
    department: "",
    role: "",
    createdAt: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  // Fetch HR profile data
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/hr/profile`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch profile");
      }

      const data = await response.json();
      if (data.success) {
        setProfileData({
          name: data.data.name || "",
          email: data.data.email || "",
          phone: data.data.phone || "",
          employeeId: data.data.employeeId || "",
          department: data.data.department || "",
          role: data.data.role || "",
          createdAt: data.data.createdAt
            ? new Date(data.data.createdAt).toLocaleDateString()
            : "",
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setMessage({ type: "error", text: "Failed to load profile data" });
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();

    if (!profileData.name || !profileData.email || !profileData.phone) {
      setMessage({ type: "error", text: "Please fill all required fields" });
      return;
    }

    try {
      setUpdating(true);
      setMessage({ type: "", text: "" });

      const response = await fetch(`${API_URL}/api/hr/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: profileData.name,
          email: profileData.email,
          phone: profileData.phone,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        // Update local state with new data
        setProfileData((prev) => ({
          ...prev,
          ...data.data,
        }));
      } else {
        setMessage({ type: "error", text: data.message || "Update failed" });
      }
    } catch (error) {
      console.error("Update error:", error);
      setMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setUpdating(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: "error", text: "Please fill all password fields" });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New passwords do not match" });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "Password must be at least 8 characters long",
      });
      return;
    }

    try {
      setChangingPassword(true);
      setMessage({ type: "", text: "" });

      const response = await fetch(`${API_URL}/api/hr/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(passwordData),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Password changed successfully!" });
        // Clear password fields
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        // Reset show passwords state
        setShowPasswords({
          current: false,
          new: false,
          confirm: false,
        });
      } else {
        setMessage({
          type: "error",
          text: data.message || "Password change failed",
        });
      }
    } catch (error) {
      console.error("Password change error:", error);
      setMessage({ type: "error", text: "Failed to change password" });
    } finally {
      setChangingPassword(false);
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const tabs = [
    { id: "profile", label: "Profile Information", icon: User },
    { id: "password", label: "Change Password", icon: KeyRound },
  ];

  if (loading) {
    return (
      <DashboardLayout activeMenu="profile">
        <div className="mx-auto max-w-[900px] px-4 py-6 deck:px-8">
          <PageHead kicker="Human resources" title="HR Profile" />
          <Panel label="Loading profile">
            <SkeletonRows rows={6} />
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="dashboard">
      <div className="mx-auto max-w-[900px] px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="HR Profile"
          sub="Manage your personal information and security settings"
        >
          {/* Tabs */}
          <Tabs
            label="Profile sections"
            value={activeTab}
            onChange={(id) => router.push(`/hr/dashboard/profile?tab=${id}`)}
            options={tabs.map((t) => ({ id: t.id, label: t.label }))}
          />
        </PageHead>

        {/* Message Alert */}
        {message.text && (
          <div className="mb-5">
            {message.type === "error" ? (
              <InlineError message={message.text} />
            ) : (
              <div
                role="status"
                className="flex items-start gap-3 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3.5 py-2.5"
              >
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-positive-ink)]" />
                <p className="text-sm text-[var(--state-positive-ink)]">
                  {message.text}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Profile Information Tab */}
        {activeTab === "profile" && (
          <Panel label="Profile Information">
            <div className="mb-6 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--control)]">
                <User className="h-7 w-7 text-ink-muted" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                  {profileData.name}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {profileData.role}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  Employee ID: <span data-figure>{profileData.employeeId}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate}>
              <div className="mb-6 grid gap-5 md:grid-cols-2">
                {/* Name Fie ld */}
                <Field label="Full Name" required>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <User className="h-4 w-4 text-ink-faint" />
                    </div>
                    <Input
                      type="text"
                      value={profileData.name}
                      onChange={(e) =>
                        setProfileData({ ...profileData, name: e.target.value })
                      }
                      className="pl-9"
                      required
                    />
                  </div>
                </Field>

                {/* Email Field */}
                <Field label="Email Address" required>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <Mail className="h-4 w-4 text-ink-faint" />
                    </div>
                    <Input
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          email: e.target.value,
                        })
                      }
                      className="pl-9"
                      required
                    />
                  </div>
                </Field>

                {/* Phone Field */}
                <Field label="Phone Number" required>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <Phone className="h-4 w-4 text-ink-faint" />
                    </div>
                    <Input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          phone: e.target.value,
                        })
                      }
                      className="pl-9"
                      data-figure
                      required
                    />
                  </div>
                </Field>

                {/* Employee ID (Readonly) */}
                <Field label="Employee ID">
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <Briefcase className="h-4 w-4 text-ink-faint" />
                    </div>
                    <Input
                      type="text"
                      value={profileData.employeeId}
                      readOnly
                      data-figure
                      className="cursor-not-allowed bg-[var(--surface-sunken)] pl-9"
                    />
                  </div>
                </Field>
              </div>

              {/* Readonly Info */}
              <div className="mb-6 grid gap-5 md:grid-cols-2">
                <Field label="Department">
                  <Input
                    type="text"
                    value={profileData.department}
                    readOnly
                    className="cursor-not-allowed bg-[var(--surface-sunken)]"
                  />
                </Field>
                <Field label="Member Since">
                  <Input
                    type="text"
                    value={profileData.createdAt}
                    readOnly
                    data-figure
                    className="cursor-not-allowed bg-[var(--surface-sunken)]"
                  />
                </Field>
              </div>

              {/* Update Button */}
              <div className="flex justify-end">
                <Button type="submit" tone="primary" disabled={updating}>
                  {updating ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Update Profile
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {activeTab === "password" && (
          <Panel label="Change Password">
            <PanelHead title="Change Password" />

            <form onSubmit={handlePasswordChange}>
              <div className="max-w-lg space-y-5">
                {/* Current Password */}
                <Field label="Current Password" required>
                  <div className="relative">
                    <Input
                      type={showPasswords.current ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          currentPassword: e.target.value,
                        })
                      }
                      className="pr-11"
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("current")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
                    >
                      {showPasswords.current ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>

                {/* New Password */}
                <Field
                  label="New Password"
                  required
                  hint="Password must be at least 8 characters long"
                >
                  <div className="relative">
                    <Input
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          newPassword: e.target.value,
                        })
                      }
                      className="pr-11"
                      placeholder="Enter new password (min. 8 characters)"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("new")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
                    >
                      {showPasswords.new ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>

                {/* Confirm Password */}
                <Field label="Confirm New Password" required>
                  <div className="relative">
                    <Input
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          confirmPassword: e.target.value,
                        })
                      }
                      className="pr-11"
                      placeholder="Confirm new password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("confirm")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
                    >
                      {showPasswords.confirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>

                {passwordData.newPassword && (
                  <div className="rounded-inset bg-[var(--surface-sunken)] p-4">
                    <h4 className="mb-2 text-sm font-medium text-ink">
                      Password Strength:
                    </h4>
                    <Meter
                      className="mb-3"
                      label="Password strength"
                      tone={
                        passwordData.newPassword.length >= 8
                          ? "default"
                          : "overdue"
                      }
                      value={Math.min(
                        (passwordData.newPassword.length / 12) * 100,
                        100,
                      )}
                    />
                    <ul className="space-y-1 text-xs text-ink-muted">
                      <li className="flex items-center gap-2">
                        {passwordData.newPassword.length >= 8 ? (
                          <CheckCircle className="h-3 w-3 text-[var(--state-positive-ink)]" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-[var(--state-overdue-ink)]" />
                        )}
                        At least 8 characters
                      </li>
                      <li className="flex items-center gap-2">
                        {/\d/.test(passwordData.newPassword) ? (
                          <CheckCircle className="h-3 w-3 text-[var(--state-positive-ink)]" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-[var(--state-overdue-ink)]" />
                        )}
                        Contains numbers
                      </li>
                      <li className="flex items-center gap-2">
                        /[A-Z]/.test(passwordData.newPassword) ? (
                        <CheckCircle className="h-3 w-3 text-[var(--state-positive-ink)]" />
                        ) : (
                        <AlertCircle className="h-3 w-3 text-[var(--state-overdue-ink)]" />
                        ) Contains uppercase letters
                      </li>
                    </ul>
                  </div>
                )}

                {/* Password Requirements */}
                <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_14%,transparent)] p-4">
                  <h4 className="mb-2 text-sm font-medium text-[var(--state-risk-ink)]">
                    Password Requirements:
                  </h4>
                  <ul className="space-y-1 text-xs text-[var(--state-risk-ink)]">
                    <li>• Minimum 8 characters</li>
                    <li>• Use a combination of letters and numbers</li>
                    <li>• Include at least one uppercase letter</li>
                    <li>• Avoid using personal information</li>
                    <li>• Don't reuse old passwords</li>
                  </ul>
                </div>

                {/* Change Button */}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    tone="primary"
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Changing Password...
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </DashboardLayout>
  );
}
