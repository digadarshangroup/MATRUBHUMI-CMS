// matrubhoomi-hrms/lib/cloudinaryUpload.js
//
// Every file this app stores goes through here, and here posts it to the
// BACKEND (`POST /api/uploads`), which owns the Cloudinary credentials and the
// storage policy.
//
// ─── WHY NOT STRAIGHT TO CLOUDINARY, AS THIS FILE USED TO ────────────────────
//
//   1. An unsigned upload preset is a WRITE CREDENTIAL in the bundle. It has
//      to be NEXT_PUBLIC_*, so anyone who opens devtools can upload anything
//      to this cloud, in any folder, for as long as the preset exists.
//
//   2. This Cloudinary account refuses PUBLIC DELIVERY OF PDFs — a stored
//      `raw/upload/….pdf` answers 401 "deny or ACL failure". A résumé or a
//      medical certificate uploaded from the browser produced a URL that never
//      opened, and nothing in the upload response said so. The backend stores
//      non-images privately and hands back an `/api/files/<token>` link that
//      works.
//
//   3. It also refuses some extensions outright (".apk", ".bin"). The backend
//      strips the extension and restores the real filename on download.
//
// The exported function names and return shapes are unchanged, so no call site
// had to move. `lib/authFetch.js` attaches the session automatically to any
// request aimed at the backend — including this one, and without disturbing
// the multipart body.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** POST one file to the backend and normalise its answer. */
async function postToBackend(file, folder) {
  const formData = new FormData();
  formData.append("file", file);
  if (folder) formData.append("folder", folder);

  let response;
  try {
    response = await fetch(`${API_URL}/api/uploads`, {
      method: "POST",
      credentials: "include",
      body: formData,
      // No Content-Type header on purpose — the browser has to set the
      // multipart boundary itself, and naming the type here deletes it.
    });
  } catch (err) {
    throw new Error(
      "Could not reach the server to upload this file. Check your connection.",
    );
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    /* a proxy returned HTML; the status below is the real signal */
  }

  if (!response.ok || !data.success) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Sign in again to upload.");
    }
    throw new Error(data.message || `Upload failed (${response.status})`);
  }

  return {
    success: true,
    url: data.url,
    publicId: data.publicId,
    format: data.format,
    bytes: data.bytes,
    size: data.bytes,
    fileName: data.fileName,
    mimeType: data.mimeType,
    downloadUrl: data.downloadUrl || data.url,
    originalFilename: data.fileName,
  };
}

function assertSize(file, maxBytes) {
  if (file.size > maxBytes) {
    throw new Error(
      `File size too large. Maximum size is ${maxBytes / (1024 * 1024)}MB`,
    );
  }
}

// ─── Image upload ─────────────────────────────────────────────────────────────
export const uploadToCloudinary = async (
  file,
  folder = "employee-documents",
) => {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid image type. Please upload: ${IMAGE_TYPES.join(", ")}`,
    );
  }
  assertSize(
    file,
    folder === "employee-profile-photos" ? 5 * 1024 * 1024 : 10 * 1024 * 1024,
  );
  return postToBackend(file, folder);
};

// ─── Any file, image or not ──────────────────────────────────────────────────
// For résumés, certificates and scanned papers, where a PDF is as likely as a
// photo. The backend picks public-CDN or private-and-proxied by MIME type, so
// nothing here has to know the difference.
export const uploadFileToCloudinary = async (
  file,
  folder = "employee-documents",
  { maxBytes = 15 * 1024 * 1024 } = {},
) => {
  assertSize(file, maxBytes);
  return postToBackend(file, folder);
};

// ─── Binary / firmware upload (.bin, .hex, .elf) ─────────────────────────────
export const uploadFirmwareToCloudinary = async (
  file,
  folder = "barcode-firmware",
) => {
  assertSize(file, 5 * 1024 * 1024);
  // ".bin" is one of the extensions Cloudinary refuses on upload. The backend
  // stores it extension-less and restores the name on download, which is the
  // only reason this works at all.
  return postToBackend(file, folder);
};

// ─── SVG / vector upload ─────────────────────────────────────────────────────
export const uploadSVGToCloudinary = async (
  file,
  folder = "pattern-grading",
) => {
  const validTypes = [
    "image/svg+xml",
    "application/postscript", // .ai / .eps
    "application/illustrator",
    "application/eps",
    "application/x-eps",
    "text/plain", // some SVGs arrive as text/plain
  ];
  const hasValidExt = [".svg", ".ai", ".eps"].some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  );
  if (!validTypes.includes(file.type) && !hasValidExt) {
    throw new Error("Please upload an SVG, AI, or EPS file.");
  }
  assertSize(file, 15 * 1024 * 1024);
  return postToBackend(file, folder);
};

// ─── Profile photo ────────────────────────────────────────────────────────────
export const uploadProfilePhoto = async (file) => {
  const result = await uploadToCloudinary(file, "employee-profile-photos");
  return {
    ...result,
    url: getTransformedImageUrl(result.url, "c_fill,w_500,h_500,q_auto"),
  };
};

// ─── Employee document ────────────────────────────────────────────────────────
export const uploadDocument = async (file, type = "aadhar") =>
  uploadFileToCloudinary(file, `employee-documents/${type}`);

// ─── Additional documents ─────────────────────────────────────────────────────
export const uploadAdditionalDocument = async (file, title) => {
  const result = await uploadFileToCloudinary(file, "employee-additional-docs");
  return { ...result, title };
};

// ─── URL transformation helper ────────────────────────────────────────────────
// Only meaningful for an image on the Cloudinary CDN. A privately stored file
// comes back as an /api/files/<token> link, which carries no transformation
// segment — so this returns it untouched rather than corrupting it.
export const getTransformedImageUrl = (url, transformations = "") => {
  if (!url || !url.includes("cloudinary.com") || !transformations) return url;
  try {
    const parts = url.split("/upload/");
    if (parts.length === 2)
      return `${parts[0]}/upload/${transformations}/${parts[1]}`;
    return url;
  } catch (error) {
    console.error("Error transforming URL:", error);
    return url;
  }
};

export const TRANSFORMATION_PRESETS = {
  PROFILE_THUMB: "c_fill,w_100,h_100,q_auto",
  PROFILE_MEDIUM: "c_fill,w_250,h_250,q_auto",
  PROFILE_LARGE: "c_fill,w_500,h_500,q_auto",
  DOCUMENT_PREVIEW: "c_limit,w_800,h_800,q_auto",
  ID_CARD: "c_fill,w_300,h_400,q_auto",
};
