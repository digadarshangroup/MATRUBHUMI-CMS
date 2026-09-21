/**
 * MATRUBHOOMI-HRMS-BACKEND/services/employeeLetter.service.js
 *
 * PRIVATE storage for HR-issued employee letters (appointment, offer,
 * warning, experience, relieving, salary certificate).
 *
 * WHAT CHANGED, and why the file is no longer called *Drive*:
 *
 *   These letters lived on a private Google Drive folder for one reason — a
 *   normal Cloudinary `secure_url` is PUBLIC AND PERMANENT, which would have
 *   made the release gate a discovery gate only: anyone who once held the URL
 *   kept it after the letter was withdrawn.
 *
 *   Cloudinary's `type: "private"` closes that hole, but not in the way the
 *   name suggests, and the difference matters. The `secure_url` a private
 *   upload returns ALREADY CARRIES a working signature and serves 200 to
 *   anyone who has it — probed, not assumed. What makes these letters private
 *   is therefore a rule, not a Cloudinary feature: THAT URL NEVER LEAVES THE
 *   SERVER. The row stores only a publicId (`url` is deliberately ""), and
 *   bytes come out solely through a signed download URL minted per request,
 *   valid for CLOUDINARY_PRIVATE_URL_TTL_S seconds, behind a route that
 *   re-checks the release gate first. Withdrawing a letter genuinely
 *   withdraws it.
 *
 *   So the second storage backend earns nothing any more, and it cost a
 *   service-account key that was never actually filled in — every Generate
 *   here failed with "GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env".
 *
 * The exported names and the returned sub-document shape are unchanged, so
 * routes/HrRoutes/EmployeeDocuments_section.js and
 * routes/Employee_Routes/documents.js keep working. Rows written before this
 * change carry `storage: "drive"` and a `driveFileId`; they are read-only
 * history and the read paths below say plainly that they cannot be served.
 *
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */

const {
  uploadPrivateFile,
  getPrivateFileStream,
  deleteFile,
} = require("./mediaUpload.service");

// One flat folder stays searchable in the Cloudinary media library, and HR
// does look these up by hand. The letter type is folded into the FILENAME
// rather than nesting a folder per type.
const LETTERS_FOLDER = "matrubhoomi/employee-letters";

/**
 * Upload a letter PDF. PRIVATE — no readable URL is returned or stored.
 * Returns the sub-document stored on EmployeeDocument.file.
 */
async function uploadEmployeeLetter(
  buffer,
  { fileName = "letter.pdf", mimeType = "application/pdf", subfolder = "" } = {},
) {
  const name = subfolder ? `${subfolder} - ${fileName}` : fileName;

  const up = await uploadPrivateFile(buffer, {
    fileName: name,
    mimeType,
    folder: LETTERS_FOLDER,
  });

  return {
    storage: "cloudinary",
    deliveryType: "private",
    publicId: up.publicId,
    driveFileId: "", // legacy column; nothing writes it any more
    url: "", // MUST stay empty — a stored URL would be a permanent back door
    fileName: name,
    mimeType,
    bytes: up.bytes || buffer.length,
    resourceType: up.resourceType || "raw",
  };
}

/**
 * Stream a private letter back through our own authenticated route.
 *
 * Accepts either the stored `file` sub-document or a bare Cloudinary
 * public_id, so callers that already hold the row do not have to unpack it.
 */
async function streamEmployeeLetter(fileOrPublicId) {
  const file =
    typeof fileOrPublicId === "string"
      ? { publicId: fileOrPublicId, resourceType: "raw" }
      : fileOrPublicId || {};

  if (!file.publicId && file.driveFileId) {
    // A row written before the move. The Drive credentials it needs are gone,
    // so say so instead of throwing a nil-reference three frames down.
    const err = new Error(
      "This letter was stored on Google Drive before the move to Cloudinary and can no longer be served. Regenerate it.",
    );
    err.statusCode = 410;
    throw err;
  }
  if (!file.publicId) {
    const err = new Error("No stored file for this document");
    err.statusCode = 404;
    throw err;
  }

  const { stream, mimeType, size } = await getPrivateFileStream(file.publicId, {
    resourceType: file.resourceType || "raw",
  });

  return {
    stream,
    meta: {
      name: file.fileName || "document.pdf",
      mimeType: file.mimeType || mimeType,
      size: file.bytes || size || undefined,
    },
  };
}

/**
 * Delete, best-effort.
 * An orphaned asset is far better than a failed replacement, so callers warn
 * rather than throw.
 */
async function deleteEmployeeLetter(fileOrPublicId) {
  const file =
    typeof fileOrPublicId === "string"
      ? { publicId: fileOrPublicId, resourceType: "raw" }
      : fileOrPublicId || {};

  if (!file.publicId) return false;

  await deleteFile(file.publicId, {
    resourceType: file.resourceType || "raw",
    // Must match the upload. Destroying a private asset as type "upload"
    // reports { result: "not found" } and silently leaves the file in place.
    type: file.deliveryType || "private",
  });
  return true;
}

module.exports = {
  uploadEmployeeLetter,
  streamEmployeeLetter,
  deleteEmployeeLetter,
  LETTERS_FOLDER,
};
