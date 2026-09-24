/**
 * MATRUBHOOMI-HRMS-BACKEND/services/mediaUpload.service.js
 *
 * THE file-storage service. Cloudinary, and only Cloudinary.
 *
 * Google Drive used to live here too — PDFs, attachments and the employee APK
 * went to a service account while images went to Cloudinary. That split is
 * gone. It cost a second set of credentials (GOOGLE_SERVICE_ACCOUNT_KEY was
 * never filled in, so every Drive path threw on the first line), a second
 * failure mode, and a per-request Drive quota on an unauthenticated proxy.
 *
 * ── TWO FACTS ABOUT THIS CLOUDINARY ACCOUNT, established by probing it ──────
 *
 *   1. PUBLIC delivery of PDF and ZIP is REFUSED. `raw/upload/…/x.pdf` answers
 *      401 "deny or ACL failure" (the console's "PDF and ZIP files delivery"
 *      switch). Images are unaffected and serve normally.
 *   2. Some extensions cannot be UPLOADED at all — ".apk" and ".bin" are
 *      rejected with "resources with extension apk are not allowed".
 *
 * And one fact about Cloudinary generally, which is easy to get wrong:
 *
 *   3. For a `private` or `authenticated` RAW asset, the `secure_url` the
 *      upload returns ALREADY CARRIES a valid signature and serves 200 to
 *      anyone who has it. Those delivery types buy UNGUESSABILITY, not
 *      revocability. Time-limited access needs
 *      `cloudinary.utils.private_download_url`, which is what this file uses.
 *
 * ── THE RESULTING RULE ─────────────────────────────────────────────────────
 *
 *   IMAGES        → public `type: "upload"`. The CDN URL is persisted and
 *                   served straight to the browser. Fast, cached, fine.
 *
 *   EVERYTHING ELSE (pdf, docx, zip, apk, …)
 *                 → `type: "private"`, and the EXTENSION IS STRIPPED from the
 *                   public_id, which sidesteps both restrictions above. The
 *                   readable URL never leaves this process: callers persist a
 *                   `/api/files/<token>` link, and routes/files.js mints a
 *                   short-lived signed URL per request.
 *
 * That is also strictly safer than what it replaces. The Drive helper called
 * `permissions.create({ role: "reader", type: "anyone" })` on every upload, so
 * every leave attachment — medical certificates included — was world-readable
 * to anyone holding the link.
 *
 * Required env:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * Optional:
 *   CLOUDINARY_PRIVATE_URL_TTL_S   default 300
 *   PUBLIC_API_BASE_URL            fallback base for /api/files links when a
 *                                  caller passes no `baseUrl`
 */

const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const { mintFileToken } = require("../utils/fileToken");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

const PRIVATE_TTL_S = Number(process.env.CLOUDINARY_PRIVATE_URL_TTL_S || 300);

function assertConfigured() {
    if (LOCAL_MODE) return;
    if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
    ) {
        throw new Error(
            "Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env",
        );
    }
}

function bufferToStream(buffer) {
    const r = new Readable();
    r._read = () => { };
    r.push(buffer);
    r.push(null);
    return r;
}

/** Cloudinary's resource_type for a given MIME type. */
function resourceTypeFor(mimeType = "") {
    const m = String(mimeType).toLowerCase();
    if (m.startsWith("image/") && m !== "image/svg+xml") return "image";
    if (m.startsWith("video/") || m.startsWith("audio/")) return "video";
    return "raw";
}

// A public_id is a path segment, so anything that would break one has to go.
// `keepExtension` is false for private assets: see fact 2 at the top — an
// ".apk" is refused on upload, and routes/files.js supplies the real filename
// and MIME type from the token anyway, so nothing is lost by dropping it.
function safePublicId(fileName, folder, keepExtension) {
    const raw = String(fileName || "file").trim();
    const dot = raw.lastIndexOf(".");
    const stem = (dot > 0 ? raw.slice(0, dot) : raw)
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 120) || "file";
    const ext = keepExtension && dot > 0 ? raw.slice(dot).replace(/[^a-zA-Z0-9.]/g, "") : "";
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const base = `${stem}_${unique}${ext}`;
    return folder ? `${folder}/${base}` : base;
}

