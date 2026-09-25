"use client";

// components/sales/WebsiteSchemeDialog.js
//
// The editor for one public scheme listing.
//
// THE PDF FIELDS ARE UPLOAD-ON-PICK, NOT UPLOAD-ON-SAVE
// -----------------------------------------------------
// Picking a file sends it to /api/uploads immediately and keeps only the
// returned descriptor in form state. Two reasons, both learned the hard way
// elsewhere in this app:
//
//   • A 12MB PDF uploaded during save turns "Save" into a twenty-second button
//     with no feedback, and the second click creates a duplicate row.
//   • The save request stays JSON. Mixing a multipart body into the same
//     endpoint would mean the scheme routes need multer, and then there are two
//     upload policies in the system again — the exact thing routes/uploads.js
//     was written to end.
//
// The cost is an orphaned Cloudinary asset when somebody uploads a PDF and then
// closes the dialog without saving. That is the right trade: an unreferenced
// file costs storage, a duplicated scheme costs a wrong public page.

import { useEffect, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ceo/ui/Primitives";
import { Dialog, ErrorNote } from "@/components/sales/kit";
import { uploadFileToCloudinary } from "@/lib/cloudinaryUpload";
import { websiteApi } from "@/lib/websiteApi";

const CATEGORY_LABELS = {
  fisheries: "Fisheries",
  horticulture: "Horticulture",
  trading: "Trading",
  "ca-banking-loans": "CA, Banking & Loans",
  "farming-construction": "Farming & Farm Construction",
  "real-estate": "Real Estate",
  "software-development": "Software & Development",
  "entrepreneur-manufacturing": "Entrepreneur & Manufacturing",
  "product-retail": "Product & Retail",
};

const BLANK = {
  title: "",
  titleOdia: "",
  description: "",
  category: "fisheries",
  department: "",
  maxSubsidy: "",
  deadline: "",
  eligibility: "",
  applyUrl: "",
  applyLabel: "Apply now",
  guidelineDoc: null,
  briefDoc: null,
  isPublished: false,
  sortOrder: 0,
};

/** Bytes as the public page will show them, so the desk sees what a visitor sees. */
function readableSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A date for <input type="date">, which accepts only YYYY-MM-DD. */
function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * One PDF slot: pick, show what is attached, remove.
 *
 * Accepts anything, not just application/pdf — several government offices
 * publish guidelines as a scanned .doc, and refusing them here would send the
 * desk looking for a converter rather than getting the page live.
 */
function DocumentField({ label, hint, value, onChange, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pick(event) {
    const file = event.target.files?.[0];
    // Clear the input so re-picking the same file fires change again.
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const stored = await uploadFileToCloudinary(file, "website/schemes");
      onChange({
        url: stored.url,
        fileName: stored.fileName || file.name,
        mimeType: stored.mimeType || file.type,
        bytes: stored.bytes || file.size,
      });
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} hint={hint} error={error}>
      {value ? (
        <div className="flex items-center gap-3 rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
          <FileText size={16} className="shrink-0 text-ink-muted" aria-hidden />
          <a
            href={value.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-2 hover:underline"
          >
            {value.fileName || "Attached document"}
          </a>
          {value.bytes ? (
            <span className="shrink-0 text-xs text-ink-faint">{readableSize(value.bytes)}</span>
          ) : null}
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            className="shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-inset bg-[var(--surface-raised)] px-3.5 py-3 text-sm text-ink-muted shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-colors hover:text-ink">
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Uploading…
            </>
          ) : (
            <>
              <Upload size={15} aria-hidden />
              Choose a file
            </>
          )}
          <input
            type="file"
            className="sr-only"
            onChange={pick}
            disabled={busy || disabled}
            accept=".pdf,.doc,.docx,application/pdf"
          />
        </label>
      )}
    </Field>
  );
}

