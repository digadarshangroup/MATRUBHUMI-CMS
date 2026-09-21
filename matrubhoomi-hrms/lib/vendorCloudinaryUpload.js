// lib/vendorCloudinaryUpload.js
//
// Vendor papers — GST certificates, PAN cards, cancelled cheques, profile
// photos. A thin wrapper over lib/cloudinaryUpload.js, kept as its own module
// only because VendorFormComponent imports these names.
//
// It used to be a near-copy of that file, posting straight to
// api.cloudinary.com with the unsigned preset and accepting IMAGES ONLY — so
// a vendor's GST certificate, which arrives as a PDF far more often than as a
// photo, was rejected at the form with "Invalid image type". Both problems go
// away by sharing the one upload path; see that file's header for why the
// browser no longer talks to Cloudinary at all.

import {
  uploadToCloudinary as uploadImage,
  uploadFileToCloudinary,
  getTransformedImageUrl,
  TRANSFORMATION_PRESETS,
} from "@/lib/cloudinaryUpload";

/** Any vendor file: image or PDF. */
export const uploadToCloudinary = async (file, folder = "vendor-documents") =>
  uploadFileToCloudinary(file, folder, {
    maxBytes: folder.includes("profile") ? 5 * 1024 * 1024 : 10 * 1024 * 1024,
  });

export const uploadVendorDocument = async (file, documentType) =>
  uploadToCloudinary(file, `vendor-documents/${documentType}`);

export const uploadProfileImage = async (file) => {
  // Images only here, deliberately: this one is rendered as an avatar, and a
  // PDF in that slot would show as a broken image rather than an error.
  const result = await uploadImage(file, "vendor-profile-photos");
  return {
    ...result,
    url: getTransformedImageUrl(result.url, "c_fill,w_500,h_500,q_auto"),
  };
};

export const uploadAdditionalDocument = async (file, title) => {
  const result = await uploadToCloudinary(file, "vendor-additional-docs");
  return { ...result, title };
};

export { getTransformedImageUrl, TRANSFORMATION_PRESETS };
