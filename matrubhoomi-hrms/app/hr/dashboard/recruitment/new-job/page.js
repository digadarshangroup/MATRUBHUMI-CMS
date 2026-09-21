"use client";

import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  MapPin,
  Calendar,
  Users,
  FileText,
  User,
  Check,
  Search,
  X,
  Save,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  HelpCircle,
} from "lucide-react";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Field,
  Input,
  Textarea,
  Select,
  EmptyState,
  InlineError,
  PageHead,
} from "@/components/ceo/ui/Primitives";

const InfoButton = ({ infoText }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="ml-2 text-ink-faint transition-colors hover:text-ink focus:outline-none"
        aria-label="Information"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {showTooltip && (
        <div className="frost-bar absolute top-0 left-full z-10 ml-2 w-64 rounded-inset border border-hairline p-3 text-sm whitespace-normal text-ink-muted">
          {infoText}
        </div>
      )}
    </div>
  );
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function NewJobPostingPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Dynamic data states
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [availableManagers, setAvailableManagers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [selectedManagerProfile, setSelectedManagerProfile] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    // Basic Information
    jobTitle: "",
    jobLocation: "",
    lastDate: "",
    jobType: "",
    jobMode: "",
    technicalRole: false,

    // Hiring Manager Information
    hiringManager: {
      departmentId: "",
      departmentName: "",
      designation: "",
      managerId: "",
      managerName: "",
    },

    // Job Details
    description: "",
    positionsOpen: "",

    // Common Questions
    commonQuestions: [],

    // Additional Information (optional)
    requiredSkills: [],
    experienceRequired: {
      min: "",
      max: "",
    },
    salaryRange: {
      min: "",
      max: "",
    },

    // Temporary fields for inputs
    tempSkill: "",
    tempQuestion: "",
  });

  // Fetch departments on component mount
  useEffect(() => {
    fetchDepartments();
  }, []);

  // Fetch departments from API
  const fetchDepartments = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/hr/departments/with-designations`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success) {
        setDepartments(data.data);
      } else {
        setErrorMessage("Failed to load departments");
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      setErrorMessage("Error loading departments");
    }
  };

  // Fetch designations when department is selected
  const fetchDesignations = async (departmentId) => {
    if (!departmentId) {
      setDesignations([]);
      setAvailableManagers([]);
      return;
    }

    try {
      const selectedDept = departments.find((dept) => dept.id === departmentId);
      if (selectedDept) {
        setDesignations(selectedDept.designations || []);
        // Reset designation when department changes
        setFormData((prev) => ({
          ...prev,
          hiringManager: {
            ...prev.hiringManager,
            departmentId: departmentId,
            departmentName: selectedDept.name,
            designation: "",
            managerId: "",
            managerName: "",
          },
        }));
        setSelectedManagerProfile(null);
      }
    } catch (error) {
      console.error("Error fetching designations:", error);
      setDesignations([]);
    }
  };

  // Fetch managers for selected department and designation
  const fetchManagers = async (departmentId, designation) => {
    if (!departmentId || !designation) {
      setAvailableManagers([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/employees/department/employees?departmentId=${departmentId}&designation=${encodeURIComponent(designation)}`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success) {
        setAvailableManagers(data.data);
      } else {
        setAvailableManagers([]);
      }
    } catch (error) {
      console.error("Error fetching managers:", error);
      setAvailableManagers([]);
    }
  };

  // Handle department change
  const handleDepartmentChange = (departmentId) => {
    fetchDesignations(departmentId);
  };

  // Handle designation change
  const handleDesignationChange = (designation) => {
    setFormData((prev) => ({
      ...prev,
      hiringManager: {
        ...prev.hiringManager,
        designation: designation,
        managerId: "",
        managerName: "",
      },
    }));
    setSelectedManagerProfile(null);

    // Fetch managers for this designation
    if (formData.hiringManager.departmentId && designation) {
      fetchManagers(formData.hiringManager.departmentId, designation);
    }
  };

  // Handle manager selection
  const handleManagerSelect = (employee) => {
    setFormData((prev) => ({
      ...prev,
      hiringManager: {
        ...prev.hiringManager,
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
      hiringManager: {
        ...prev.hiringManager,
        managerId: "",
        managerName: "",
      },
    }));
    setSelectedManagerProfile(null);
    setSearchQuery("");
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

  // Handle common questions
  const handleAddQuestion = () => {
    if (formData.tempQuestion.trim()) {
      const newQuestion = {
        question: formData.tempQuestion.trim(),
        order: formData.commonQuestions.length + 1,
      };

      setFormData((prev) => ({
        ...prev,
        commonQuestions: [...prev.commonQuestions, newQuestion],
        tempQuestion: "",
      }));
    }
  };

  const handleUpdateQuestion = (index, value) => {
    const updatedQuestions = [...formData.commonQuestions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      question: value,
    };

    setFormData((prev) => ({
      ...prev,
      commonQuestions: updatedQuestions,
    }));
  };

  const handleRemoveQuestion = (index) => {
    const updatedQuestions = formData.commonQuestions
      .filter((_, i) => i !== index)
      .map((question, idx) => ({
        ...question,
        order: idx + 1,
      }));

    setFormData((prev) => ({
      ...prev,
      commonQuestions: updatedQuestions,
    }));
  };

  // Handle array field additions
  const handleAddSkill = () => {
    if (formData.tempSkill.trim()) {
      setFormData((prev) => ({
        ...prev,
        requiredSkills: [...prev.requiredSkills, prev.tempSkill.trim()],
        tempSkill: "",
      }));
    }
  };

  // Handle array field removals
  const handleRemoveSkill = (index) => {
    setFormData((prev) => ({
      ...prev,
      requiredSkills: prev.requiredSkills.filter((_, i) => i !== index),
    }));
  };

  // Validate form
  const validateForm = () => {
    const errors = [];

    // Basic Information validation
    if (!formData.jobTitle.trim()) errors.push("Job title is required");
    if (!formData.jobLocation.trim()) errors.push("Job location is required");
    if (!formData.lastDate) errors.push("Last date is required");
    if (!formData.jobType) errors.push("Job type is required");
    if (!formData.jobMode) errors.push("Job mode is required");
    if (
      formData.technicalRole === undefined ||
      formData.technicalRole === null
    ) {
      errors.push("Technical role selection is required");
    }

    // Hiring Manager validation
    if (!formData.hiringManager.departmentId)
      errors.push("Department is required");
    if (!formData.hiringManager.designation)
      errors.push("Designation is required");
    if (!formData.hiringManager.managerId)
      errors.push("Hiring manager is required");

    // Job Details validation
    if (!formData.description.trim()) errors.push("Description is required");
    if (!formData.positionsOpen || formData.positionsOpen <= 0) {
      errors.push("Valid number of positions is required");
    }

    // Date validation
    if (formData.lastDate && new Date(formData.lastDate) <= new Date()) {
      errors.push("Last date must be in the future");
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
      // Prepare data for submission
      const submitData = {
        jobTitle: formData.jobTitle.trim(),
        jobLocation: formData.jobLocation.trim(),
        lastDate: formData.lastDate,
        jobType: formData.jobType,
        jobMode: formData.jobMode,
        technicalRole: formData.technicalRole,
        hiringManager: {
          departmentId: formData.hiringManager.departmentId,
          departmentName: formData.hiringManager.departmentName,
          designation: formData.hiringManager.designation,
          managerId: formData.hiringManager.managerId,
          managerName: formData.hiringManager.managerName,
        },
        description: formData.description,
        positionsOpen: parseInt(formData.positionsOpen),
        commonQuestions: formData.commonQuestions,
        requiredSkills: formData.requiredSkills,
        experienceRequired: {
          min: formData.experienceRequired.min
            ? parseInt(formData.experienceRequired.min)
            : 0,
          max: formData.experienceRequired.max
            ? parseInt(formData.experienceRequired.max)
            : null,
        },
        salaryRange: {
          min: formData.salaryRange.min
            ? parseInt(formData.salaryRange.min)
            : null,
          max: formData.salaryRange.max
            ? parseInt(formData.salaryRange.max)
            : null,
        },
        status: "published", // Always publish directly
      };

      console.log("Submitting job posting:", submitData);

      const response = await fetch(`${API_URL}/api/hr/job-postings`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create job posting");
      }

      if (data.success) { 
        setSuccessMessage("Job posting created successfully!");

        // Redirect to job postings list after 2 seconds
        setTimeout(() => {
          router.push("/hr/dashboard/recruitment");
        }, 2000);
      } else {
        throw new Error(data.message || "Failed to create job posting");
      }
    } catch (error) {
      console.error("Submit error:", error);
      setErrorMessage(
        error.message || "Error creating job posting. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter managers based on search query
  const filteredManagers = availableManagers.filter(
    (emp) =>
      emp.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  return (
    <DashboardLayout activeMenu="jobs">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="Create New Job Posting"
          sub="Fill in all the required details below"
          actions={
            <Button
              tone="ghost"
              onClick={() => router.push("/hr/dashboard/recruitment")}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Recruitment
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
            <Check
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-positive-ink)]"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--state-positive-ink)]">
                {successMessage}
              </p>
              <p className="mt-1 text-sm text-[var(--state-positive-ink)] opacity-80">
                Redirecting to job postings list...
              </p>
            </div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Information */}
          <Panel label="Basic Information">
            <PanelHead
              title="Basic Information"
              aside={
                <Briefcase className="h-5 w-5 text-ink-faint" aria-hidden="true" />
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* Job Title */}
              <Field label="Job Title *">
                <Input
                  type="text"
                  value={formData.jobTitle}
                  onChange={(e) =>
                    handleInputChange("jobTitle", e.target.value)
                  }
                  placeholder="e.g., Senior Frontend Developer"
                  required
                />
              </Field>

              {/* Job Location */}
              <Field label="Job Location *">
                <Input
                  type="text"
                  value={formData.jobLocation}
                  onChange={(e) =>
                    handleInputChange("jobLocation", e.target.value)
                  }
                  placeholder="e.g., Mumbai, India"
                  required
                />
              </Field>

              {/* Last Date */}
              <Field label="Last Date to Apply *">
                <Input
                  type="date"
                  data-figure
                  value={formData.lastDate}
                  onChange={(e) =>
                    handleInputChange("lastDate", e.target.value)
                  }
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </Field>

              {/* Job Type */}
              <Field label="Job Type *">
                <Select
                  value={formData.jobType}
                  onChange={(e) => handleInputChange("jobType", e.target.value)}
                  required
                >
                  <option value="">Select Job Type</option>
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                  <option value="temporary">Temporary</option>
                  <option value="freelance">Freelance</option>
                </Select>
              </Field>

              {/* Job Mode */}
              <Field label="Work Mode *">
                <Select
                  value={formData.jobMode}
                  onChange={(e) => handleInputChange("jobMode", e.target.value)}
                  required
                >
                  <option value="">Select Work Mode</option>
                  <option value="onsite">On-site</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </Select>
              </Field>

              {/* NEW: Technical Role Checkbox */}
              <div>
                <span className="mb-1.5 flex items-center text-sm font-medium text-ink">
                  Technical Role *
                  <InfoButton infoText="Check this if this role requires technical skills. This helps in scheduling appropriate interviews (technical tests vs general assessments)." />
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.technicalRole}
                      onChange={(e) =>
                        handleInputChange("technicalRole", e.target.checked)
                      }
                      className="h-4 w-4 accent-[var(--color-ink)]"
                      required
                    />
                    <span className="text-sm text-ink">
                      This is a technical role
                    </span>
                  </label>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  Technical roles require specialized skills assessment (coding
                  tests, technical interviews).
                </p>
              </div>

              {/* Positions Open */}
              <Field label="Positions Open *">
                <Input
                  type="number"
                  data-figure
                  value={formData.positionsOpen}
                  onChange={(e) =>
                    handleInputChange("positionsOpen", e.target.value)
                  }
                  min="1"
                  placeholder="e.g., 3"
                  required
                />
              </Field>
            </div>
          </Panel>

          {/* Section 2: Hiring Manager Information */}
          <Panel label="Hiring Manager Information">
            <PanelHead
              title="Hiring Manager Information"
              aside={<User className="h-5 w-5 text-ink-faint" aria-hidden="true" />}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* Department Selection */}
              {/* Department Selection */}
              <div>
                <span className="mb-1.5 flex items-center text-sm font-medium text-ink">
                  Department *
                  <InfoButton infoText="Select the department where this position will be located." />
                </span>
                <Select
                  value={formData.hiringManager.departmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  required
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Designation Selection */}
              <div>
                <span className="mb-1.5 flex items-center text-sm font-medium text-ink">
                  Designation *
                  <InfoButton infoText="Select the job designation/level. Designations are specific to each department." />
                </span>
                <Select
                  value={formData.hiringManager.designation}
                  onChange={(e) => handleDesignationChange(e.target.value)}
                  required
                  disabled={!formData.hiringManager.departmentId}
                >
                  <option value="">Select Designation</option>
                  {designations.map((designation, index) => (
                    <option key={index} value={designation}>
                      {designation}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Hiring Manager Selection */}
              <div className="md:col-span-2">
                <span className="mb-1.5 flex items-center text-sm font-medium text-ink">
                  Hiring Manager *
                  <InfoButton infoText="Select the manager who will conduct interviews and make hiring decisions. Only employees from the selected department and designation are shown." />
                </span>

                {formData.hiringManager.managerName ? (
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
                          {selectedManagerProfile?.fullName || "Employee Name"}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {formData.hiringManager.designation}
                        </p>
                        <p className="text-xs text-ink-faint">
                          {formData.hiringManager.departmentName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleManagerClear}
                      className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                      aria-label="Clear hiring manager"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center">
                      <Search
                        className="absolute left-3 h-4 w-4 text-ink-faint"
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
                        disabled={
                          !formData.hiringManager.departmentId ||
                          !formData.hiringManager.designation
                        }
                      />
                    </div>

                    {showManagerDropdown && (
                      <div className="frost-bar scroll-slim absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-inset border border-hairline">
                        {availableManagers.length === 0 ? (
                          <div className="p-4 text-center text-sm text-ink-muted">
                            {!formData.hiringManager.departmentId ||
                            !formData.hiringManager.designation
                              ? "Select department and designation first"
                              : "No employees found for this designation"}
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
                                    {employee.designation || "No Designation"}
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
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {/* Section 3: Job Description */}
          <Panel label="Job Description">
            <PanelHead
              title="Job Description"
              aside={
                <FileText className="h-5 w-5 text-ink-faint" aria-hidden="true" />
              }
            />

            <div>
              <span className="mb-1.5 flex items-center text-sm font-medium text-ink">
                Description *
                <InfoButton infoText="Detailed description of the job including responsibilities, requirements, and expectations. Minimum 200 characters recommended." />
              </span>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                rows="6"
                placeholder="Enter detailed job description including responsibilities, requirements, and expectations..."
                required
              />
            </div>
          </Panel>

          {/* Section 4: Common Questions for Interview */}
          <Panel label="Common Questions for Interview">
            <PanelHead
              title="Common Questions for Interview"
              aside={
                <HelpCircle
                  className="h-5 w-5 text-ink-faint"
                  aria-hidden="true"
                />
              }
            />

            <div className="space-y-4">
              <div>
                <p className="mb-3 text-sm text-ink-muted">
                  Add common questions that will be asked during interviews.
                  These will be used to rate candidates.
                </p>

                <div className="mb-4 flex flex-wrap gap-2">
                  <Input
                    type="text"
                    value={formData.tempQuestion}
                    onChange={(e) =>
                      handleInputChange("tempQuestion", e.target.value)
                    }
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), handleAddQuestion())
                    }
                    className="min-w-[220px] flex-1"
                    placeholder="e.g., What is your experience with React?"
                  />
                  <Button tone="primary" type="button" onClick={handleAddQuestion}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Question
                  </Button>
                </div>

                {/* Fixed: Use div instead of p to contain InfoButton */}
                <div className="flex items-center gap-1 text-xs text-ink-faint">
                  <InfoButton infoText="These questions will be used during interviews to evaluate candidates. Interviewers will rate candidates on each question (1-5 scale)." />
                  <span>
                    Add questions that help assess candidate's suitability
                  </span>
                </div>
              </div>

              {formData.commonQuestions.length > 0 ? (
                <div className="space-y-4">
                  {formData.commonQuestions.map((question, index) => (
                    <div
                      key={index}
                      className="rounded-inset border border-hairline p-4"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            Question <span data-figure>{question.order}</span>:
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(index)}
                          className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                          aria-label="Remove question"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <Input
                        type="text"
                        value={question.question}
                        onChange={(e) =>
                          handleUpdateQuestion(index, e.target.value)
                        }
                        placeholder="Enter question..."
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-inset border border-dashed border-hairline">
                  <EmptyState
                    compact
                    title="No questions added yet"
                    body="Add common interview questions to evaluate candidates"
                  />
                </div>
              )}
            </div>
          </Panel>

          {/* Section 5: Additional Information (Optional) */}
          <Panel label="Additional Information (Optional)">
            <PanelHead
              title="Additional Information (Optional)"
              aside={
                <Briefcase className="h-5 w-5 text-ink-faint" aria-hidden="true" />
              }
            />

            <div className="space-y-6">
              {/* Required Skills */}
              <div>
                <span className="mb-2 block text-sm font-medium text-ink">
                  Required Skills
                </span>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Input
                    type="text"
                    value={formData.tempSkill}
                    onChange={(e) =>
                      handleInputChange("tempSkill", e.target.value)
                    }
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), handleAddSkill())
                    }
                    className="min-w-[220px] flex-1"
                    placeholder="e.g., React, Node.js, MongoDB"
                  />
                  <Button tone="primary" type="button" onClick={handleAddSkill}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add
                  </Button>
                </div>

                {formData.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.requiredSkills.map((skill, index) => (
                      <Chip key={index} tone="neutral">
                        {skill}
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(index)}
                          className="text-ink-faint transition-colors hover:text-ink"
                          aria-label={`Remove ${skill}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              {/* Experience Required */}
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Minimum Experience (years)">
                  <Input
                    type="number"
                    data-figure
                    value={formData.experienceRequired.min}
                    onChange={(e) =>
                      handleInputChange(
                        "experienceRequired.min",
                        e.target.value,
                      )
                    }
                    min="0"
                    step="0.5"
                    placeholder="e.g., 2"
                  />
                </Field>
                <Field label="Maximum Experience (years)">
                  <Input
                    type="number"
                    data-figure
                    value={formData.experienceRequired.max}
                    onChange={(e) =>
                      handleInputChange(
                        "experienceRequired.max",
                        e.target.value,
                      )
                    }
                    min="0"
                    step="0.5"
                    placeholder="e.g., 5 (optional)"
                  />
                </Field>
              </div>

              {/* Salary Range */}
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Minimum Salary (₹)">
                  <Input
                    type="number"
                    data-figure
                    value={formData.salaryRange.min}
                    onChange={(e) =>
                      handleInputChange("salaryRange.min", e.target.value)
                    }
                    min="0"
                    placeholder="e.g., 500000"
                  />
                </Field>
                <Field label="Maximum Salary (₹)">
                  <Input
                    type="number"
                    data-figure
                    value={formData.salaryRange.max}
                    onChange={(e) =>
                      handleInputChange("salaryRange.max", e.target.value)
                    }
                    min="0"
                    placeholder="e.g., 1000000"
                  />
                </Field>
              </div>
            </div>
          </Panel>

          {/* Form Actions */}
          <Panel label="Form actions">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                tone="secondary"
                type="button"
                onClick={() => router.push("/hr/dashboard/recruitment")}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>

              <RoleGate min="editor">
                <Button tone="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Creating Job Posting...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Create Job Posting
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
