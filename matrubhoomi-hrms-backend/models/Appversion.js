"use strict";
const mongoose = require("mongoose");

const appVersionSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    // WHICH app. Rows written before this field are the old Expo app's and
    // have none; the native employee app's releases carry "employee". The two
    // must never be offered to each other as an "update".
    app: { type: String, trim: true, default: "" },
    // The Android versionCode — what the phone compares, since "1.10" and
    // "1.9" do not sort as strings.
    versionCode: { type: Number, default: 0 },
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    // Empty for a release published as a link rather than an upload.
    driveFileId: { type: String, default: "" },
    driveViewUrl: { type: String },
    driveDownloadUrl: { type: String },
    releaseNotes: { type: String, default: "" },
    isLatest: { type: Boolean, default: false },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "HRDepartment" },
    uploadedByName: { type: String, default: "HR" },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

appVersionSchema.index({ version: 1 });
appVersionSchema.index({ isLatest: 1 });
appVersionSchema.index({ app: 1, isLatest: 1 });

module.exports = mongoose.model("AppVersion", appVersionSchema);