export function WebsiteSchemeDialog({ open, schemeId, categories, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isNew = !schemeId;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (isNew) {
      setForm(BLANK);
      return;
    }

    let cancelled = false;
    setLoading(true);
    websiteApi
      .scheme(schemeId)
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        setForm({
          ...BLANK,
          ...d,
          // The three that do not survive a raw spread: a null number renders
          // as the string "null" in an input, and a Date needs slicing.
          maxSubsidy: d.maxSubsidy ?? "",
          deadline: toDateInput(d.deadline),
          sortOrder: d.sortOrder ?? 0,
        });
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open, schemeId, isNew]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        titleOdia: form.titleOdia,
        description: form.description,
        category: form.category,
        department: form.department,
        maxSubsidy: form.maxSubsidy === "" ? null : Number(form.maxSubsidy),
        deadline: form.deadline || null,
        eligibility: form.eligibility,
        applyUrl: form.applyUrl,
        applyLabel: form.applyLabel,
        guidelineDoc: form.guidelineDoc,
        briefDoc: form.briefDoc,
        isPublished: form.isPublished,
        sortOrder: Number(form.sortOrder) || 0,
      };

      if (isNew) await websiteApi.createScheme(body);
      else await websiteApi.updateScheme(schemeId, body);

      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const canSave = form.title.trim() && form.description.trim() && !saving && !loading;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={isNew ? "New scheme listing" : "Edit scheme listing"}
      sub="Published listings appear on the public website. Everyone on the internet can read them."
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={save} disabled={!canSave}>
            {saving ? "Saving…" : form.isPublished ? "Save & publish" : "Save draft"}
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              placeholder="Pradhan Mantri Matsya Sampada Yojana"
            />
          </Field>

          <Field
            label="Title in Odia"
            hint="Shown under the English title on the card."
            className="sm:col-span-2"
          >
            <Input
              value={form.titleOdia}
              onChange={(e) => set("titleOdia")(e.target.value)}
              placeholder="ପ୍ରଧାନମନ୍ତ୍ରୀ ମତ୍ସ୍ୟ ସମ୍ପଦା ଯୋଜନା"
            />
          </Field>

          <Field
            label="Description"
            required
            hint="Two or three sentences. This is the body of the card."
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="What the scheme funds, and who it is for."
            />
          </Field>

          <Field label="Website page" hint="Which public page lists it.">
            <Select value={form.category} onChange={(e) => set("category")(e.target.value)}>
              {(categories || Object.keys(CATEGORY_LABELS)).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key] || key}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Issuing department" hint="Shown as the source on the card.">
            <Input
              value={form.department}
              onChange={(e) => set("department")(e.target.value)}
              placeholder="Dept. of Fisheries & ARD, Govt. of Odisha"
            />
          </Field>

          <Field
            label="Maximum assistance (₹)"
            hint="Leave blank if the scheme is quoted as a percentage."
          >
            <Input
              type="number"
              min="0"
              value={form.maxSubsidy}
              onChange={(e) => set("maxSubsidy")(e.target.value)}
              placeholder="6000000"
            />
          </Field>

          <Field
            label="Last date to apply"
            hint="Drives the Open / Closing soon / Closed chip automatically."
          >
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => set("deadline")(e.target.value)}
            />
          </Field>

          <Field label="Eligibility" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.eligibility}
              onChange={(e) => set("eligibility")(e.target.value)}
              placeholder="Who can apply."
            />
          </Field>

          <DocumentField
            label="Guideline (PDF)"
            hint="The full scheme guideline document."
            value={form.guidelineDoc}
            onChange={set("guidelineDoc")}
            disabled={saving}
          />

          <DocumentField
            label="Brief description (PDF)"
            hint="The short summary sheet."
            value={form.briefDoc}
            onChange={set("briefDoc")}
            disabled={saving}
          />

          <Field
            label="Apply link"
            hint="Where the Apply button goes. Left blank, the button is hidden."
          >
            <Input
              type="url"
              value={form.applyUrl}
              onChange={(e) => set("applyUrl")(e.target.value)}
              placeholder="https://sugam.odisha.gov.in/..."
            />
          </Field>

          <Field label="Apply button text">
            <Input
              value={form.applyLabel}
              onChange={(e) => set("applyLabel")(e.target.value)}
              placeholder="Apply now"
            />
          </Field>

          <Field label="Sort order" hint="Lower numbers appear first.">
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder")(e.target.value)}
            />
          </Field>

          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2.5 py-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => set("isPublished")(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-ink)]"
              />
              Visible on the public website
            </label>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export { CATEGORY_LABELS };
export default WebsiteSchemeDialog;