// ── LOCAL mode: the same four calls, on this machine's disk ──────────────────
//
// MEDIA_STORAGE=local stores every upload under MEDIA_LOCAL_DIR (default
// ./local-media) instead of Cloudinary — for a demo or a test run on one
// machine, which must never write into the company's real media account.
// Nothing changes for a caller: public images come back as a URL (served by
// server.js at /media), everything else as the same /api/files/<token> link,
// and a private asset's id is "local:<path>", which getPrivateFileStream reads
// from disk. Off unless the variable says otherwise; production is untouched.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOCAL_MODE = String(process.env.MEDIA_STORAGE || "").toLowerCase() === "local";
const LOCAL_DIR = path.resolve(process.env.MEDIA_LOCAL_DIR || path.join(__dirname, "..", "local-media"));

function localWrite(buffer, zone, folder, fileName, keepExtension) {
    const id = safePublicId(fileName, folder, keepExtension).replace(/\.\.+/g, ".");
    const rel = `${zone}/${id}`;
    const full = path.join(LOCAL_DIR, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
    return { rel, bytes: buffer.length };
}

function extFor(mimeType, fileName) {
    const dot = String(fileName || "").lastIndexOf(".");
    if (dot > 0) return String(fileName).slice(dot).replace(/[^a-zA-Z0-9.]/g, "");
    const m = String(mimeType || "").toLowerCase();
    return m === "image/png" ? ".png" : m === "image/webp" ? ".webp" : m.startsWith("image/") ? ".jpg" : "";
}

function localPublicUrl(rel, baseUrl) {
    return `${apiBase(baseUrl)}/media/${rel.replace(/^public\//, "")}`;
}

// Force a download rather than an inline render, with a sensible filename.
function attachmentUrl(secureUrl, fileName) {
    if (!secureUrl || !secureUrl.includes("/upload/")) return secureUrl;
    const stem = String(fileName || "download").replace(/\.[^.]+$/, "");
    const safe = stem.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100) || "download";
    return secureUrl.replace("/upload/", `/upload/fl_attachment:${safe}/`);
}

function apiBase(baseUrl) {
    const b = String(baseUrl || process.env.PUBLIC_API_BASE_URL || "").trim();
    return b.replace(/\/+$/, "");
}

function uploadStream(buffer, options) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, res) =>
            error
                ? reject(new Error("Cloudinary upload failed: " + error.message))
                : resolve(res),
        );
        bufferToStream(buffer).pipe(stream);
    });
}

// ── Public upload, generic (images, voice notes, field-app media) ────────────
async function uploadToCloudinary(
    buffer,
    { folder = "matrubhoomi", resourceType = "auto", originalName = "", mimeType = "", baseUrl = "" } = {},
) {
    if (LOCAL_MODE) {
        const name = `${(originalName || "upload").replace(/\.[^.]+$/, "")}${extFor(mimeType, originalName) || ".jpg"}`;
        const { rel, bytes } = localWrite(buffer, "public", folder, name, true);
        return { url: localPublicUrl(rel, baseUrl), publicId: `local:${rel}`, type: "image", format: "", bytes, originalName };
    }
    assertConfigured();
    const result = await uploadStream(buffer, {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
    });
    return {
        url: result.secure_url,
        publicId: result.public_id,
        type: result.resource_type,
        format: result.format,
        bytes: result.bytes,
        originalName,
    };
}

/**
 * Store a named document and return a URL that will actually open.
 *
 * Images go public and get a CDN URL. Everything else goes private and gets a
 * `/api/files/<token>` URL — see the header for why.
 *
 * The returned shape intentionally mirrors what the old Google Drive helper
 * returned — `fileId`, `viewUrl`, `downloadUrl` — so the call sites and the
 * `documentFileId` / `driveViewUrl` columns already in the database keep
 * working without a migration. `fileId` now holds a Cloudinary public_id.
 *
 * @param {Buffer} buffer
 * @param {object} opts
 * @param {string} opts.fileName  what a download should be saved as
 * @param {string} opts.mimeType
 * @param {string} [opts.folder]
 * @param {string} [opts.baseUrl] this API's public origin, for the /api/files
 *                                link. Pass `${req.protocol}://${req.get("host")}`
 *                                or set PUBLIC_API_BASE_URL.
 */
