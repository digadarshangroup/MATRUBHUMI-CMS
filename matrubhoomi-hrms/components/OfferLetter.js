"use client";

import { useState, useEffect } from "react";
import { FileText, X, User, AlertCircle } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OfferLetterModal = ({ isOpen, onClose, candidate, job }) => {
  const [loading, setLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const [offerData, setOfferData] = useState({
    // Basic Information
    salary: candidate?.expectedSalary || job?.salaryRange?.min || "₹30,000",
    joiningDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0], // 7 days from now
    designation: candidate?.jobTitle || "Employee",
    department: job?.hiringManager?.departmentName || "Department",
    reportingManager: job?.hiringManager?.managerName || "Manager",
    workLocation: job?.jobLocation || "Office Location",
    employmentType: "full_time",
    noticePeriod: candidate?.noticePeriod || "15 days",
    probationPeriod: "6 months",

    // Financial Details
    grossSalary: "17084",
    basicSalary: "8000",
    hra: "3200",
    conveyanceAllowance: "1600",
    specialAllowance: "4284",
    employeePF: "960",
    employeeESIC: "126",
    netTakeHome: "16000",
    foodAllowance: "1600",
    ctc: "20577",

    // HR Details
    hrManager: "HR Manager",
    hrEmail: "hr@matrubhoomi.com",
    hrPhone: "+91 XXXXXXXXXX",
  });

  useEffect(() => {
    if (isOpen && candidate) {
      // Reset state when modal opens
      setShowInstructions(false);
    }
  }, [isOpen, candidate]);

  const generateOfferLetterPDF = async () => {
    try {
      setLoading(true);

      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      const { width, height } = page.getSize();

      // Load fonts
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesRomanBoldFont = await pdfDoc.embedFont(
        StandardFonts.TimesRomanBold,
      );

      // Add content to PDF
      let y = height - 50;

      // Header
      page.drawText("EMPLOYMENT OFFER LETTER", {
        x: 50,
        y: y,
        size: 20,
        font: timesRomanBoldFont,
        color: rgb(0, 0, 0),
      });
      y -= 30;

      // Date
      const currentDate = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      page.drawText(`Date: ${currentDate}`, {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });
      y -= 30;

      // Candidate Address
      page.drawText("Dear Candidate,", {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });
      y -= 20;

      // Main offer - Use "INR" instead of Rupee symbol
      page.drawText(
        `We are pleased to offer you the position of ${offerData.designation} at Matrubhoomi.`,
        { x: 50, y: y, size: 11, font: timesRomanFont },
      );
      y -= 15;
      page.drawText(`Your Total Cost to Company will be ${offerData.salary}.`, {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });
      y -= 25;

      // Salary Breakup
      page.drawText("Salary Breakup:", {
        x: 50,
        y: y,
        size: 12,
        font: timesRomanBoldFont,
        underline: true,
      });
      y -= 20;

      const salaryComponents = [
        ["Gross Salary", `INR ${offerData.grossSalary}`],
        ["Basic Salary", `INR ${offerData.basicSalary}`],
        ["HRA", `INR ${offerData.hra}`],
        ["Conveyance Allowance", `INR ${offerData.conveyanceAllowance}`],
        ["Special Allowance", `INR ${offerData.specialAllowance}`],
        ["Employee PF", `INR ${offerData.employeePF}`],
        ["Employee ESIC", `INR ${offerData.employeeESIC}`],
        ["Net Take Home", `INR ${offerData.netTakeHome}`],
        ["CTC", `INR ${offerData.ctc}`],
      ];

      salaryComponents.forEach(([label, value]) => {
        page.drawText(`• ${label}: ${value}`, {
          x: 60,
          y: y,
          size: 11,
          font: timesRomanFont,
        });
        y -= 15;
      });
      y -= 10;

      // Terms & Conditions
      page.drawText("Key Terms & Conditions:", {
        x: 50,
        y: y,
        size: 12,
        font: timesRomanBoldFont,
        underline: true,
      });
      y -= 20;

      const terms = [
        `Position: ${offerData.designation}`,
        `Department: ${offerData.department}`,
        `Joining Date: ${new Date(offerData.joiningDate).toLocaleDateString("en-IN")}`,
        `Work Location: ${offerData.workLocation}`,
        `Reporting Manager: ${offerData.reportingManager}`,
        `Employment Type: ${offerData.employmentType === "full_time" ? "Full Time" : offerData.employmentType}`,
        `Probation Period: ${offerData.probationPeriod}`,
        `Notice Period: ${offerData.noticePeriod}`,
      ];

      terms.forEach((term) => {
        page.drawText(`• ${term}`, {
          x: 60,
          y: y,
          size: 11,
          font: timesRomanFont,
        });
        y -= 15;
      });
      y -= 20;

      // Important Notes from your template
      page.drawText("Important Notes:", {
        x: 50,
        y: y,
        size: 12,
        font: timesRomanBoldFont,
        underline: true,
      });
      y -= 20;

      const notes = [
        "This offer is subject to verification of all documents",
        "You will be on probation for 6 months from the date of joining",
        "During probation, services may be terminated without assigning any reason",
        "Either party can terminate employment by serving 1 month notice",
        "You are not permitted to undertake any other employment without prior written permission",
        "All company policies and procedures will apply",
        "This offer letter and its contents are confidential",
      ];

      notes.forEach((note) => {
        page.drawText(`• ${note}`, {
          x: 60,
          y: y,
          size: 10,
          font: timesRomanFont,
        });
        y -= 15;
      });
      y -= 20;

      // Acceptance
      page.drawText("We welcome you to our team and wish you all the best.", {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });
      y -= 15;
      page.drawText(
        "Please return a signed copy of this letter as a token of acceptance.",
        { x: 50, y: y, size: 11, font: timesRomanFont },
      );
      y -= 30;

      // Signature
      page.drawText("Best Regards,", {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });
      y -= 15;
      page.drawText(offerData.hrManager, {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanBoldFont,
      });
      y -= 15;
      page.drawText("HR Executive", {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });
      y -= 15;
      page.drawText("Matrubhoomi Farms & Developers", {
        x: 50,
        y: y,
        size: 11,
        font: timesRomanFont,
      });

      // Save the PDF
      const pdfBytes = await pdfDoc.save();

      // Create blob and download
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Offer_Letter_${candidate.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Show instructions after download
      setShowInstructions(true);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating offer letter PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleHireCandidate = () => {
    window.open(
      "http://localhost:3000/hr/dashboard/employees/new-employee",
      "_blank",
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/50 bg-opacity-50 z-50 flex items-center justify-center p-4 ">
      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                Generate Offer Letter
              </h3>
              <p className="text-sm text-gray-600">for {candidate?.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {showInstructions ? (
            // Instructions after generating offer letter
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Offer Letter Generated Successfully!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      The PDF has been downloaded. Share it with the candidate.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Next Steps:</h4>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-blue-600">
                        1
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Share Offer Letter
                      </p>
                      <p className="text-sm text-gray-600">
                        Send the downloaded PDF to {candidate?.name} via email
                        or WhatsApp
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-blue-600">
                        2
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Collect Required Documents
                      </p>
                      <p className="text-sm text-gray-600">
                        Ask candidate to provide: Aadhar Card, PAN Card,
                        Educational Certificates, Experience Letters
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-blue-600">
                        3
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Add as Employee
                      </p>
                      <p className="text-sm text-gray-600">
                        Once candidate accepts offer and submits documents, add
                        them to employee system
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-6">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleHireCandidate}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    Add as Employee
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Offer Letter Form
            <div className="space-y-6">
              {/* Candidate Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Candidate</p>
                    <p className="font-medium">{candidate?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Position</p>
                    <p className="font-medium">{candidate?.jobTitle}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-medium">{candidate?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="font-medium">{candidate?.phone}</p>
                  </div>
                </div>
              </div>

              {/* Offer Details Form */}
              <div className="space-y-6">
                <h4 className="font-semibold text-gray-900">Offer Details</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Designation *
                      </label>
                      <input
                        type="text"
                        value={offerData.designation}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            designation: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department *
                      </label>
                      <input
                        type="text"
                        value={offerData.department}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            department: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reporting Manager
                      </label>
                      <input
                        type="text"
                        value={offerData.reportingManager}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            reportingManager: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Work Location *
                      </label>
                      <input
                        type="text"
                        value={offerData.workLocation}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            workLocation: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Salary (CTC) *
                      </label>
                      <input
                        type="text"
                        value={offerData.salary}
                        onChange={(e) =>
                          setOfferData({ ...offerData, salary: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="₹30,000"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Joining Date *
                      </label>
                      <input
                        type="date"
                        value={offerData.joiningDate}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            joiningDate: e.target.value,
                          })
                        }
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employment Type
                      </label>
                      <select
                        value={offerData.employmentType}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            employmentType: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="full_time">Full Time</option>
                        <option value="contract">Contract</option>
                        <option value="intern">Intern</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notice Period
                      </label>
                      <input
                        type="text"
                        value={offerData.noticePeriod}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            noticePeriod: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="15 days"
                      />
                    </div>
                  </div>
                </div>

                {/* Simple Salary Section */}
                <div className="border-t pt-6">
                  <h5 className="font-medium text-gray-900 mb-4">
                    Salary Details
                  </h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Basic Salary
                      </label>
                      <input
                        type="text"
                        value={offerData.basicSalary}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            basicSalary: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="₹8000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        HRA
                      </label>
                      <input
                        type="text"
                        value={offerData.hra}
                        onChange={(e) =>
                          setOfferData({ ...offerData, hra: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="₹3200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Net Take Home
                      </label>
                      <input
                        type="text"
                        value={offerData.netTakeHome}
                        onChange={(e) =>
                          setOfferData({
                            ...offerData,
                            netTakeHome: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="₹16000"
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-6 border-t">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={generateOfferLetterPDF}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        Generate & Download Offer Letter
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfferLetterModal;
