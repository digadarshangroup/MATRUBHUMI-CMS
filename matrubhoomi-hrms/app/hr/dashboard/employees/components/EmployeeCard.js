"use client";

import {
  MoreVertical,
  Phone,
  Mail,
  Briefcase,
  Calendar,
  Edit,
  Eye,
  User,
  Fingerprint,
  IdCard,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Panel,
  Chip,
  Button,
  Skeleton,
} from "@/components/ceo/ui/Primitives";

// ── Identification hue per name (avatars), stable across renders ─────────────
const hueFor = (name = "") =>
  name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

const initialsFor = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export default function EmployeeCard({ employee, onEdit, onView }) {
  const [showMenu, setShowMenu] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null); // Changed from "" to null
  const [employeeData, setEmployeeData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Extract and normalize employee data from different API response formats
    const normalizeEmployeeData = () => {
      // Check different possible locations for employee data
      const normalized = {
        // Basic info
        id: employee.id || employee._id,
        name:
          employee.name ||
          `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
          "Unknown Employee",

        // Contact info
        email: employee.email || employee.basicInfo?.email,
        phone: employee.phone || employee.basicInfo?.phone,

        // Work info
        department: employee.department || employee.workInfo?.department,
        position:
          employee.position || employee.jobTitle || employee.workInfo?.jobTitle,
        jobTitle: employee.jobTitle || employee.workInfo?.jobTitle,
        employmentType:
          employee.employmentType || employee.workInfo?.employmentType,
        dateOfJoining:
          employee.dateOfJoining || employee.workInfo?.dateOfJoining,

        // Status
        status: employee.status || employee.workInfo?.status,

        // ID fields - Check multiple possible locations
        biometricId:
          employee.biometricId ||
          employee.workInfo?.biometricId ||
          employee.basicInfo?.biometricId,

        identityId:
          employee.identityId ||
          employee.workInfo?.identityId ||
          employee.basicInfo?.identityId,

        // Legacy employeeId for backward compatibility (if still exists)
        employeeId:
          employee.employeeId ||
          employee.workInfo?.employeeId ||
          employee.basicInfo?.employeeId,

        // Profile photo - extract URL properly
        profilePhoto: getProfilePhotoUrl(employee),
      };

      return normalized;
    };

    // Helper function to extract profile photo URL
    const getProfilePhotoUrl = (emp) => {
      // Check multiple possible locations
      const sources = [
        emp.profilePhoto?.url,
        emp.profilePhoto, // Direct string
        emp.basicInfo?.profilePhoto?.url,
        emp.basicInfo?.profilePhoto, // Direct string
        emp.documents?.profilePhoto?.url,
      ];

      // Find first valid URL
      for (const source of sources) {
        if (source && typeof source === "string" && source.trim() !== "") {
          return source;
        }
      }
      return null;
    };

    const normalizedData = normalizeEmployeeData();
    setEmployeeData(normalizedData);

    // Determine profile photo URL
    const determineProfilePhoto = () => {
      // Check for profile photo
      if (normalizedData.profilePhoto) {
        // Transform Cloudinary URL if needed
        return transformCloudinaryUrl(normalizedData.profilePhoto);
      }

      // Fallback to default avatar based on name
      return getDefaultAvatar(normalizedData.name);
    };

    const avatar = determineProfilePhoto();
    setAvatarUrl(avatar);
    setLoading(false);
  }, [employee]);

  // Function to transform Cloudinary URL for better display
  const transformCloudinaryUrl = (url) => {
    if (!url || !url.includes("cloudinary.com")) return url;

    try {
      // If it's already a full URL, return as is
      if (url.startsWith("http")) {
        // Add optimization parameters for avatar display
        if (url.includes("/upload/")) {
          const parts = url.split("/upload/");
          // Add face detection and cropping for better avatar display
          if (parts.length === 2) {
            return `${parts[0]}/upload/w_256,h_256,c_fill,g_face,q_auto,f_auto/${parts[1]}`;
          }
        }
      }
      return url;
    } catch (error) {
      console.error("Error transforming URL:", error);
      return url;
    }
  };

  // Function to get default avatar
  const getDefaultAvatar = (name) => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c3aed&color=fff&bold=true&size=256`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Not specified";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (error) {
      return "Invalid date";
    }
  };

  const getStatusTone = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "positive";
      case "inactive":
        return "overdue";
      case "on_leave":
        return "rework";
      default:
        return "neutral";
    }
  };

  // Function to get display ID (priority: biometricId > identityId > employeeId)
  const getDisplayId = () => {
    if (employeeData.biometricId) {
      return {
        type: "BioID",
        value: employeeData.biometricId,
        icon: Fingerprint,
      };
    } else if (employeeData.identityId) {
      return { type: "Identity", value: employeeData.identityId, icon: IdCard };
    } else if (employeeData.employeeId) {
      return { type: "ID", value: employeeData.employeeId, icon: IdCard };
    }
    return null;
  };

  const displayId = getDisplayId();

  // Show loading skeleton
  if (loading) {
    return (
      <Panel>
        <div className="mb-4 flex items-start gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3" />
          <Skeleton className="h-3" />
          <Skeleton className="h-3" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="group relative" label={employeeData.name}>
      {/* More Options Menu */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded-full p-1 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        {showMenu && (
          <div className="frost-bar absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-inset border border-hairline">
            <button
              onClick={() => {
                onView();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-[var(--control)]"
            >
              <Eye className="h-4 w-4" />
              View Details
            </button>
            <button
              onClick={() => {
                onEdit();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-[var(--control)]"
            >
              <Edit className="h-4 w-4" />
              Edit Employee
            </button>
          </div>
        )}
      </div>

      {/* Employee Info */}
      <div className="flex items-start gap-4 mb-4">
        <div className="relative shrink-0">
          {employeeData.profilePhoto && avatarUrl ? (
            <div className="h-10 w-10 overflow-hidden rounded-full bg-[var(--control)]">
              <img
                src={avatarUrl}
                alt={employeeData.name}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                onError={(e) => {
                  console.error("Error loading profile image:", e);
                  e.target.onerror = null;
                  e.target.src = getDefaultAvatar(employeeData.name);
                }}
              />
            </div>
          ) : (
            <span
              data-avatar-hue={hueFor(employeeData.name || "")}
              className="matrubhoomi-avatar h-10 w-10 text-xs"
              aria-hidden="true"
            >
              {initialsFor(employeeData.name || "")}
            </span>
          )}
          {/* Status indicator */}
          <div className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full border-2 border-[var(--body-bg)]">
            <div
              className={`h-full w-full rounded-full ${
                employeeData.status === "active"
                  ? "bg-[var(--state-positive)]"
                  : employeeData.status === "inactive"
                    ? "bg-[var(--state-overdue)]"
                    : "bg-[var(--control-active)]"
              }`}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col">
            <div className="mb-1 flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <h3 className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">
                  {employeeData.name}
                </h3>
                <p className="truncate text-sm text-ink-muted">
                  {employeeData.position || "No position"}
                </p>
              </div>
              <Chip tone={getStatusTone(employeeData.status)}>
                {employeeData.status === "active"
                  ? "Active"
                  : employeeData.status || "Unknown"}
              </Chip>
            </div>

            {/* Display ID with icon */}
            {displayId ? (
              <div className="mt-1 flex items-center gap-1 text-sm font-medium text-ink">
                <displayId.icon className="h-3 w-3 text-ink-faint" />
                <span>
                  {displayId.type}: <span data-figure>{displayId.value}</span>
                </span>
              </div>
            ) : (
              <p className="mt-1 text-sm font-medium text-ink-faint">
                No ID assigned
              </p>
            )}

            {/* Show identity ID as well if it exists separately from biometric ID */}
            {employeeData.biometricId && employeeData.identityId && (
              <p className="mt-1 text-xs text-ink-faint">
                Identity: <span data-figure>{employeeData.identityId}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="truncate text-ink-muted">
            {employeeData.email || "No email"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4 shrink-0 text-ink-faint" />
          <span data-figure className="text-ink-muted">
            {employeeData.phone || "No phone"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Briefcase className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="text-ink-muted">
            {employeeData.department || "No department"}
          </span>
        </div>
        {employeeData.dateOfJoining && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 shrink-0 text-ink-faint" />
            <span className="text-ink-muted">
              Joined:{" "}
              <span data-figure>{formatDate(employeeData.dateOfJoining)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={onView} className="flex-1">
          <Eye className="h-4 w-4" />
          View
        </Button>
        <Button tone="primary" size="sm" onClick={onEdit} className="flex-1">
          <Edit className="h-4 w-4" />
          Edit
        </Button>
      </div>
    </Panel>
  );
}