async function uploadPublicFile(
    buffer,
    {
        fileName = "document.pdf",
        mimeType = "application/pdf",
        folder = "matrubhoomi/documents",
        baseUrl = "",
    } = {},
) {
    assertConfigured();
    const resourceType = resourceTypeFor(mimeType);

    if (LOCAL_MODE) {
        if (resourceType === "image") {
            const { rel, bytes } = localWrite(buffer, "public", folder, fileName, true);
            const url = localPublicUrl(rel, baseUrl);
            return {
                fileId: `local:${rel}`, publicId: `local:${rel}`, fileName, resourceType: "image", deliveryType: "upload",
                url, viewUrl: url, embedUrl: url, downloadUrl: url, mimeType, size: bytes, bytes,
            };
        }
        const { rel, bytes } = localWrite(buffer, "private", folder, fileName, false);
        const token = mintFileToken({ publicId: `local:${rel}`, resourceType, deliveryType: "private", mimeType, fileName });
        const proxied = `${apiBase(baseUrl)}/api/files/${token}`;
        return {
            fileId: `local:${rel}`, publicId: `local:${rel}`, fileName, resourceType, deliveryType: "private",
            url: proxied, viewUrl: proxied, embedUrl: proxied, downloadUrl: proxied, mimeType, size: bytes, bytes,
        };
    }

    // ── Images: straight to the CDN ─────────────────────────────────────────
    if (resourceType === "image") {
        const result = await uploadStream(buffer, {
            resource_type: "image",
            type: "upload",
            public_id: safePublicId(fileName, folder, false),
            overwrite: true,
        });
        return {
            fileId: result.public_id,
            publicId: result.public_id,
            fileName,
            resourceType: "image",
            deliveryType: "upload",
            url: result.secure_url,
            viewUrl: result.secure_url,
            embedUrl: result.secure_url,
            downloadUrl: attachmentUrl(result.secure_url, fileName),
            mimeType,
            size: result.bytes,
            bytes: result.bytes,
        };
    }

    // ── Everything else: private, served through /api/files ────────────────
    const result = await uploadStream(buffer, {
        resource_type: resourceType,
        type: "private",
        public_id: safePublicId(fileName, folder, false),
        overwrite: true,
    });

    const token = mintFileToken({
        publicId: result.public_id,
        resourceType,
        deliveryType: "private",
        mimeType,
        fileName,
    });
    const proxied = `${apiBase(baseUrl)}/api/files/${token}`;

    return {
        fileId: result.public_id,
        publicId: result.public_id,
        fileName,
        resourceType,
        deliveryType: "private",
        url: proxied,
        viewUrl: proxied,
        embedUrl: proxied,
        downloadUrl: proxied,
        mimeType,
        size: result.bytes,
        bytes: result.bytes,
    };
}

/**
 * PRIVATE upload for callers that serve the bytes through a route of their own
 * with its own entitlement check — HR letters, which re-test the release gate
 * on every request.
 *
 * NOTE what is deliberately NOT returned: Cloudinary's `secure_url`. For a
 * private raw asset that URL already carries a working signature, so persisting
 * it or handing it to a browser would quietly undo the privacy. Only the
 * publicId comes back; `getPrivateFileStream` is the sole way to read it.
 */
