"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Calendar,
  Users,
  User,
  Building,
  FileText,
  DollarSign,
  Award,
  MessageSquare,
  CheckCircle,
  Clock,
  XCircle,
  Edit,
  Download,
  Search,
  ChevronRight,
  ChevronLeft,
  Mail,
  Phone,
  Plus,
  Eye,
  Trash2,
  MoreVertical,
  ExternalLink,
  BookOpen,
  Target,
  TrendingUp,
  IndianRupee,
  X,
  Save,
  CalendarIcon,
  Clock as ClockIcon,
  MapPin as MapPinIcon,
  MessageCircle,
  Star,
  Archive,
  Check,
} from "lucide-react";
import RoleGate from "@/components/access/RoleGate";
import EditJobSlider from "@/components/recuriment/EditJobSlider";
import CandidateDetailsSlider from "../../../../../components//recuriment/CandidateDetailsSlider";
import {
  Panel,
  Chip,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  EmptyState,
  PageHead,
} from "@/components/ceo/ui/Primitives";
// import CandidateDetailsSlider from "@/components/CandidateDetailsSlider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Stage badge component (Updated with new stages)
const StageBadge = ({ stage }) => {
  const getStageInfo = (stage) => {
    switch (stage) {
      case "screening":
        return {
          tone: "risk",
          icon: Eye,
          label: "Screening",
        };
      case "technical_interview":
        return {
          tone: "extension",
          icon: Target,
          label: "Technical Interview",
        };
      case "hr_interview":
        return {
          tone: "rework",
          icon: User,
          label: "HR Interview",
        };
      case "training":
        return {
          tone: "neutral",
          icon: BookOpen,
          label: "Training",
        };
      case "hired":
        return {
          tone: "positive",
          icon: CheckCircle,
          label: "Hired",
        };
      case "rejected":
        return {
          tone: "overdue",
          icon: XCircle,
          label: "Rejected",
        };
      default:
        return {
          tone: "neutral",
          icon: Clock,
          label: stage,
        };
    }
  };

  const stageInfo = getStageInfo(stage);
  const Icon = stageInfo.icon;

  return (
    <Chip tone={stageInfo.tone}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {stageInfo.label}
    </Chip>
  );
};

