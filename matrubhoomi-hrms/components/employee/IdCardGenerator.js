"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { Panel, PanelHead, Button } from "@/components/ceo/ui/Primitives";

/* ================= CONSTANTS ================= */
const CARD_WIDTH = 638;
const CARD_HEIGHT = 1004;
const UI_SCALE = 0.5;

export default function IdCardGenerator({ employee, employeeId }) {
  const [frontData, setFrontData] = useState({});
  const [backData, setBackData] = useState({});
  const [photo, setPhoto] = useState(null);
  const [qrSrc, setQrSrc] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const scaleWrapperRef = useRef(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [tempPhoto, setTempPhoto] = useState(null);

  const resolvedPhoto = tempPhoto || employee.basicInfo?.profilePhoto?.url;

  const fileInputRef = useRef(null);
  const frontCardRef = useRef(null);
  const backCardRef = useRef(null);
  const editableElementsRef = useRef(new Map());

  /* ================= INITIALIZATION ================= */
  const updateEmployeeIdPhoto = async (id, photoUrl) => {
    try {
      const response = await fetch(`/api/employees/${id}/id-photo`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idPhotoUrl: photoUrl }),
      });

      const data = await response.json();
      if (!data.success) {
        console.error("Failed to update ID photo in database");
      }
    } catch (error) {
      console.error("Error updating ID photo:", error);
    }
  };

  const handlePhotoDoubleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Please upload a valid image file (JPEG, PNG, WebP)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("File size should be less than 5MB");
      return;
    }

    handlePhotoUpload(file); // ✅ pass file
  };

  useEffect(() => {
    if (!employee) return;

    // Set initial photo from employee data
    const employeePhoto =
      employee.basicInfo?.profilePhoto?.url ||
      employee.profilePhoto?.url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.basicInfo?.fullName || "Employee")}&background=7c3aed&color=fff&bold=true&size=500`;

    setPhoto(employeePhoto);

    setFrontData({
      name: employee.basicInfo?.fullName || "Employee Name",
      designation: employee.workInfo?.designation || "Designation",
      id: employee.basicInfo?.employeeId || "EMP001",
      department: employee.workInfo?.department || "Department",
      phone: employee.basicInfo?.phone || "XXXXXXXXXX",
      blood: employee.basicInfo?.bloodGroup || "O+",
    });

    setBackData({
      address: employee.basicInfo?.address || "Employee Address",
      emergencyPhone: employee.basicInfo?.alternatePhone || "XXXXXXXXXX",
      emergencyAddress:
        employee.basicInfo?.emergencyAddress || "Emergency Address",
      qrValue:
        `https://matrubhoomifarms.in/employee/${employeeId}` || "https://hrms.matrubhoomifarms.in",
    });
  }, [employee, employeeId]);

  /* ================= QR CODE GENERATION ================= */
  useEffect(() => {
    if (!backData.qrValue) return;

    QRCode.toDataURL(backData.qrValue, {
      width: 300,
      margin: 1,
    }).then(setQrSrc);
  }, [backData.qrValue]);

  const getTransformedImageUrl = (url, transformations = "") => {
    if (!url || !url.includes("cloudinary.com") || !transformations) {
      return url;
    }

    try {
      const parts = url.split("/upload/");
      if (parts.length === 2) {
        return `${parts[0]}/upload/${transformations}/${parts[1]}`;
      }
    } catch (error) {
      console.error("Error transforming URL:", error);
    }

    return url;
  };

  /* ================= PHOTO UPLOAD ================= */
  const handlePhotoUpload = async (file) => {
    if (!file) return;

    setIsUploadingPhoto(true);

    const uploadResult = await uploadToCloudinary(file);

    const transformedUrl = getTransformedImageUrl(
      uploadResult.url,
      "c_fill,w_204,h_264",
    );

    setTempPhoto(transformedUrl); // temporary override
    setIsUploadingPhoto(false);
  };

  /* ================= TEXT FORMATTING ================= */
  const handleTextFormat = useCallback((command, value = null) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const activeElement = range.commonAncestorContainer.parentElement;

    if (activeElement.contentEditable === "true") {
      document.execCommand(command, false, value);
    }
  }, []);

  const increaseTextSize = useCallback(() => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const activeElement = range.commonAncestorContainer.parentElement;

    if (activeElement.contentEditable === "true") {
      const currentSize = parseInt(activeElement.style.fontSize) || 16;
      const newSize = Math.min(48, currentSize + 2);
      activeElement.style.fontSize = `${newSize}px`;
    }
  }, []);

  const decreaseTextSize = useCallback(() => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const activeElement = range.commonAncestorContainer.parentElement;

    if (activeElement.contentEditable === "true") {
      const currentSize = parseInt(activeElement.style.fontSize) || 16;
      const newSize = Math.max(10, currentSize - 2);
      activeElement.style.fontSize = `${newSize}px`;
    }
  }, []);

  /* ================= EXPORT FUNCTIONALITY ================= */
  const exportToImage = async (side = "both") => {
    if (!frontCardRef.current || !backCardRef.current) return;

    const wrapper = scaleWrapperRef.current;
    const originalTransform = wrapper.style.transform;

    try {
      setIsExporting(true);

      // 🔑 Disable UI scaling for accurate capture
      wrapper.style.transform = "scale(1)";

      const commonOptions = {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        windowWidth: CARD_WIDTH,
        windowHeight: CARD_HEIGHT,
      };

      if (side === "front") {
        const canvas = await html2canvas(frontCardRef.current, commonOptions);
        downloadCanvas(canvas, `id-card-front-${frontData.id}`);
        return;
      }

      if (side === "back") {
        const canvas = await html2canvas(backCardRef.current, commonOptions);
        downloadCanvas(canvas, `id-card-back-${frontData.id}`);
        return;
      }

      const frontCanvas = await html2canvas(
        frontCardRef.current,
        commonOptions,
      );
      const backCanvas = await html2canvas(backCardRef.current, commonOptions);

      const gap = 80;
      const combinedCanvas = document.createElement("canvas");
      combinedCanvas.width = frontCanvas.width + backCanvas.width + gap;
      combinedCanvas.height = Math.max(frontCanvas.height, backCanvas.height);

      const ctx = combinedCanvas.getContext("2d");
      ctx.drawImage(frontCanvas, 0, 0);
      ctx.drawImage(backCanvas, frontCanvas.width + gap, 0);

      downloadCanvas(combinedCanvas, `id-card-both-${frontData.id}`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      // 🔁 Restore UI scaling
      wrapper.style.transform = originalTransform;
      setIsExporting(false);
    }
  };

  const downloadCanvas = (canvas, filename) => {
    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ================= RENDER ================= */
  return (
    <div className="space-y-5">
      {/* TOOLBAR */}
      <Panel label="ID card export">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">
            Double-click the photo to replace it, or click any field on the card
            to edit before exporting.
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              tone="secondary"
              onClick={() => exportToImage("front")}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Export front
                </>
              )}
            </Button>

            <Button
              tone="secondary"
              onClick={() => exportToImage("back")}
              disabled={isExporting}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Export back
            </Button>

            <Button
              tone="primary"
              onClick={() => exportToImage("both")}
              disabled={isExporting}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              Export both
            </Button>
          </div>
        </div>
      </Panel>

      {/* CARD CONTAINER */}
      <Panel label="ID card preview" padded={false}>
        <div
          className="scroll-slim relative overflow-x-auto rounded-card bg-[var(--surface-sunken)] p-4"
          style={{ minHeight: `${CARD_HEIGHT * UI_SCALE + 32}px` }}
        >
        {/* SCALE WRAPPER */}
        <div
          ref={scaleWrapperRef}
          className="origin-top-left"
          style={{
            transform: `scale(${UI_SCALE})`,
            width: `${CARD_WIDTH * 2 + 40}px`,
          }}
        >
          <div className="flex gap-5">
            {/* FRONT SIDE */}
            <div
              ref={frontCardRef}
              className="relative bg-cover bg-no-repeat"
              style={{
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
                backgroundImage: "url(/id_front.png)",
                color: "rgb(255, 255, 255)",
              }}
            >
              {/* PHOTO UPLOAD AREA WITH DOUBLE-CLICK FUNCTIONALITY */}
              <div
                onDoubleClick={handlePhotoDoubleClick}
                className="absolute top-[212px] left-[218px] w-[204px] h-[264px] border-4 border-[#C43723] rounded-3xl bg-[#111827] overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity group"
                title="Double-click to change photo"
              >
                {photo ? (
                  <>
                    <img
                      src={resolvedPhoto}
                      alt="Employee"
                      className="w-full h-full object-cover"
                    />
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="text-white">Uploading...</div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
                      <div className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        Double-click to change
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-4 text-gray-400">
                    <div className="text-2xl mb-2">📸</div>
                    <div className="text-sm">Double-click to upload photo</div>
                  </div>
                )}
              </div>
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleFileInputChange}
              />
              {/* NAME */}
              <div
                contentEditable
                suppressContentEditableWarning
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-center min-w-[300px]"
                style={{ fontSize: "30px", color: "rgb(196, 55, 35)" }}
                data-field="name"
              >
                {frontData.name}
              </div>

              {/* DESIGNATION */}
              <div
                contentEditable
                suppressContentEditableWarning
                className="absolute top-[55%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center min-w-[300px]"
                style={{ fontSize: "22px", color: "rgb(87, 87, 87)" }}
                data-field="designation"
              >
                {frontData.designation}
              </div>

              {/* DETAILS */}
              <div className="absolute bottom-[140px] left-7.5 right-4">
                <div className="space-y-2">
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="leading-tight"
                    style={{ fontSize: "28px" }}
                    data-field="id"
                  >
                    <span style={{ fontWeight: "bold" }}>ID-</span>{" "}
                    {frontData.id}
                  </div>

                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="leading-tight"
                    style={{ fontSize: "28px" }}
                    data-field="department"
                  >
                    <span style={{ fontWeight: "bold" }}>Department-</span>{" "}
                    {frontData.department}
                  </div>

                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="leading-tight"
                    style={{ fontSize: "28px" }}
                    data-field="phone"
                  >
                    <span style={{ fontWeight: "bold" }}>Phone-</span> +91{" "}
                    {frontData.phone}
                  </div>

                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="leading-tight"
                    style={{ fontSize: "28px" }}
                    data-field="blood"
                  >
                    <span style={{ fontWeight: "bold" }}>Blood Group-</span>{" "}
                    {frontData.blood}
                  </div>
                </div>
              </div>
            </div>

            {/* BACK SIDE */}
            <div
              ref={backCardRef}
              className="relative bg-cover bg-no-repeat"
              style={{
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
                backgroundImage: "url(/id_back.png)",
                color: "rgb(255, 255, 255)",
              }}
            >
              {/* QR CODE */}
              {qrSrc && (
                <div
                  className="absolute top-[60px] right-[42px] w-[180px] h-[180px] bg-white p-1.5"
                  style={{ backgroundColor: "rgb(255, 255, 255)" }}
                >
                  <img src={qrSrc} alt="QR Code" className="w-full h-full" />
                </div>
              )}

              {/* EMERGENCY CONTACT */}
              <div className="absolute top-[40px] left-[40px] w-[420px]">
                <div
                  contentEditable
                  suppressContentEditableWarning
                  className="leading-relaxed"
                  style={{ fontSize: "28px" }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                    Emergency Contact
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span style={{ fontWeight: "bold" }}>Phone-</span> +91{" "}
                      {employee?.basicInfo?.alternatePhone ||
                        backData.emergencyPhone}
                    </div>
                    <div>
                      <span style={{ fontWeight: "bold" }}>Address-</span>{" "}
                      {employee?.address?.permanent ? (
                        <span>
                          {employee.address.permanent.street},&nbsp;
                          {employee.address.permanent.city},&nbsp;
                          {employee.address.permanent.state}
                        </span>
                      ) : (
                        backData.emergencyAddress
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </Panel>

      {/* INSTRUCTIONS - Updated */}
      <Panel label="Instructions" className="max-w-3xl">
        <PanelHead title="Instructions" />
        <ul className="space-y-2 text-sm text-ink-muted">
          <li className="flex items-start">
            <span className="mt-[7px] mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--state-risk)]"></span>
            <span>
              <strong className="font-medium text-ink">Double-click</strong> on
              the photo area to upload a new employee photo
            </span>
          </li>
          <li className="flex items-start">
            <span className="mt-[7px] mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--state-risk)]"></span>
            Click on any text field to edit the content
          </li>
          <li className="flex items-start">
            <span className="mt-[7px] mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--state-risk)]"></span>
            Select text and use toolbar buttons to format (bold, size, color)
          </li>
          <li className="flex items-start">
            <span className="mt-[7px] mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--state-risk)]"></span>
            Use export buttons to download ID card as high-quality PNG
          </li>
          <li className="flex items-start">
            <span className="mt-[7px] mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--state-risk)]"></span>
            For best results, use high-quality photos (minimum{" "}
            <span data-figure>300x300px</span>)
          </li>
        </ul>
      </Panel>
    </div>
  );
}