async function uploadPrivateFile(
    buffer,
    {
        fileName = "document.pdf",
        mimeType = "application/pdf",
        folder = "matrubhoomi/private",
    } = {},
) {
    if (LOCAL_MODE) {
        const { rel, bytes } = localWrite(buffer, "private", folder, fileName, false);
        return { publicId: `local:${rel}`, fileName, resourceType: resourceTypeFor(mimeType), deliveryType: "private", mimeType, bytes, size: bytes };
    }
    assertConfigured();
    const resourceType = resourceTypeFor(mimeType);

    const result = await uploadStream(buffer, {
        resource_type: resourceType,
        type: "private",
        public_id: safePublicId(fileName, folder, false),
        overwrite: true,
    });

    return {
        publicId: result.public_id,
        fileName,
        resourceType,
        deliveryType: "private",
        mimeType,
        bytes: result.bytes,
        size: result.bytes,
    };
}

/** A short-lived signed URL for a private asset. SERVER-SIDE USE ONLY. */
function signPrivateUrl(
    publicId,
    { resourceType = "raw", type = "private", ttlSeconds = PRIVATE_TTL_S } = {},
) {
    assertConfigured();
    return cloudinary.utils.private_download_url(publicId, "", {
        resource_type: resourceType,
        type,
        // `format` is empty because the extension is not part of the public_id
        // for these assets — passing both makes Cloudinary look for "x.pdf.pdf".
        expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    });
}

/**
 * Fetch a private asset's bytes for streaming back through one of our own
 * routes, which re-checks the caller's entitlement on every request.
 *
 * The stream is a NODE Readable, not the web stream `fetch` hands back:
 * callers pipe it straight into an Express response, and a web stream has no
 * `.pipe()` — that would fail at runtime only on the download path, which is
 * the one path nobody exercises before shipping.
 *
 * @returns {Promise<{stream: import("stream").Readable, mimeType: string, size: number|null}>}
 */
async function getPrivateFileStream(
    publicId,
    { resourceType = "raw", type = "private" } = {},
) {
    // Written by local mode — read from disk, whatever mode is on now.
    if (String(publicId || "").startsWith("local:")) {
        const full = path.join(LOCAL_DIR, String(publicId).slice(6));
        if (!full.startsWith(LOCAL_DIR) || !fs.existsSync(full)) {
            const err = new Error("Local file not found");
            err.statusCode = 404;
            throw err;
        }
        return { stream: fs.createReadStream(full), mimeType: "application/octet-stream", size: fs.statSync(full).size };
    }
    const doFetch = async () => {
        // Re-signed on the retry too: a signature that expired between the two
        // attempts would turn a transient 500 into a permanent 401.
        const res = await fetch(signPrivateUrl(publicId, { resourceType, type }));
        if (!res.ok) {
            const err = new Error(`Cloudinary download failed (${res.status})`);
            err.statusCode = res.status;
            throw err;
        }
        return {
            stream: Readable.fromWeb(res.body),
            mimeType: res.headers.get("content-type") || "application/octet-stream",
            size: Number(res.headers.get("content-length")) || null,
        };
    };

    try {
        return await doFetch();
    } catch (e) {
        // One retry for a transient failure only — a rate limit or a hiccup on
        // Cloudinary's side, never a real 401/404 on the asset.
        if (e.statusCode === 429 || e.statusCode >= 500) {
            await new Promise((r) => setTimeout(r, 400));
            return await doFetch();
        }
        throw e;
    }
}

/** Delete an asset. `type` MUST match how it was uploaded. */
async function deleteFile(publicId, { resourceType = "raw", type = "private" } = {}) {
    if (!publicId) return { result: "not found" };
    if (String(publicId).startsWith("local:")) {
        const full = path.join(LOCAL_DIR, String(publicId).slice(6));
        if (full.startsWith(LOCAL_DIR) && fs.existsSync(full)) fs.unlinkSync(full);
        return { result: "ok" };
    }
    assertConfigured();
    // Destroying a private asset as type "upload" reports { result: "not
    // found" } and silently leaves the file in place, so this is not a detail
    // a caller can be vague about.
    return cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type,
        invalidate: true,
    });
}

module.exports = {
    LOCAL_MODE,
    LOCAL_DIR,
    uploadToCloudinary,
    uploadPublicFile,
    uploadPrivateFile,
    signPrivateUrl,
    getPrivateFileStream,
    deleteFile,
    resourceTypeFor,
};