// Rating stars component
const RatingStars = ({ rating }) => {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`h-4 w-4 ${star <= rating ? "text-[var(--state-extension)]" : "text-[var(--control-active)]"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

const ScheduleMeetingModal = ({
  isOpen,
  onClose,
  candidate,
  job,
  jobId,
  onSchedule,
}) => {
  const [formData, setFormData] = useState({
    title: `Interview with ${candidate?.name}`,
    description: "",
    type: "interview",
    scheduledDate: "",
    scheduledTime: "",
    duration: 60,
    location: "",
    meetingRoom: "",
    remarks: "",
    interviewStage: candidate?.stage || "screening",
    interviewType: "in_person",
  });

  const [loading, setLoading] = useState(false);
  const [hasExistingInterview, setHasExistingInterview] = useState(false);

  // Get manager information with proper fallbacks
  const getManagerInfo = () => {
    // Priority 1: Candidate's assigned manager
    if (job?.hiringManager.managerName) {
      return {
        name: job.hiringManager?.managerName,
        id: job.hiringManager.managerId || null,
      };
    }

    // Priority 2: Job's hiring manager name
    if (job?.hiringManager?.managerName) {
      return {
        name: job.hiringManager.managerName,
        id: job.hiringManager.managerId || null,
      };
    }

    // Priority 3: Job's hiring manager object
    if (job?.hiringManagerName) {
      return {
        name:
          typeof job.hiringManager.managerName === "string"
            ? job.hiringManager.managerName
            : "Not assigned",
        id: null,
      };
    }

    return {
      name: "Not assigned",
      id: null,
    };
  };

  const managerInfo = getManagerInfo();

  // Check if candidate already has a scheduled interview
  useEffect(() => {
    if (isOpen && candidate && jobId) {
      checkExistingInterview();

      // Determine next stage based on current stage and job type
      let nextStage = candidate.stage;

      // If candidate is in training, show warning
      if (candidate.stage === "training") {
        // Show warning about already completed interviews
        setHasExistingInterview(true);

        // For training stage, schedule a follow-up meeting
        nextStage = "training_followup";
      } else if (candidate.stage === "screening") {
        nextStage = job?.technicalRole ? "technical_interview" : "hr_interview";
      } else if (
        candidate.stage === "technical_interview" ||
        candidate.stage === "hr_interview"
      ) {
        nextStage = "training";
      } else if (candidate.stage === "training") {
        nextStage = "hired";
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const formattedDate = tomorrow.toISOString().split("T")[0];

      setFormData({
        title:
          candidate.stage === "training"
            ? `Follow-up Meeting with ${candidate.name}`
            : `Interview with ${candidate.name}`,
        description:
          candidate.stage === "training"
            ? `Follow-up discussion for ${candidate.jobTitle} position`
            : `Interview for ${candidate.jobTitle} position`,
        type: "interview",
        scheduledDate: formattedDate,
        scheduledTime: "10:00",
        duration: 60,
        location: "",
        meetingRoom: "",
        remarks:
          candidate.stage === "training"
            ? "Candidate is in training stage. This is a follow-up meeting."
            : "",
        interviewStage: nextStage,
        interviewType: "in_person",
      });
    }
  }, [isOpen, candidate, jobId, job?.technicalRole]);

  const checkExistingInterview = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/hr/tasks/candidate/${candidate.id}?status=scheduled&type=interview`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        setHasExistingInterview(true);
      }
    } catch (error) {
      console.error("Error checking existing interview:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.scheduledDate || !formData.scheduledTime) {
      alert("Please select date and time");
      return;
    }

    // Check if candidate already has a scheduled interview
    if (hasExistingInterview) {
      if (
        !confirm(
          "This candidate already has a scheduled interview. Do you want to schedule another one?",
        )
      ) {
        return;
      }
    }

    // Get user info from localStorage or context
    const userData = JSON.parse(localStorage.getItem("user") || "{}");

    setLoading(true);
    try {
      // Get the HR user who is creating the task as the interviewer
      const hrUserResponse = await fetch(`${API_URL}/api/hr/profile`, {
        credentials: "include",
      });
      const hrUserData = await hrUserResponse.json();
      const interviewer = hrUserData.data || {};

      const taskData = {
        ...formData,
        candidateId: candidate.id,
        jobPostingId: jobId, // Use the jobId from route params
        departmentId: job.hiringManager?.departmentId,
        departmentName: job.hiringManager?.departmentName || job.department,
        designation: job.hiringManager?.designation || job.designation,
        createdBy: userData.id || "user-id-placeholder",
        createdByName: userData.name || "HR Manager",
        participants: [
          // Interviewee (the candidate)
          {
            employeeId: null, // Candidate doesn't have employee ID yet
            name: candidate.name,
            email: candidate.email,
            role: "interviewee",
            status: "invited",
          },
          // Interviewer (Use managerInfo or HR user)
          {
            employeeId: managerInfo.id || interviewer._id || null,
            name: managerInfo.name || interviewer.name || "Interviewer",
            email: interviewer.email || "",
            role: "interviewer",
            status: "invited",
          },
        ],
      };

      const response = await fetch(`${API_URL}/api/hr/tasks`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      if (data.success) {
        alert("Meeting scheduled successfully!");
        onSchedule();
        onClose();
      } else {
        alert(data.message || "Failed to schedule meeting");
        if (data.missingFields) {
          console.error("Missing fields:", data.missingFields);
        }
      }
    } catch (error) {
      console.error("Error scheduling meeting:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="frost-bar flex max-h-full min-h-0 w-full max-w-xl flex-col rounded-panel border border-hairline"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                {hasExistingInterview
                  ? "Reschedule Interview"
                  : "Schedule Interview"}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                with {candidate?.name}
              </p>
              {hasExistingInterview && (
                <div className="mt-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-2">
                  <p className="text-sm text-[var(--state-rework-ink)]">
                    ⚠️ This candidate already has a scheduled interview
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
          >
            {/* Department Info (Read-only) */}
            <div className="space-y-2 rounded-inset bg-[var(--surface-sunken)] p-3">
              <div className="flex items-center gap-2">
                <Building
                  className="h-4 w-4 text-ink-faint"
                  aria-hidden="true"
                />
                <span className="text-sm text-ink">
                  {job.hiringManager?.departmentName ||
                    job.department ||
                    "Not specified"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                <span className="text-sm text-ink">
                  {job.hiringManager?.designation ||
                    job.designation ||
                    "Not specified"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                <span className="text-sm font-medium text-ink">
                  Manager: {managerInfo.name}
                </span>
              </div>
            </div>

            {/* Participants Info */}
            <div className="space-y-2 rounded-inset bg-[var(--surface-sunken)] p-3">
              <h4 className="text-sm font-medium text-ink">Participants</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {candidate.name}
                    </p>
                    <p className="text-xs text-ink-faint">Interviewee</p>
                  </div>
                  <Chip tone="positive">Candidate</Chip>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {managerInfo.name}
                    </p>
                    <p className="text-xs text-ink-faint">Interviewer</p>
                  </div>
                  <Chip tone="risk">Interviewer</Chip>
                </div>
              </div>
            </div>

            {/* Title */}
            <Field label="Interview Title *">
              <Input
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </Field>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date *">
                <div className="relative">
                  <CalendarIcon
                    className="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    aria-hidden="true"
                  />
                  <Input
                    type="date"
                    data-figure
                    value={formData.scheduledDate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scheduledDate: e.target.value,
                      })
                    }
                    min={new Date().toISOString().split("T")[0]}
                    className="pl-10"
                    required
                  />
                </div>
              </Field>
              <Field label="Time *">
                <div className="relative">
                  <ClockIcon
                    className="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    aria-hidden="true"
                  />
                  <Input
                    type="time"
                    data-figure
                    value={formData.scheduledTime}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scheduledTime: e.target.value,
                      })
                    }
                    className="pl-10"
                    required
                  />
                </div>
              </Field>
            </div>

            {/* Duration */}
            <Field label="Duration (minutes)">
              <Select
                value={formData.duration}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration: parseInt(e.target.value),
                  })
                }
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </Select>
            </Field>

            {/* Interview Stage */}
            <Field label="Interview Stage">
              <Select
                value={formData.interviewStage}
                onChange={(e) =>
                  setFormData({ ...formData, interviewStage: e.target.value })
                }
              >
                <option value="screening">Screening</option>
                {job.technicalRole && (
                  <option value="technical_interview">
                    Technical Interview
                  </option>
                )}
                <option value="hr_interview">HR Interview</option>
                <option value="final">Final Interview</option>
              </Select>
            </Field>

            {/* Interview Type */}
            <Field label="Interview Type">
              <Select
                value={formData.interviewType}
                onChange={(e) =>
                  setFormData({ ...formData, interviewType: e.target.value })
                }
              >
                <option value="in_person">In Person</option>
                <option value="virtual">Virtual</option>
                <option value="phone">Phone</option>
              </Select>
            </Field>

            {/* Location - Show only for in-person interviews */}
            {formData.interviewType === "in_person" && (
              <Field label="Location / Room">
                <div className="relative">
                  <MapPinIcon
                    className="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    aria-hidden="true"
                  />
                  <Input
                    type="text"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    placeholder="Conference Room A, etc."
                    className="pl-10"
                  />
                </div>
              </Field>
            )}

            {/* Meeting Link - Show only for virtual interviews */}
            {formData.interviewType === "virtual" && (
              <Field label="Meeting Link">
                <Input
                  type="text"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                />
              </Field>
            )}

            {/* Remarks */}
            <Field label="Remarks / Notes">
              <div className="relative">
                <MessageCircle
                  className="absolute top-3 left-3 z-10 h-4 w-4 text-ink-faint"
                  aria-hidden="true"
                />
                <Textarea
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  placeholder="Additional notes or instructions for the interview..."
                  className="pl-10"
                  rows="3"
                />
              </div>
            </Field>

            {/* Warning if existing interview */}
            {hasExistingInterview && (
              <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-3">
                <p className="text-sm text-[var(--state-rework-ink)]">
                  ⚠️ Note: This candidate already has a scheduled interview.
                  Scheduling another interview might cause scheduling conflicts.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                tone="secondary"
                type="button"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <RoleGate min="editor">
                <Button
                  tone="primary"
                  type="submit"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Scheduling..." : "Schedule Interview"}
                </Button>
              </RoleGate>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

// Info component for job metadata
const Info = ({ label, value, icon }) => (
  <div className="flex min-w-0 flex-col">
    <div className="mb-1 flex items-center gap-2 text-xs text-ink-faint">
      {icon}
      <span>{label}</span>
    </div>
    <p data-figure className="text-sm text-ink">
      {value || "Not specified"}
    </p>
  </div>
);

export default function JobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id;

  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [filteredCandidates, setFilteredCandidates] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [showCandidateSlider, setShowCandidateSlider] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [departmentManagers, setDepartmentManagers] = useState([]);
  const [showEditSlider, setShowEditSlider] = useState(false);

  const candidatesPerPage = 8;

  // Fetch job details and candidates
  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
      fetchCandidates();
    }
  }, [jobId]);

  // Filter candidates based on search and stage
  useEffect(() => {
    let result = candidates;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (candidate) =>
          candidate.name.toLowerCase().includes(query) ||
          candidate.email.toLowerCase().includes(query) ||
          candidate.jobTitle.toLowerCase().includes(query),
      );
    }

    if (stageFilter !== "all") {
      result = result.filter((candidate) => candidate.stage === stageFilter);
    }

    setFilteredCandidates(result);
    setCurrentPage(1);
  }, [searchQuery, stageFilter, candidates]);

  // Fetch job details from API
  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/hr/job-postings/${jobId}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setJob(data.data);

        // Fetch department managers for suggestions
        if (data.data.hiringManager?.departmentId) {
          fetchDepartmentManagers(
            data.data.hiringManager.departmentId,
            data.data.hiringManager.designation,
          );
        }
      }
    } catch (error) {
      console.error("Error fetching job details:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch department managers for suggestions
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

  // Fetch candidates from API
  // Update fetchCandidates function
  const fetchCandidates = async () => {
    try {
      const response = await fetch(`${API_URL}/api/hr/candidates/${jobId}/`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        // Check for scheduled interviews for each candidate
        const candidatesWithInterviewStatus = await Promise.all(
          data.data.map(async (candidate) => {
            try {
              const interviewResponse = await fetch(
                `${API_URL}/api/hr/candidates/${jobId}/candidates/${candidate.id}/interviews`,
                {
                  credentials: "include",
                },
              );
              const interviewData = await interviewResponse.json();
              return {
                ...candidate,
                hasScheduledInterview: interviewData.data?.some(
                  (interview) => interview.status === "scheduled",
                ),
              };
            } catch (error) {
              console.error("Error fetching interview status:", error);
              return candidate;
            }
          }),
        );

        setCandidates(candidatesWithInterviewStatus);
        setFilteredCandidates(candidatesWithInterviewStatus);
      } else {
        setCandidates([]);
        setFilteredCandidates([]);
      }
    } catch (error) {
      console.error("Error fetching candidates:", error);
      setCandidates([]);
      setFilteredCandidates([]);
    }
  };

  // Get hiring manager name with proper fallback
  const getHiringManagerName = () => {
    if (job?.hiringManager?.managerName) {
      return job.hiringManager.managerName;
    }
    if (job?.hiringManager && typeof job.hiringManager === "string") {
      return job.hiringManager;
    }
    if (job?.hiringManager && typeof job.hiringManager === "object") {
      // Try to extract name from object
      return job.hiringManager.name || "Not assigned";
    }
    return "Not assigned";
  };

  // Calculate pagination
  const totalPages = Math.ceil(filteredCandidates.length / candidatesPerPage);
  const startIndex = (currentPage - 1) * candidatesPerPage;
  const endIndex = startIndex + candidatesPerPage;
  const currentCandidates = filteredCandidates.slice(startIndex, endIndex);

  // Export to CSV function
  const exportToExcel = () => {
    const hiringManagerName = getHiringManagerName();

    const csvContent = [
      [
        "Name",
        "Email",
        "Phone",
        "Applied Date",
        "Stage",
        "Job Title",
        "Experience",
        "Current Company",
        "Notice Period",
        "Expected Salary",
        "Status",
        "Rating",
        "Manager In Charge",
      ],
      ...filteredCandidates.map((candidate) => [
        candidate.name,
        candidate.email,
        candidate.phone,
        new Date(candidate.appliedDate).toLocaleDateString(),
        candidate.stage,
        candidate.jobTitle,
        candidate.experience || "Not specified",
        candidate.currentCompany || "Not specified",
        candidate.noticePeriod || "Not specified",
        candidate.expectedSalary || "Not specified",
        candidate.status,
        candidate.rating,
        candidate.managerInCharge || hiringManagerName,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates_${job?.jobTitle?.replace(/\s+/g, "_") || "job"}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Handle candidate selection
  const toggleCandidateSelection = (candidateId) => {
    setSelectedCandidates((prev) =>
      prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : [...prev, candidateId],
    );
  };

  // Select all candidates on current page
  const selectAllOnPage = () => {
    const pageIds = currentCandidates.map((c) => c.id);
    if (selectedCandidates.length === pageIds.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(pageIds);
    }
  };

  // Handle candidate deletion
  const deleteCandidate = async (id) => {
    if (confirm("Are you sure you want to delete this candidate?")) {
      try {
        const response = await fetch(
          `${API_URL}/api/hr/candidates/${jobId}/candidates/${id}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );

        const data = await response.json();

        if (data.success) {
          // Refresh candidates list
          fetchCandidates();
          setSelectedCandidates((prev) =>
            prev.filter((candidateId) => candidateId !== id),
          );
        }
      } catch (error) {
        console.error("Error deleting candidate:", error);
      }
    }
  };

  // Handle stage change via API
  const updateCandidateStage = async (id, newStage) => {
    try {
      const response = await fetch(
        `${API_URL}/api/hr/candidates/${jobId}/candidates/${id}/stage`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stage: newStage }),
        },
      );

      const data = await response.json();

      if (data.success) {
        // Refresh candidates list
        fetchCandidates();
      } else {
        console.error("Failed to update stage:", data.message);
      }
    } catch (error) {
      console.error("Error updating candidate stage:", error);
    }
  };

  // Format job status for display
  const getJobStatus = (status) => {
    switch (status) {
      case "active":
        return { label: "Active", tone: "positive" };
      case "draft":
        return { label: "Draft", tone: "rework" };
      case "closed":
        return { label: "Closed", tone: "overdue" };
      default:
        return { label: status, tone: "neutral" };
    }
  };

  const handleViewCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setShowCandidateSlider(true);
  };

  const handleScheduleMeeting = (candidate) => {
    setSelectedCandidate(candidate);
    setShowScheduleModal(true);
  };

  const handleCloseSlider = (refresh = false) => {
    setShowCandidateSlider(false);
    setSelectedCandidate(null);
    if (refresh) {
      fetchCandidates();
    }
  };

  const handleCloseScheduleModal = () => {
    setShowScheduleModal(false);
  };

  const handleMeetingScheduled = () => {
    fetchCandidates(); // Refresh to show updated stage
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

  // Format job data
  const jobStatus = getJobStatus(job.status);
  const hiringManagerName = getHiringManagerName();

  const formattedJob = {
    ...job,
    title: job.jobTitle,
    department:
      job.hiringManager?.departmentName || job.department || "Not specified",
    location: job.jobLocation,
    employmentType:
      job.jobType === "full_time"
        ? "Full Time"
        : job.jobType === "part_time"
          ? "Part Time"
          : job.jobType === "contract"
            ? "Contract"
            : job.jobType === "intern"
              ? "Intern"
              : job.jobType === "temporary"
                ? "Temporary"
                : "Freelance",
    experience: job.experienceRequired
      ? `${job.experienceRequired.min || "0"} - ${job.experienceRequired.max || "Not specified"} years`
      : "Not specified",
    openings: job.positionsOpen,
    salary: job.salaryRange
      ? `₹${job.salaryRange.min?.toLocaleString("en-IN") || "0"} - ₹${job.salaryRange.max?.toLocaleString("en-IN") || "Not specified"}`
      : "Not specified",
    postedOn: new Date(job.createdAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    lastDate: new Date(job.lastDate).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    description: job.description || "No description provided",
    responsibilities: job.responsibilities || [],
    skills: job.requiredSkills || [],
    status: jobStatus.label,
    statusTone: jobStatus.tone,
    hiringManagerName: hiringManagerName,
  };

  return (
    <DashboardLayout activeMenu="jobs">
      <div className="mx-auto max-w-[1480px] space-y-4 px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="Job Details & Candidates"
          actions={
            <>
              <Button
                tone="ghost"
                onClick={() => router.push("/hr/dashboard/recruitment")}
                aria-label="Back to recruitment"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <RoleGate min="editor">
                <Button
                  tone="secondary"
                  onClick={() => setShowEditSlider(true)}
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit Job
                </Button>
              </RoleGate>
            </>
          }
        />

        {/* Job Information Section - Redesigned */}
        <Panel label={formattedJob.title} className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-[22px] leading-tight font-medium tracking-[-0.025em] text-ink">
                {formattedJob.title}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {formattedJob.department}
              </p>
            </div>
            <Chip tone={formattedJob.statusTone}>{formattedJob.status}</Chip>
          </div>

          {/* Core Job Metadata */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info
              label="Location"
              value={formattedJob.location}
              icon={<MapPin size={16} />}
            />
            <Info
              label="Employment"
              value={formattedJob.employmentType}
              icon={<Briefcase size={16} />}
            />
            <Info
              label="Experience"
              value={formattedJob.experience}
              icon={<Users size={16} />}
            />
            <Info
              label="Openings"
              value={formattedJob.openings}
              icon={<Users size={16} />}
            />
            <Info
              label="Salary"
              value={formattedJob.salary}
              icon={<IndianRupee size={16} />}
            />
            <Info
              label="Work Mode"
              value={
                job.jobMode === "onsite"
                  ? "On-site"
                  : job.jobMode === "hybrid"
                    ? "Hybrid"
                    : "Remote"
              }
              icon={<TrendingUp size={16} />}
            />
            <Info
              label="Posted On"
              value={formattedJob.postedOn}
              icon={<Calendar size={16} />}
            />
            <Info
              label="Last Date"
              value={formattedJob.lastDate}
              icon={<Calendar size={16} />}
            />
          </div>

          {/* Hiring Manager Information */}
          {formattedJob.hiringManagerName && (
            <div className="border-t border-hairline pt-4">
              <Info
                label="Hiring Manager"
                value={formattedJob.hiringManagerName}
                icon={<User size={16} />}
              />
            </div>
          )}

          {/* Mandatory Job Description */}
          <div className="space-y-3 border-t border-hairline pt-4">
            <h3 className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.02em] text-ink">
              <FileText size={18} aria-hidden="true" /> Job Description
            </h3>
            <div className="max-w-none">
              {formattedJob.description.split("\n").map((paragraph, index) => (
                <p key={index} className="mb-2 text-sm leading-relaxed text-ink">
                  {paragraph || (
                    <span className="text-ink-faint italic">
                      No description provided
                    </span>
                  )}
                </p>
              ))}
            </div>
          </div>

          {/* Responsibilities & Skills */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {formattedJob.responsibilities.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink">
                  Responsibilities
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
                  {formattedJob.responsibilities.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {formattedJob.skills.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink">
                  Required Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {formattedJob.skills.map((skill, i) => (
                    <Chip key={i} tone="neutral">
                      {skill}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Common Questions */}
          {job.commonQuestions && job.commonQuestions.length > 0 && (
            <div className="border-t border-hairline pt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">
                Common Interview Questions
              </h3>
              <ul className="space-y-2">
                {job.commonQuestions.map((question, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <MessageSquare
                      className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-ink-muted">
                      {question.question}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Candidates Section */}
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[17px] font-medium tracking-[-0.02em] text-ink">
              Candidates
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Manage and track all applicants for this position
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RoleGate min="editor">
              <Button
                tone="primary"
                onClick={() =>
                  router.push(
                    `/hr/dashboard/recruitment/${jobId}/new-candidate`,
                  )
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Candidate
              </Button>
            </RoleGate>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <Panel label="Search and filter candidates">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  className="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  placeholder="Search candidates by name, email, or job title..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Select
                className="sm:w-56"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                aria-label="Filter by stage"
              >
                <option value="all">All Stages</option>
                <option value="screening">Screening</option>
                {job.technicalRole && (
                  <option value="technical_interview">
                    Technical Interview
                  </option>
                )}
                <option value="hr_interview">HR Interview</option>
                <option value="training">Training</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              {selectedCandidates.length > 0 && (
                <span className="text-sm text-ink-faint">
                  <span data-figure>{selectedCandidates.length}</span> selected
                </span>
              )}
              <Button tone="secondary" onClick={exportToExcel}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </Button>
            </div>
          </div>
        </Panel>

        {/* Candidates Table - Fixed to prevent horizontal scrolling */}
        <Panel padded={false} label="Candidates">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-12 border-b border-hairline px-3 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={
                        selectedCandidates.length ===
                          currentCandidates.length &&
                        currentCandidates.length > 0
                      }
                      onChange={selectAllOnPage}
                      aria-label="Select all on page"
                      className="h-4 w-4 accent-[var(--color-ink)]"
                    />
                  </th>

                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Candidate
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Contact
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Applied Date
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Stage
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Manager
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Rating
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {currentCandidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="transition-colors hover:bg-[var(--row-hover)]"
                  >
                    {/* Checkbox */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.includes(candidate.id)}
                        onChange={() => toggleCandidateSelection(candidate.id)}
                        aria-label={`Select ${candidate.name}`}
                        className="h-4 w-4 accent-[var(--color-ink)]"
                      />
                    </td>

                    {/* Candidate */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0">
                          {candidate.profilePic ? (
                            <img
                              src={candidate.profilePic.url}
                              alt={candidate.name}
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
                        </div>

                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium text-ink"
                            title={candidate.name}
                          >
                            {candidate.name}
                          </p>
                          <p
                            className="truncate text-xs text-ink-faint"
                            title={candidate.jobTitle}
                          >
                            {candidate.jobTitle}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Mail
                            className="h-4 w-4 shrink-0 text-ink-faint"
                            aria-hidden="true"
                          />
                          <span
                            className="block truncate text-sm text-ink-muted"
                            title={candidate.email}
                          >
                            {candidate.email}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-2">
                          <Phone
                            className="h-4 w-4 shrink-0 text-ink-faint"
                            aria-hidden="true"
                          />
                          <span
                            data-figure
                            className="block truncate text-sm text-ink-muted"
                          >
                            {candidate.phone}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Applied Date */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <div
                        data-figure
                        className="text-sm whitespace-nowrap text-ink"
                      >
                        {new Date(candidate.appliedDate).toLocaleDateString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </div>
                    </td>

                    {/* Stage */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <StageBadge stage={candidate.stage} />
                    </td>

                    {/* Manager */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <div
                        className="truncate text-sm text-ink"
                        title={formattedJob.hiringManagerName}
                      >
                        {formattedJob.hiringManagerName}
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <RatingStars rating={candidate.rating} />
                    </td>

                    {/* Actions */}
                    <td className="border-b border-hairline px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewCandidate(candidate)}
                          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                          title="View"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>

                        <RoleGate min="editor">
                          <button
                            onClick={() => handleScheduleMeeting(candidate)}
                            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                            title={
                              candidate.hasScheduledInterview
                                ? "Reschedule Meeting"
                                : "Schedule Meeting"
                            }
                            disabled={
                              candidate.stage === "rejected" ||
                              candidate.stage === "hired"
                            }
                          >
                            {candidate.hasScheduledInterview ? (
                              <Clock className="w-4 h-4" />
                            ) : (
                              <CalendarIcon className="w-4 h-4" />
                            )}
                          </button>
                        </RoleGate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
              <div className="text-sm text-ink-muted">
                Showing <span data-figure>{startIndex + 1}</span> to{" "}
                <span data-figure>
                  {Math.min(endIndex, filteredCandidates.length)}
                </span>{" "}
                of <span data-figure>{filteredCandidates.length}</span>{" "}
                candidates
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="rounded-full bg-[var(--control)] px-3 py-1.5 text-ink transition-colors hover:bg-[var(--control-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page =
                    totalPages <= 5
                      ? i + 1
                      : currentPage <= 3
                        ? i + 1
                        : currentPage >= totalPages - 2
                          ? totalPages - 4 + i
                          : currentPage - 2 + i;

                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      data-figure
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        currentPage === page
                          ? "bg-ink text-[var(--body-bg)]"
                          : "bg-[var(--control)] text-ink hover:bg-[var(--control-hover)]"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="rounded-full bg-[var(--control)] px-3 py-1.5 text-ink transition-colors hover:bg-[var(--control-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* Empty State */}
        {filteredCandidates.length === 0 && (
          <Panel label="No candidates found">
            <EmptyState
              title="No candidates found"
              body={
                searchQuery || stageFilter !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "No candidates have applied for this position yet"
              }
              action={
                <RoleGate min="editor">
                  <Button
                    tone="primary"
                    onClick={() =>
                      router.push(
                        `/hr/dashboard/recruitment/${jobId}/new-candidate`,
                      )
                    }
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add First Candidate
                  </Button>
                </RoleGate>
              }
            />
          </Panel>
        )}
      </div>
      {showCandidateSlider && selectedCandidate && (
        <CandidateDetailsSlider
          candidate={selectedCandidate}
          job={formattedJob}
          isOpen={showCandidateSlider}
          onClose={handleCloseSlider}
          onScheduleMeeting={handleScheduleMeeting}
          onArchive={handleCloseSlider}
        />
      )}

      {showScheduleModal && selectedCandidate && (
        <ScheduleMeetingModal
          isOpen={showScheduleModal}
          onClose={handleCloseScheduleModal}
          candidate={selectedCandidate}
          job={job}
          jobId={jobId}
          onSchedule={handleMeetingScheduled}
        />
      )}
      {showEditSlider && job && (
        <EditJobSlider
          job={job}
          isOpen={showEditSlider}
          onClose={(refresh) => {
            setShowEditSlider(false);
            if (refresh) {
              fetchJobDetails();
            }
          }}
          onUpdate={fetchJobDetails}
        />
      )}
    </DashboardLayout>
  );
}
