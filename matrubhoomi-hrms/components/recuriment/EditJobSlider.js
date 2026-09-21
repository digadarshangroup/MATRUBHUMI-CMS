"use client";

import { useState, useEffect } from "react";
import {
  X,
  Save,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  HelpCircle,
  Briefcase,
  MapPin,
  Calendar,
  Users,
  FileText,
  User,
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
  InlineError,
  EmptyState,
} from "@/components/ceo/ui/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const InfoButton = ({ infoText }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="ml-2 rounded-full text-ink-faint hover:text-ink focus:outline-none"
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
        <div className="frost-bar absolute top-0 left-full z-10 ml-2 w-64 rounded-card border border-hairline p-3 text-sm whitespace-normal text-ink-muted">
          {infoText}
        </div>
      )}
    </div>
  );
};

const EditJobSlider = ({ job, isOpen, onClose, onUpdate }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    jobTitle: "",
    jobLocation: "",
    lastDate: "",
    jobType: "",
    jobMode: "",
    technicalRole: false,
    description: "",
    positionsOpen: "",
    requiredSkills: [],
    experienceRequired: {
      min: "",
      max: "",
    },
    salaryRange: {
      min: "",
      max: "",
    },
    commonQuestions: [],
    tempSkill: "",
    tempQuestion: "",
  });

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [availableManagers, setAvailableManagers] = useState([]);

  useEffect(() => {
    if (job && isOpen) {
      setFormData({
        jobTitle: job.jobTitle || "",
        jobLocation: job.jobLocation || "",
        lastDate: job.lastDate
          ? new Date(job.lastDate).toISOString().split("T")[0]
          : "",
        jobType: job.jobType || "",
        jobMode: job.jobMode || "",
        technicalRole: job.technicalRole || false,
        description: job.description || "",
        positionsOpen: job.positionsOpen || "",
        requiredSkills: job.requiredSkills || [],
        experienceRequired: job.experienceRequired || { min: "", max: "" },
        salaryRange: job.salaryRange || { min: "", max: "" },
        commonQuestions: job.commonQuestions || [],
        tempSkill: "",
        tempQuestion: "",
      });

      fetchDepartments();
    }
  }, [job, isOpen]);

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
        if (job?.hiringManager?.departmentId) {
          fetchDesignations(job.hiringManager.departmentId);
        }
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  };

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
      }
    } catch (error) {
      console.error("Error fetching designations:", error);
      setDesignations([]);
    }
  };

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

  const handleAddSkill = () => {
    if (formData.tempSkill.trim()) {
      setFormData((prev) => ({
        ...prev,
        requiredSkills: [...prev.requiredSkills, prev.tempSkill.trim()],
        tempSkill: "",
      }));
    }
  };

  const handleRemoveSkill = (index) => {
    setFormData((prev) => ({
      ...prev,
      requiredSkills: prev.requiredSkills.filter((_, i) => i !== index),
    }));
  };

  const validateForm = () => {
    const errors = [];

    if (!formData.jobTitle.trim()) errors.push("Job title is required");
    if (!formData.jobLocation.trim()) errors.push("Job location is required");
    if (!formData.lastDate) errors.push("Last date is required");
    if (!formData.jobType) errors.push("Job type is required");
    if (!formData.jobMode) errors.push("Job mode is required");
    if (!formData.description.trim()) errors.push("Description is required");
    if (!formData.positionsOpen || formData.positionsOpen <= 0) {
      errors.push("Valid number of positions is required");
    }

    if (formData.lastDate && new Date(formData.lastDate) <= new Date()) {
      errors.push("Last date must be in the future");
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(", "));
      return;
    }

    setIsSubmitting(true);

    try {
      const submitData = {
        jobTitle: formData.jobTitle.trim(),
        jobLocation: formData.jobLocation.trim(),
        lastDate: formData.lastDate,
        jobType: formData.jobType,
        jobMode: formData.jobMode,
        technicalRole: formData.technicalRole,
        description: formData.description,
        positionsOpen: parseInt(formData.positionsOpen),
        commonQuestions: formData.commonQuestions.map((q, index) => ({
          ...q,
          order: index + 1,
        })),
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
      };

      const response = await fetch(
        `${API_URL}/api/hr/job-postings/${job._id}`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submitData),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update job posting");
      }

      if (data.success) {
        setSuccessMessage("Job posting updated successfully!");
        setTimeout(() => {
          onUpdate();
          onClose();
        }, 1500);
      } else {
        throw new Error(data.message || "Failed to update job posting");
      }
    } catch (error) {
      console.error("Update error:", error);
      setErrorMessage(
        error.message || "Error updating job posting. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/55"
        onClick={() => onClose(false)}
      />

      <div className="frost-bar fixed inset-y-0 right-0 z-[81] flex w-full min-h-0 flex-col border-l border-hairline md:w-3/4 lg:w-2/3 xl:w-1/2">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[19px] leading-none font-medium tracking-[-0.02em] text-ink">
              Edit Job Posting
            </h2>
            <p className="mt-1 truncate text-sm text-ink-muted">
              {job?.jobTitle}
            </p>
          </div>
          <Button
            tone="ghost"
            size="sm"
            onClick={() => onClose(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {/* Error and Success Messages */}
          {errorMessage && (
            <div className="mb-6">
              <InlineError message={errorMessage} />
            </div>
          )}

          {successMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3.5 py-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-positive-ink)]" />
              <p className="flex-1 text-sm text-[var(--state-positive-ink)]">
                {successMessage}
              </p>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <Panel label="Basic Information">
              <PanelHead
                title="Basic Information"
                aside={<Briefcase className="h-4 w-4" aria-hidden="true" />}
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
                    onChange={(e) =>
                      handleInputChange("jobType", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleInputChange("jobMode", e.target.value)
                    }
                    required
                  >
                    <option value="">Select Work Mode</option>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="remote">Remote</option>
                  </Select>
                </Field>

                {/* Technical Role */}
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
                        className="h-4 w-4 rounded-inset accent-[var(--color-ink)]"
                        required
                      />
                      <span className="text-sm text-ink-muted">
                        This is a technical role
                      </span>
                    </label>
                  </div>
                </div>

                {/* Positions Open */}
                <Field label="Positions Open *">
                  <Input
                    type="number"
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

            {/* Job Description */}
            <Panel label="Job Description">
              <PanelHead
                title="Job Description"
                aside={<FileText className="h-4 w-4" aria-hidden="true" />}
              />

              <Field label="Description *">
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  rows="6"
                  placeholder="Enter detailed job description..."
                  required
                />
              </Field>
            </Panel>

            {/* Common Questions */}
            <Panel label="Common Questions for Interview">
              <PanelHead
                title="Common Questions for Interview"
                aside={<HelpCircle className="h-4 w-4" aria-hidden="true" />}
              />

              <div className="space-y-4">
                <div className="mb-4 flex gap-2">
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
                    className="flex-1"
                    placeholder="e.g., What is your experience with React?"
                  />
                  <Button
                    type="button"
                    tone="primary"
                    onClick={handleAddQuestion}
                  >
                    <Plus className="h-4 w-4" />
                    Add Question
                  </Button>
                </div>

                {formData.commonQuestions.length > 0 ? (
                  <div className="space-y-4">
                    {formData.commonQuestions.map((question, index) => (
                      <div
                        key={index}
                        className="rounded-card border border-hairline p-4"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink-muted">
                              Question <span data-figure>{question.order}</span>
                              :
                            </span>
                          </div>
                          <Button
                            type="button"
                            tone="ghost"
                            size="sm"
                            onClick={() => handleRemoveQuestion(index)}
                            aria-label="Remove question"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                  <EmptyState compact title="No questions added yet" />
                )}
              </div>
            </Panel>

            {/* Additional Information */}
            <Panel label="Additional Information (Optional)">
              <PanelHead title="Additional Information (Optional)" />

              <div className="space-y-6">
                {/* Required Skills */}
                <div>
                  <span className="mb-2 block text-sm font-medium text-ink">
                    Required Skills
                  </span>
                  <div className="mb-2 flex gap-2">
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
                      className="flex-1"
                      placeholder="e.g., React, Node.js, MongoDB"
                    />
                    <Button
                      type="button"
                      tone="primary"
                      onClick={handleAddSkill}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>

                  {formData.requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.requiredSkills.map((skill, index) => (
                        <Chip key={index} tone="risk">
                          {skill}
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(index)}
                            className="rounded-full opacity-70 hover:opacity-100"
                            aria-label="Remove skill"
                          >
                            <X className="h-3 w-3" />
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
                      value={formData.experienceRequired.max}
                      onChange={(e) =>
                        handleInputChange(
                          "experienceRequired.max",
                          e.target.value,
                        )
                      }
                      min="0"
                      step="0.5"
                      placeholder="e.g., 5"
                    />
                  </Field>
                </div>

                {/* Salary Range */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Minimum Salary (₹)">
                    <Input
                      type="number"
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
            <div className="flex gap-3 border-t border-hairline pt-6">
              <Button
                type="button"
                tone="secondary"
                onClick={() => onClose(false)}
                className="flex-1"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                tone="primary"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Update Job Posting
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditJobSlider;
