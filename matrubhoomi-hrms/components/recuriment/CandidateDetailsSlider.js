"use client";

import { useState, useEffect } from "react";
import {
  User,
  Edit,
  X,
  Save,
  CalendarIcon,
  Archive,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  MessageCircle,
  Star,
  Eye,
  Trash2,
  ExternalLink,
  FileText,
  Send,
  Download,
  AlertCircle,
  Mail,
  Phone,
} from "lucide-react";
import OfferLetterModal from "../OfferLetter";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Input,
} from "@/components/ceo/ui/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const hueFor = (name = "") =>
  name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

const initialsFor = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

// Stage badge component (keep existing)
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
          icon: Clock,
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
          tone: "extension",
          icon: ArrowRight,
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
      <Icon className="h-3 w-3" />
      {stageInfo.label}
    </Chip>
  );
};

// Rating stars component (keep existing)
const RatingStars = ({ rating }) => {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`h-4 w-4 ${star <= rating ? "text-ink" : "text-[var(--control-active)]"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

const CandidateDetailsSlider = ({
  candidate,
  job,
  isOpen,
  onClose,
  onScheduleMeeting,
  onUpdateStage,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCandidate, setEditedCandidate] = useState(candidate);
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [scheduledInterviews, setScheduledInterviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showOfferLetterModal, setShowOfferLetterModal] = useState(false);

  // New states for training stage
  const [offerLetterData, setOfferLetterData] = useState({
    salary: "",
    joiningDate: "",
    designation: "",
    department: "",
    reportingManager: "",
    workLocation: "",
    employmentType: "full_time",
    noticePeriod: "",
  });
  const [sendingOffer, setSendingOffer] = useState(false);
  const [offerSent, setOfferSent] = useState(false);

  useEffect(() => {
    if (candidate && isOpen) {
      setEditedCandidate(candidate);
      fetchCandidateDetails();
      // Initialize offer letter data if candidate is in training
      if (candidate.stage === "training") {
        initializeOfferLetterData();
      }
    }
  }, [candidate, isOpen]);

  const fetchCandidateDetails = async () => {
    try {
      const [detailsResponse, interviewsResponse] = await Promise.all([
        fetch(
          `${API_URL}/api/hr/candidates/${candidate.jobPostingId}/candidates/${candidate.id}/details`,
          {
            credentials: "include",
          },
        ),
        fetch(
          `${API_URL}/api/hr/candidates/${candidate.jobPostingId}/candidates/${candidate.id}/interviews`,
          {
            credentials: "include",
          },
        ),
      ]);

      const detailsData = await detailsResponse.json();
      const interviewsData = await interviewsResponse.json();

      if (detailsData.success) {
        setInterviewQuestions(detailsData.data.interviewQuestions || []);
      }

      if (interviewsData.success) {
        setScheduledInterviews(interviewsData.data || []);
      }
    } catch (error) {
      console.error("Error fetching candidate details:", error);
    }
  };

  const initializeOfferLetterData = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7); // Default joining date: 7 days from now

    setOfferLetterData({
      salary: candidate.expectedSalary || job.salaryRange?.min || "₹30,000",
      joiningDate: tomorrow.toISOString().split("T")[0],
      designation: job.hiringManager?.designation || "Employee",
      department: job.hiringManager?.departmentName || "Not specified",
      reportingManager: job.hiringManager?.managerName || "Not assigned",
      workLocation: job.jobLocation || "Office Location",
      employmentType: "full_time",
      noticePeriod: candidate.noticePeriod || "15 days",
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/hr/candidates/${candidate.jobPostingId}/candidates/${candidate.id}`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(editedCandidate),
        },
      );

      const data = await response.json();
      if (data.success) {
        setIsEditing(false);
        onClose(true);
      }
    } catch (error) {
      console.error("Error updating candidate:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectCandidate = async () => {
    if (confirm("Are you sure you want to reject this candidate?")) {
      try {
        setActionLoading(true);
        const response = await fetch(
          `${API_URL}/api/hr/candidates/${candidate.jobPostingId}/candidates/${candidate.id}/stage`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ stage: "rejected" }),
          },
        );

        const data = await response.json();
        if (data.success) {
          onClose(true);
        }
      } catch (error) {
        console.error("Error rejecting candidate:", error);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleNextStage = async () => {
    const currentStage = candidate.stage;
    let nextStage = null;

    // Determine next stage based on current stage and job type
    if (currentStage === "training") {
      nextStage = "hired";
    } else if (
      currentStage === "hr_interview" ||
      currentStage === "technical_interview"
    ) {
      nextStage = "training";
    } else if (currentStage === "screening") {
      nextStage = job.technicalRole ? "technical_interview" : "hr_interview";
    }

    if (nextStage) {
      if (confirm(`Move candidate to ${nextStage.replace("_", " ")} stage?`)) {
        try {
          setActionLoading(true);
          const response = await fetch(
            `${API_URL}/api/hr/candidates/${candidate.jobPostingId}/candidates/${candidate.id}/stage`,
            {
              method: "PATCH",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ stage: nextStage }),
            },
          );

          const data = await response.json();
          if (data.success) {
            onClose(true);
          }
        } catch (error) {
          console.error("Error updating candidate stage:", error);
        } finally {
          setActionLoading(false);
        }
      }
    }
  };

  const handleHireCandidate = async () => {
    if (confirm("Are you sure you want to hire this candidate?")) {
      try {
        setActionLoading(true);
        const response = await fetch(
          `${API_URL}/api/hr/candidates/${candidate.jobPostingId}/candidates/${candidate.id}/stage`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ stage: "hired" }),
          },
        );

        const data = await response.json();
        if (data.success) {
          onClose(true);
        }
      } catch (error) {
        console.error("Error hiring candidate:", error);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const formatInterviewDateTime = (date, time) => {
    const dateObj = new Date(date);
    return `${dateObj.toLocaleDateString()} at ${time}`;
  };

  const getNextStageLabel = () => {
    const currentStage = candidate.stage;

    if (currentStage === "training") return "Hire Candidate";
    if (
      currentStage === "hr_interview" ||
      currentStage === "technical_interview"
    )
      return "Move to Training";
    if (currentStage === "screening") {
      return job.technicalRole
        ? "Move to Technical Interview"
        : "Move to HR Interview";
    }
    return "Next Step";
  };

  const hasScheduledInterview = scheduledInterviews.some(
    (interview) => interview.status === "scheduled",
  );

  const isInterviewCompleted = ["technical_interview", "hr_interview"].includes(
    candidate.stage,
  );

  const isTrainingStage = candidate.stage === "training";

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/55"
        onClick={() => onClose(false)}
      />

      <div className="frost-bar fixed inset-y-0 right-0 z-[81] flex w-full min-h-0 flex-col border-l border-hairline md:w-3/4 lg:w-2/3 xl:w-[40%]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[19px] leading-none font-medium tracking-[-0.02em] text-ink">
              Candidate Details
            </h2>
            <p className="mt-1 truncate text-sm text-ink-muted">
              {candidate.jobTitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              tone="ghost"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              aria-label="Edit candidate"
            >
              <Edit className="h-5 w-5" />
            </Button>
            <Button
              tone="ghost"
              size="sm"
              onClick={() => onClose(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {/* Candidate Profile */}
          <div className="mb-6 flex items-center gap-4 rounded-card bg-[var(--surface-sunken)] p-4">
            {candidate.profilePic ? (
              <img
                src={candidate.profilePic.url}
                alt={candidate.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                data-avatar-hue={hueFor(candidate.name || "")}
                className="matrubhoomi-avatar h-16 w-16 shrink-0 text-sm font-medium"
                aria-hidden="true"
              >
                {initialsFor(candidate.name || "")}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">
                {candidate.name}
              </h3>
              <p className="truncate text-sm text-ink-muted">
                {candidate.email}
              </p>
              <p className="truncate text-sm text-ink-muted" data-figure>
                {candidate.phone}
              </p>
            </div>
            <div className="ml-auto">
              <StageBadge stage={candidate.stage} />
            </div>
          </div>

          {/* Training Stage Banner */}
          {isTrainingStage && (
            <div className="mb-6 rounded-card bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 shrink-0 text-[var(--state-extension-ink)]" />
                <div>
                  <h4 className="font-medium text-[var(--state-extension-ink)]">
                    Candidate is in Training Stage
                  </h4>
                  <p className="mt-1 text-sm text-[var(--state-extension-ink)]">
                    This candidate has completed all interviews. You can now
                    send an offer letter.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Scheduled Interviews */}
          {scheduledInterviews.length > 0 && (
            <Panel label="Scheduled Interviews" className="mb-6">
              <PanelHead title="Scheduled Interviews" />
              <div className="space-y-3">
                {scheduledInterviews.map((interview, index) => (
                  <div
                    key={interview._id || index}
                    className="rounded-card border border-hairline p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {interview.title}
                        </p>
                        <p className="text-sm text-ink-muted" data-figure>
                          {formatInterviewDateTime(
                            interview.scheduledDate,
                            interview.scheduledTime,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-ink-faint">
                          Stage:{" "}
                          <span className="font-medium">
                            {interview.interviewStage?.replace("_", " ") ||
                              "N/A"}
                          </span>
                        </p>
                      </div>
                      <Chip
                        tone={
                          interview.status === "scheduled"
                            ? "positive"
                            : interview.status === "completed"
                              ? "risk"
                              : "neutral"
                        }
                      >
                        {interview.status}
                      </Chip>
                    </div>
                    {interview.location && (
                      <p className="mt-2 text-sm text-ink-muted">
                        <span className="font-medium">Location:</span>{" "}
                        {interview.location}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Basic Information */}
          <Panel label="Basic Information" className="mb-6">
            <PanelHead title="Basic Information" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-ink-faint">Experience</span>
                {isEditing ? (
                  <Input
                    type="text"
                    value={editedCandidate.experience}
                    onChange={(e) =>
                      setEditedCandidate({
                        ...editedCandidate,
                        experience: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="font-medium text-ink" data-figure>
                    {candidate.experience}
                  </p>
                )}
              </div>
              <div>
                <span className="block text-xs text-ink-faint">
                  Current Company
                </span>
                {isEditing ? (
                  <Input
                    type="text"
                    value={editedCandidate.currentCompany}
                    onChange={(e) =>
                      setEditedCandidate({
                        ...editedCandidate,
                        currentCompany: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="font-medium text-ink">
                    {candidate.currentCompany}
                  </p>
                )}
              </div>
              <div>
                <span className="block text-xs text-ink-faint">
                  Notice Period
                </span>
                {isEditing ? (
                  <Input
                    type="text"
                    value={editedCandidate.noticePeriod}
                    onChange={(e) =>
                      setEditedCandidate({
                        ...editedCandidate,
                        noticePeriod: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="font-medium text-ink" data-figure>
                    {candidate.noticePeriod}
                  </p>
                )}
              </div>
              <div>
                <span className="block text-xs text-ink-faint">
                  Expected Salary
                </span>
                {isEditing ? (
                  <Input
                    type="text"
                    value={editedCandidate.expectedSalary}
                    onChange={(e) =>
                      setEditedCandidate({
                        ...editedCandidate,
                        expectedSalary: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="font-medium text-ink" data-figure>
                    {candidate.expectedSalary}
                  </p>
                )}
              </div>
            </div>
          </Panel>

          {/* Interview Questions & Ratings */}
          {interviewQuestions.length > 0 && (
            <Panel label="Interview Questions" className="mb-6">
              <PanelHead title="Interview Questions" />
              <div className="space-y-3">
                {interviewQuestions.map((q, index) => (
                  <div
                    key={index}
                    className="rounded-card border border-hairline p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="font-medium text-ink">{q.question}</p>
                      <div className="flex shrink-0 items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            className={`rounded-full p-1 ${star <= q.rating ? "text-ink" : "text-[var(--control-active)]"}`}
                          >
                            <Star className="h-4 w-4 fill-current" />
                          </button>
                        ))}
                      </div>
                    </div>
                    {q.notes && (
                      <p className="mt-2 text-sm text-ink-muted">{q.notes}</p>
                    )}
                    {q.stage && (
                      <p className="mt-1 text-xs text-ink-faint">
                        Stage: {q.stage.replace("_", " ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Overall Rating */}
          <Panel label="Overall Rating" className="mb-6">
            <PanelHead title="Overall Rating" />
            <div className="flex items-center gap-2">
              <RatingStars rating={candidate.rating} />
              <span
                data-figure
                className="ml-2 text-[17px] font-medium tracking-[-0.025em] text-ink"
              >
                {candidate.rating.toFixed(1)}/5
              </span>
            </div>
          </Panel>

          {/* Action Buttons */}
          <div className="flex gap-3 border-t border-hairline pt-6">
            {isTrainingStage ? (
              <>
                {/* Training Stage Actions */}
                <Button
                  tone="primary"
                  className="flex-1"
                  onClick={() => setShowOfferLetterModal(true)}
                >
                  <FileText className="h-4 w-4" />
                  Generate Offer Letter
                </Button>

                <Button
                  tone="secondary"
                  className="flex-1"
                  onClick={() => {
                    if (
                      confirm("Schedule another meeting with this candidate?")
                    ) {
                      onScheduleMeeting(candidate);
                    }
                  }}
                >
                  <CalendarIcon className="h-4 w-4" />
                  Reschedule Meeting
                </Button>

                <Button
                  tone="secondary"
                  className="flex-1"
                  onClick={() =>
                    window.open(
                      "http://localhost:3000/hr/dashboard/employees/new-employee",
                      "_blank",
                    )
                  }
                >
                  <User className="h-4 w-4" />
                  Add as Employee
                </Button>
              </>
            ) : !hasScheduledInterview &&
              candidate.stage !== "rejected" &&
              candidate.stage !== "hired" ? (
              <>
                <Button
                  tone="primary"
                  className="flex-1"
                  onClick={() => onScheduleMeeting(candidate)}
                  disabled={actionLoading}
                >
                  <CalendarIcon className="h-4 w-4" />
                  Schedule Meeting
                </Button>

                <Button
                  tone="destructive"
                  className="flex-1"
                  onClick={handleRejectCandidate}
                  disabled={actionLoading}
                >
                  <XCircle className="h-4 w-4" />
                  {actionLoading ? "Processing..." : "Reject Candidate"}
                </Button>
              </>
            ) : candidate.stage === "rejected" ||
              candidate.stage === "hired" ? (
              <div className="w-full rounded-card bg-[var(--surface-sunken)] p-4 text-center">
                <p className="font-medium text-ink">
                  Candidate has been{" "}
                  {candidate.stage === "rejected" ? "rejected" : "hired"}
                </p>
                {candidate.stage === "hired" && (
                  <p className="mt-1 text-sm text-ink-muted">
                    Next step: Add employee details
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Interview completed - show next step options */}
                {isInterviewCompleted && (
                  <Button
                    tone="primary"
                    className="flex-1"
                    onClick={handleNextStage}
                    disabled={actionLoading}
                  >
                    <ArrowRight className="h-4 w-4" />
                    {actionLoading ? "Processing..." : getNextStageLabel()}
                  </Button>
                )}
                {/* Always show reject option */}
                <Button
                  tone="destructive"
                  className="flex-1"
                  onClick={handleRejectCandidate}
                  disabled={actionLoading}
                >
                  <XCircle className="h-4 w-4" />
                  {actionLoading ? "Processing..." : "Reject Candidate"}
                </Button>
              </>
            )}

            {isEditing && (
              <Button
                tone="primary"
                className="flex-1"
                onClick={handleSave}
                disabled={loading}
              >
                <Save className="h-4 w-4" />
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>

          {/* Additional Info for Hired Candidates */}
          {candidate.stage === "hired" && (
            <div className="mt-6 rounded-card bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] p-4">
              <h4 className="mb-2 font-medium text-[var(--state-risk-ink)]">
                Next Steps for Hired Candidate
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-[var(--state-risk-ink)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--state-risk-ink)]">
                      Send Required Documents
                    </p>
                    <p className="text-xs text-[var(--state-risk-ink)]">
                      Ask candidate to submit:
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-[var(--state-risk-ink)]">
                      <li>Aadhar Card / PAN Card</li>
                      <li>Educational Certificates</li>
                      <li>Experience Letters (if any)</li>
                      <li>Passport Size Photos</li>
                    </ul>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-[var(--state-risk-ink)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--state-risk-ink)]">
                      Add Employee to System
                    </p>
                    <p className="text-xs text-[var(--state-risk-ink)]">
                      Click below to add employee details:
                    </p>
                    <Button
                      tone="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        window.open(
                          "http://localhost:3000/hr/dashboard/employees/new-employee",
                          "_blank",
                        )
                      }
                    >
                      <User className="h-4 w-4" />
                      Add as Employee
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Offer Letter Modal */}
      {showOfferLetterModal && (
        <OfferLetterModal
          isOpen={showOfferLetterModal}
          onClose={() => setShowOfferLetterModal(false)}
          candidate={candidate}
          job={job}
        />
      )}
    </>
  );
};

export default CandidateDetailsSlider;
