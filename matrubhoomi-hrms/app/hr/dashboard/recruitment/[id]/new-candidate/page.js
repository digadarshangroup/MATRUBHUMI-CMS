"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  Upload,
  X,
  Plus,
  Save,
  Loader2,
  AlertCircle,
  Search,
  Briefcase,
  Building,
  Award,
  FileText,
  Eye,
  Camera,
  Check,
  Trash2,
} from "lucide-react";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Field,
  Input,
  EmptyState,
  InlineError,
  PageHead,
} from "@/components/ceo/ui/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Simplified Cloudinary upload function
const uploadToCloudinary = async (file) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "upload_preset",
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    ); // Use your existing preset

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/upload`,
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || "Upload failed");
    }

    return {
      url: data.secure_url,
      publicId: data.public_id,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error("Failed to upload file");
  }
};

// Function to get default avatar
const getDefaultAvatar = (name) => {
  const initials = name
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=7c3aed&color=fff&bold=true&size=500`;
};

export default function NewCandidatePage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id;

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(null);

  const [job, setJob] = useState(null);
  const [departmentManagers, setDepartmentManagers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [selectedManagerProfile, setSelectedManagerProfile] = useState(null);

  // File input refs
  const fileInputRefs = {
    profilePic: useRef(null),
    resume: useRef(null),
  };

  // Store Cloudinary URLs directly
  const [uploadedFiles, setUploadedFiles] = useState({
    profilePic: null, // { url: "", publicId: "" }
    resume: null, // { url: "", publicId: "" }
  });

  const [formData, setFormData] = useState({
    // Basic Information
    name: "",
    email: "",
    phone: "",

    // Experience Information
    experience: "",
    currentCompany: "",
    noticePeriod: "",
    expectedSalary: "",

    // Manager Assignment (pre-filled from job)
    managerInCharge: {
      managerId: "",
      managerName: "",
      departmentId: "",
      departmentName: "",
      designation: "",
    },

    // Job Information (pre-filled)
    jobPostingId: jobId,
    jobTitle: "",

    // Initial Stage
    stage: "screening",
    rating: 0,
  });

  const [tempDocument, setTempDocument] = useState({
    title: "",
    file: null,
  });
  const [additionalDocuments, setAdditionalDocuments] = useState([]);

  // Fetch job details and department managers

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/hr/job-postings/${jobId}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setJob(data.data);

        // Pre-fill form with job data
        setFormData((prev) => ({
          ...prev,
          jobTitle: data.data.jobTitle,
          managerInCharge: {
            managerId: data.data.hiringManager?.managerId || "",
            managerName: data.data.hiringManager?.managerName || "",
            departmentId: data.data.hiringManager?.departmentId || "",
            departmentName: data.data.hiringManager?.departmentName || "",
            designation: data.data.hiringManager?.designation || "",
          },
        }));

        // Set selected manager profile if exists
        if (data.data.hiringManager?.managerId) {
          setSelectedManagerProfile({
            id: data.data.hiringManager.managerId,
            fullName: data.data.hiringManager.managerName,
            profilePhoto: null,
          });
        }

        // Always fetch department managers for suggestions
        // Use the job's department and designation
        const departmentId = data.data.hiringManager?.departmentId;
        const designation = data.data.hiringManager?.designation;

        if (departmentId && designation) {
          await fetchDepartmentManagers(departmentId, designation);
        } else {
          console.warn("No departmentId or designation found in job data");
          setDepartmentManagers([]);
        }
      }
    } catch (error) {
      console.error("Error fetching job details:", error);
      setErrorMessage("Failed to load job details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  const fetchDepartmentManagers = async (departmentId, designation) => {
    try {
      const response = await fetch(
        `${API_URL}/api/employees/department/employees?departmentId=${departmentId}&designation=${encodeURIComponent(designation)}`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success) {
        setDepartmentManagers(data.data);
      }
    } catch (error) {
      console.error("Error fetching department managers:", error);
    }
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    const fieldPath = field.split(".");

    if (fieldPath.length === 1) {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    } else if (fieldPath.length === 2) {
      setFormData((prev) => ({
        ...prev,
        [fieldPath[0]]: {
          ...prev[fieldPath[0]],
          [fieldPath[1]]: value,
        },
      }));
    } else if (fieldPath.length === 3) {
      setFormData((prev) => ({
        ...prev,
        [fieldPath[0]]: {
          ...prev[fieldPath[0]],
          [fieldPath[1]]: {
            ...prev[fieldPath[0]][fieldPath[1]],
            [fieldPath[2]]: value,
          },
        },
      }));
    }
  };

  // Handle profile photo upload
  const handleProfilePhotoUpload = async (file) => {
    if (!file) return;

    const validImageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (!validImageTypes.includes(file.type)) {
      setErrorMessage(
        `Invalid image type. Please upload: ${validImageTypes.join(", ")}`,
      );
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setErrorMessage(
        `File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      );
      return;
    }

    setUploadingFile("profilePic");
    setErrorMessage(null);

    try {
      const uploadResult = await uploadToCloudinary(file);

      // Create preview URL for display
      const previewUrl = URL.createObjectURL(file);

      setUploadedFiles((prev) => ({
        ...prev,
        profilePic: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          previewUrl: previewUrl,
          name: file.name,
          size: file.size,
        },
      }));

      setSuccessMessage("Profile picture uploaded successfully!");
    } catch (error) {
      console.error("Profile photo upload error:", error);
      setErrorMessage(`Failed to upload profile photo: ${error.message}`);
    } finally {
      setUploadingFile(null);
    }
  };

  // Handle resume upload
  const handleResumeUpload = async (file) => {
    if (!file) return;

    const validFileTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];
    if (!validFileTypes.includes(file.type)) {
      setErrorMessage(
        `Invalid file type. Please upload PDF, DOC, DOCX, JPG, or PNG files.`,
      );
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setErrorMessage(
        `File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      );
      return;
    }

    setUploadingFile("resume");
    setErrorMessage(null);

    try {
      const uploadResult = await uploadToCloudinary(file);

      setUploadedFiles((prev) => ({
        ...prev,
        resume: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          name: file.name,
          size: file.size,
          type: file.type,
        },
      }));

      setSuccessMessage("Resume uploaded successfully!");
    } catch (error) {
      console.error("Resume upload error:", error);
      setErrorMessage(`Failed to upload resume: ${error.message}`);
    } finally {
      setUploadingFile(null);
    }
  };

  // Handle additional document upload
  const handleAddDocument = async () => {
    if (!tempDocument.title || !tempDocument.file) {
      setErrorMessage("Please provide document title and file");
      return;
    }

    const validFileTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (!validFileTypes.includes(tempDocument.file.type)) {
      setErrorMessage(
        `Invalid file type. Please upload PDF or image files (JPG, PNG, WebP).`,
      );
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (tempDocument.file.size > maxSize) {
      setErrorMessage(
        `File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      );
      return;
    }

    setUploadingFile("additional");
    setErrorMessage(null);

    try {
      const uploadResult = await uploadToCloudinary(tempDocument.file);

      const newDocument = {
        id: Date.now(),
        title: tempDocument.title,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        fileName: tempDocument.file.name,
        fileSize: tempDocument.file.size,
        fileType: tempDocument.file.type,
      };

      setAdditionalDocuments((prev) => [...prev, newDocument]);
      setTempDocument({ title: "", file: null });
      setSuccessMessage("Document added successfully!");
    } catch (error) {
      console.error("Additional document upload error:", error);
      setErrorMessage(`Failed to upload document: ${error.message}`);
    } finally {
      setUploadingFile(null);
    }
  };

  // Handle manager selection
  const handleManagerSelect = (employee) => {
    setFormData((prev) => ({
      ...prev,
      managerInCharge: {
        ...prev.managerInCharge,
        managerId: employee.id,
        managerName: `${employee.fullName} (${employee.employeeId})`,
      },
    }));
    setSelectedManagerProfile(employee);
    setShowManagerDropdown(false);
    setSearchQuery("");
  };

  // Handle manager clear
  const handleManagerClear = () => {
    setFormData((prev) => ({
      ...prev,
      managerInCharge: {
        ...prev.managerInCharge,
        managerId: "",
        managerName: "",
      },
    }));
    setSelectedManagerProfile(null);
    setSearchQuery("");
  };

  // Handle document removal
  const handleRemoveDocument = (id) => {
    setAdditionalDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  // Filter managers based on search query
  const filteredManagers = departmentManagers.filter(
    (emp) =>
      emp.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Validate form
  const validateForm = () => {
    const errors = [];

    if (!formData.name.trim()) errors.push("Candidate name is required");
    if (!formData.email.trim()) errors.push("Email is required");
    if (!formData.phone.trim()) errors.push("Phone number is required");

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      errors.push("Please enter a valid email address");
    }

    // Phone validation (basic)
    if (formData.phone.length < 10) {
      errors.push("Please enter a valid phone number (minimum 10 digits)");
    }

    // Resume is required
    if (!uploadedFiles.resume) {
      errors.push("Resume is required");
    }

    return errors;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear messages
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(", "));
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare candidate data
      const candidateData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),

        // Profile photo (optional)
        profilePic: uploadedFiles.profilePic
          ? {
              url: uploadedFiles.profilePic.url,
              publicId: uploadedFiles.profilePic.publicId,
            }
          : null,

        // Experience info
        experience: formData.experience.trim() || "Not specified",
        currentCompany: formData.currentCompany.trim() || "Not specified",
        noticePeriod: formData.noticePeriod.trim() || "Not specified",
        expectedSalary: formData.expectedSalary.trim() || "Not specified",

        // Resume (required)
        resumeUrl: uploadedFiles.resume
          ? {
              url: uploadedFiles.resume.url,
              publicId: uploadedFiles.resume.publicId,
            }
          : null,

        // Additional documents
        additionalDocuments: additionalDocuments.map((doc) => ({
          title: doc.title,
          url: doc.url,
          publicId: doc.publicId,
        })),

        // Manager assignment
        managerInCharge: formData.managerInCharge.managerId
          ? {
              managerId: formData.managerInCharge.managerId,
              managerName: formData.managerInCharge.managerName,
              departmentId: formData.managerInCharge.departmentId,
              designation: formData.managerInCharge.designation,
            }
          : null,

        // Job info
        jobPostingId: jobId,
        jobTitle: formData.jobTitle,

        // Initial stage
        stage: "screening",
        rating: 0,
      };

      console.log("Submitting candidate data:", candidateData);

      const response = await fetch(
        `${API_URL}/api/hr/candidates/${jobId}/candidates`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(candidateData),
        },
      );

      const data = await response.json();

      if (data.success) {
        setSuccessMessage("Candidate added successfully!");

        // Redirect to job details page after 2 seconds
        setTimeout(() => {
          router.push(`/hr/dashboard/recruitment/${jobId}`);
        }, 2000);
      } else {
        throw new Error(data.message || "Failed to add candidate");
      }
    } catch (error) {
      console.error("Submit error:", error);
      setErrorMessage(
        error.message || "Error adding candidate. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout activeMenu="jobs">
        <div className="mx-auto flex h-64 max-w-[1480px] items-center justify-center px-4 py-6 deck:px-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-ink)]"></div>
            <p className="mt-4 text-sm text-ink-muted">
              Loading job details...
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout activeMenu="jobs">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <Panel label="Job Not Found">
            <EmptyState
              title="Job Not Found"
              body="The job you are looking for does not exist or has been removed."
              action={
                <Button
                  tone="primary"
                  onClick={() => router.push("/hr/dashboard/recruitment")}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to Recruitment
                </Button>
              }
            />
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="jobs">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="Add New Candidate"
          sub={
            <>
              For position: <span className="text-ink">{job.jobTitle}</span>
            </>
          }
          actions={
            <Button
              tone="ghost"
              onClick={() => router.push(`/hr/dashboard/recruitment/${jobId}`)}
              aria-label="Back to job details"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          }
        />

        {/* Error and Success Messages */}
        {errorMessage && (
          <div className="mb-6 flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-overdue-ink)]"
              aria-hidden="true"
            />
            <div className="flex-1">
              <InlineError message={errorMessage} />
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 flex items-start gap-3 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3.5 py-2.5">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-positive-ink)]"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--state-positive-ink)]">
                {successMessage}
              </p>
              {successMessage.includes("successfully") && (
                <p className="mt-1 text-sm text-[var(--state-positive-ink)] opacity-80">
                  Redirecting to job details...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Information Display */}
          <Panel label="Job Information">
            <PanelHead
              title="Job Information"
              aside={
                <Briefcase className="h-5 w-5 text-ink-faint" aria-hidden="true" />
              }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-faint">Job Title:</span>
                  <span className="text-sm text-ink">{job.jobTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-faint">Department:</span>
                  <span className="text-sm text-ink">
                    {job.hiringManager?.departmentName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-faint">Work Mode:</span>
                  <span className="text-sm text-ink">
                    {job.jobMode === "onsite"
                      ? "On-site"
                      : job.jobMode === "hybrid"
                        ? "Hybrid"
                        : "Remote"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-faint">Location:</span>
                  <span className="text-sm text-ink">{job.jobLocation}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-faint">Job Type:</span>
                  <span className="text-sm text-ink">
                    {job.jobType === "full_time"
                      ? "Full Time"
                      : job.jobType === "part_time"
                        ? "Part Time"
                        : job.jobType === "contract"
                          ? "Contract"
                          : job.jobType === "intern"
                            ? "Intern"
                            : job.jobType === "temporary"
                              ? "Temporary"
                              : "Freelance"}
                  </span>
                </div>
              </div>
            </div>
          </Panel>

          {/* Section 1: Basic Information */}
          <Panel label="Basic Information">
            <PanelHead
              title="Basic Information"
              aside={<User className="h-5 w-5 text-ink-faint" aria-hidden="true" />}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* Name */}
              <Field label="Full Name *">
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter candidate's full name"
                  required
                />
              </Field>

              {/* Email */}
              <Field label="Email Address *">
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter email address"
                  required
                />
              </Field>

              {/* Phone */}
              <Field label="Phone Number *">
                <Input
                  type="tel"
                  data-figure
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="Enter phone number"
                  required
                />
              </Field>

              {/* Profile Picture */}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Profile Picture (Optional)
                </span>
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    <div className="relative">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--control)] shadow-[inset_0_0_0_1px_var(--color-hairline)]">
                        {uploadedFiles.profilePic ? (
                          <img
                            src={
                              uploadedFiles.profilePic.previewUrl ||
                              uploadedFiles.profilePic.url
                            }
                            alt="Profile"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = getDefaultAvatar(formData.name);
                            }}
                          />
                        ) : (
                          <div className="text-ink-faint">
                            <Camera className="h-10 w-10" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      {uploadingFile === "profilePic" && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
                          <Loader2
                            className="h-8 w-8 animate-spin text-slab-ink"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="rounded-inset border border-dashed border-hairline p-4">
                      <div className="text-center">
                        <p className="mb-2 text-sm text-ink-muted">
                          Upload a clear photo
                        </p>
                        <p className="mb-3 text-xs text-ink-faint">
                          JPG, PNG, WebP (Max: 5MB)
                        </p>
                        <input
                          type="file"
                          className="hidden"
                          id="profilePhotoUpload"
                          ref={fileInputRefs.profilePic}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleProfilePhotoUpload(file);
                            }
                          }}
                          accept=".jpg,.jpeg,.png,.webp"
                          disabled={uploadingFile}
                        />
                        <RoleGate min="editor">
                          <label
                            htmlFor="profilePhotoUpload"
                            className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium tracking-[-0.012em] text-[var(--body-bg)] transition-opacity duration-[180ms] hover:opacity-90
                          ${uploadingFile ? "cursor-not-allowed opacity-50" : ""}`}
                          >
                            <Upload className="h-4 w-4" aria-hidden="true" />
                            {uploadedFiles.profilePic
                              ? "Change Photo"
                              : "Choose Photo"}
                          </label>
                        </RoleGate>
                      </div>
                      {uploadedFiles.profilePic && !uploadingFile && (
                        <div className="mt-3 text-center">
                          <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                            <Check className="h-3 w-3" aria-hidden="true" />
                            Photo uploaded successfully
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          {/* Section 2: Experience Information */}
          <Panel label="Experience Information (Optional)">
            <PanelHead
              title="Experience Information (Optional)"
              aside={<Award className="h-5 w-5 text-ink-faint" aria-hidden="true" />}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* Experience */}
              <Field label="Experience">
                <Input
                  type="text"
                  value={formData.experience}
                  onChange={(e) =>
                    handleInputChange("experience", e.target.value)
                  }
                  placeholder="e.g., 5 years"
                />
              </Field>

              {/* Current Company */}
              <Field label="Current Company">
                <Input
                  type="text"
                  value={formData.currentCompany}
                  onChange={(e) =>
                    handleInputChange("currentCompany", e.target.value)
                  }
                  placeholder="e.g., Tech Corp"
                />
              </Field>

              {/* Notice Period */}
              <Field label="Notice Period">
                <Input
                  type="text"
                  value={formData.noticePeriod}
                  onChange={(e) =>
                    handleInputChange("noticePeriod", e.target.value)
                  }
                  placeholder="e.g., 30 days"
                />
              </Field>

              {/* Expected Salary */}
              <Field label="Expected Salary">
                <Input
                  type="text"
                  data-figure
                  value={formData.expectedSalary}
                  onChange={(e) =>
                    handleInputChange("expectedSalary", e.target.value)
                  }
                  placeholder="e.g., ₹15,00,000"
                />
              </Field>
            </div>
          </Panel>

          {/* Section 3: Manager Assignment */}
          <Panel label="Manager Assignment">
            <PanelHead
              title="Manager Assignment"
              aside={
                <Building className="h-5 w-5 text-ink-faint" aria-hidden="true" />
              }
            />

            <div className="space-y-4">
              {/* Department and Designation (Read-only) */}
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Department">
                  <Input
                    type="text"
                    value={job.hiringManager?.departmentName || "Not specified"}
                    readOnly
                    className="bg-[var(--surface-sunken)]"
                  />
                </Field>

                <Field label="Designation">
                  <Input
                    type="text"
                    value={job.hiringManager?.designation || "Not specified"}
                    readOnly
                    className="bg-[var(--surface-sunken)]"
                  />
                </Field>
              </div>

              {/* Manager Selection */}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Manager In Charge
                </span>

                {formData.managerInCharge.managerName ? (
                  <div className="flex items-center justify-between gap-3 rounded-inset bg-[var(--surface-sunken)] p-3">
                    <div className="flex items-center gap-3">
                      {selectedManagerProfile?.profilePhoto?.url ? (
                        <img
                          src={selectedManagerProfile.profilePhoto.url}
                          alt={selectedManagerProfile.fullName}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--control)]">
                          <User
                            className="h-5 w-5 text-ink-muted"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-ink">
                          {selectedManagerProfile?.fullName ||
                            formData.managerInCharge.managerName}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {job.hiringManager?.designation}
                        </p>
                        <p className="text-xs text-ink-faint">
                          {job.hiringManager?.departmentName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleManagerClear}
                      className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                      aria-label="Clear manager"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center">
                      <Search
                        className="absolute left-3 z-10 h-4 w-4 text-ink-faint"
                        aria-hidden="true"
                      />
                      <Input
                        type="text"
                        placeholder="Search for managers..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowManagerDropdown(true);
                        }}
                        onFocus={() => setShowManagerDropdown(true)}
                        onBlur={() =>
                          setTimeout(() => setShowManagerDropdown(false), 200)
                        }
                        disabled={departmentManagers.length === 0}
                      />
                    </div>

                    {showManagerDropdown && departmentManagers.length > 0 && (
                      <div className="frost-bar scroll-slim absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-inset border border-hairline">
                        {filteredManagers.length === 0 ? (
                          <div className="p-4 text-center text-sm text-ink-muted">
                            No employees found matching your search
                          </div>
                        ) : (
                          filteredManagers.map((employee) => (
                            <button
                              key={employee.id}
                              type="button"
                              className="w-full border-b border-hairline px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--row-hover)]"
                              onClick={() => handleManagerSelect(employee)}
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              <div className="flex items-center gap-3">
                                {employee.profilePhoto?.url ? (
                                  <img
                                    src={employee.profilePhoto.url}
                                    alt={employee.fullName}
                                    className="h-10 w-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--control)]">
                                    <User
                                      className="h-4 w-4 text-ink-muted"
                                      aria-hidden="true"
                                    />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="font-medium text-ink">
                                    {employee.fullName || "Employee"}
                                  </div>
                                  <div className="text-sm text-ink-muted">
                                    {employee.designation ||
                                      job.hiringManager?.designation}
                                  </div>
                                  <div className="mt-1 text-xs text-ink-faint">
                                    {employee.email || "No email"}
                                  </div>
                                </div>
                                <Chip tone="neutral">Select</Chip>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {departmentManagers.length === 0 && (
                      <p className="mt-1 text-sm text-ink-faint">
                        No managers found for this department and designation.
                      </p>
                    )}
                  </div>
                )}

                <p className="mt-2 text-xs text-ink-faint">
                  Select the manager who will be in charge of this candidate's
                  recruitment process. You can change the manager later if
                  needed.
                </p>
              </div>
            </div>
          </Panel>

          {/* Section 4: Documents */}
          <Panel label="Documents">
            <PanelHead
              title="Documents"
              aside={
                <FileText className="h-5 w-5 text-ink-faint" aria-hidden="true" />
              }
            />

            <div className="space-y-6">
              {/* Resume Upload */}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Resume / CV *
                </span>
                <div className="space-y-3">
                  {uploadedFiles.resume ? (
                    <div className="flex items-center justify-between gap-3 rounded-inset bg-[var(--surface-sunken)] p-3">
                      <div className="flex items-center gap-3">
                        <FileText
                          className="h-5 w-5 text-[var(--state-positive-ink)]"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-ink">Resume</p>
                          <p className="text-sm text-ink-muted">
                            {uploadedFiles.resume.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            window.open(uploadedFiles.resume.url, "_blank")
                          }
                          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                          title="View Resume"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setUploadedFiles((prev) => ({
                              ...prev,
                              resume: null,
                            }))
                          }
                          className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                          aria-label="Remove resume"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-inset border border-dashed border-hairline p-6 text-center">
                      <Upload
                        className="mx-auto mb-3 h-8 w-8 text-ink-faint"
                        aria-hidden="true"
                      />
                      <p className="mb-2 text-sm text-ink-muted">
                        Upload candidate's resume
                      </p>
                      <p className="mb-4 text-xs text-ink-faint">
                        Supported formats: PDF, DOC, DOCX, JPG, PNG (Max: 10MB)
                      </p>
                      <input
                        type="file"
                        id="resume"
                        className="hidden"
                        ref={fileInputRefs.resume}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleResumeUpload(file);
                          }
                        }}
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        disabled={uploadingFile}
                      />
                      <RoleGate min="editor">
                        <label
                          htmlFor="resume"
                          className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[15px] font-medium tracking-[-0.012em] text-[var(--body-bg)] transition-opacity duration-[180ms] hover:opacity-90
                          ${uploadingFile ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          Choose File
                        </label>
                      </RoleGate>
                      {uploadingFile === "resume" && (
                        <div className="mt-3">
                          <Loader2
                            className="mx-auto h-5 w-5 animate-spin text-ink-muted"
                            aria-hidden="true"
                          />
                          <p className="mt-2 text-sm text-ink-muted">
                            Uploading...
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Documents */}
              <div>
                <span className="mb-3 block text-sm font-medium text-ink">
                  Additional Documents (Optional)
                </span>

                <div className="space-y-4">
                  {/* Add Document Form */}
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="text"
                      placeholder="Document title"
                      className="min-w-[200px] flex-1"
                      value={tempDocument.title}
                      onChange={(e) =>
                        setTempDocument((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="file"
                      id="additionalDoc"
                      className="hidden"
                      onChange={(e) =>
                        setTempDocument((prev) => ({
                          ...prev,
                          file: e.target.files?.[0] || null,
                        }))
                      }
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      disabled={uploadingFile}
                    />
                    <RoleGate min="editor">
                      <label
                        htmlFor="additionalDoc"
                        className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--control)] px-4 py-2 text-[15px] font-medium tracking-[-0.012em] text-ink transition-colors duration-[180ms] hover:bg-[var(--control-hover)]
                        ${uploadingFile ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        Choose File
                      </label>
                    </RoleGate>
                    <RoleGate min="editor">
                      <Button
                        tone="primary"
                        type="button"
                        onClick={handleAddDocument}
                        disabled={
                          !tempDocument.title ||
                          !tempDocument.file ||
                          uploadingFile
                        }
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add
                      </Button>
                    </RoleGate>
                  </div>

                  {tempDocument.file && (
                    <div className="flex items-center justify-between gap-3 rounded-inset bg-[var(--surface-sunken)] p-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">Selected file:</p>
                        <p className="truncate text-sm text-ink-muted">
                          {tempDocument.file.name}
                        </p>
                        <p data-figure className="text-xs text-ink-faint">
                          {(tempDocument.file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setTempDocument({ title: "", file: null })
                        }
                        className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                        aria-label="Clear selected file"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  {uploadingFile === "additional" && (
                    <div className="rounded-inset bg-[var(--surface-sunken)] p-4 text-center">
                      <Loader2
                        className="mx-auto mb-2 h-6 w-6 animate-spin text-ink-muted"
                        aria-hidden="true"
                      />
                      <p className="text-sm text-ink-muted">
                        Uploading document...
                      </p>
                    </div>
                  )}

                  {/* Documents List */}
                  {additionalDocuments.length > 0 && (
                    <div className="space-y-2">
                      {additionalDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-inset bg-[var(--surface-sunken)] p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText
                              className="h-5 w-5 shrink-0 text-ink-faint"
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">
                                {doc.title}
                              </p>
                              <p className="truncate text-sm text-ink-muted">
                                {doc.fileName}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => window.open(doc.url, "_blank")}
                              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                              title="View Document"
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDocument(doc.id)}
                              className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                              aria-label={`Remove ${doc.title}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          {/* Form Actions */}
          <Panel label="Form actions">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                tone="secondary"
                type="button"
                onClick={() =>
                  router.push(`/hr/dashboard/recruitment/${jobId}`)
                }
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>

              <RoleGate min="editor">
                <Button
                  tone="primary"
                  type="submit"
                  disabled={isSubmitting || uploadingFile}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Adding Candidate...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Add Candidate
                    </>
                  )}
                </Button>
              </RoleGate>
            </div>
          </Panel>
        </form>
      </div>
    </DashboardLayout>
  );
}
