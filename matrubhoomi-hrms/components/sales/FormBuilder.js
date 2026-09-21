// components/sales/FormBuilder.js
//
// Where the desk composes what the field is asked.
//
// THE KEY IS THE THING THAT MATTERS, AND IT IS DERIVED
// ----------------------------------------------------
// Every answer is stored under a field's `key`, so the key is the one part of a
// field that cannot be casually changed once anybody has answered it. Asking a
// sales manager to invent snake_case identifiers is asking for `Field 1` and
// `feild_2`, so the key is derived from the label automatically — and then
// FROZEN the moment the template has submissions, with the input disabled and
// the reason shown rather than the control silently vanishing.
//
// REMOVING A FIELD IS A CONVERSATION, NOT A DELETE
// ------------------------------------------------
// The server answers a save that drops an answered field with a 409 listing
// what would stop being collected. This dialog shows that back and asks again.
// Nothing is lost either way — old submissions keep their own version — but
// "you are about to stop collecting land size" is worth one extra click.
"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { Dialog, ErrorNote } from "@/components/sales/kit";

const FIELD_TYPES = [
  { id: "text", label: "Short text" },
  { id: "textarea", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "currency", label: "Money" },
  { id: "area", label: "Land area" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "date", label: "Date" },
  { id: "time", label: "Time" },
  { id: "select", label: "Choose one (dropdown)" },
  { id: "radio", label: "Choose one (buttons)" },
  { id: "multiselect", label: "Choose several" },
  { id: "checkbox", label: "Yes / no" },
  { id: "rating", label: "Rating 1–5" },
  { id: "photo", label: "Photograph" },
  { id: "signature", label: "Signature" },
  { id: "location", label: "Pinned location" },
  { id: "heading", label: "Section heading" },
];

const HAS_OPTIONS = ["select", "radio", "multiselect"];

/** `Land holding (acre)` becomes `land_holding_acre`. */
function keyFromLabel(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function blankField() {
  return {
    key: "",
    label: "",
    type: "text",
    required: false,
    helpText: "",
    options: [],
    maxPhotos: 3,
    cameraOnly: true,
    unit: "acre",
    min: null,
    max: null,
    showWhen: { field: "", equals: null },
  };
}

function FieldRow({ field, index, total, frozenKeys, allFields, onChange, onMove, onRemove }) {
  const [open, setOpen] = useState(!field.label);
  const frozen = frozenKeys.has(field.key);

  const set = (patch) => onChange({ ...field, ...patch });

  return (
    <div className="rounded-[12px] border border-[var(--g-line)] bg-[var(--g-surface)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical size={15} className="shrink-0 text-[var(--g-ink-faint)]" aria-hidden />

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <span className="block truncate text-sm text-[var(--g-ink)]">
            {field.label || <span className="text-[var(--g-ink-3)]">Untitled field</span>}
            {field.required && <span className="ml-1.5 text-[11px] text-[var(--g-ink-3)]">required</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--g-ink-3)]">
            {FIELD_TYPES.find((t) => t.id === field.type)?.label}
            {field.key ? ` · ${field.key}` : ""}
            {frozen ? " · answered" : ""}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Move up"
            className="rounded-full p-1.5 text-[var(--g-ink-3)] transition-colors hover:bg-[var(--g-surface-2)] disabled:opacity-30"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            aria-label="Move down"
            className="rounded-full p-1.5 text-[var(--g-ink-3)] transition-colors hover:bg-[var(--g-surface-2)] disabled:opacity-30"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label="Remove field"
            className="rounded-full p-1.5 text-[var(--g-ink-3)] transition-colors hover:bg-[var(--g-danger-wash)] hover:text-[var(--g-danger)]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-[var(--g-line)] px-3 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Question">
              <Input
                value={field.label}
                onChange={(e) => {
                  const label = e.target.value;
                  // The key follows the label until the field is answered, and
                  // then never again.
                  set(frozen ? { label } : { label, key: keyFromLabel(label) });
                }}
                placeholder="Land holding"
              />
            </Field>

            <Field label="Type">
              <Select value={field.type} onChange={(e) => set({ type: e.target.value })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          {field.type !== "heading" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Stored as"
                hint={frozen ? "Locked — answers are already stored under this name." : "Derived from the question."}
              >
                <Input value={field.key} disabled readOnly />
              </Field>

              <Field label="Helper text" hint="Shown under the field on the phone.">
                <Input value={field.helpText} onChange={(e) => set({ helpText: e.target.value })} />
              </Field>
            </div>
          )}

          {HAS_OPTIONS.includes(field.type) && (
            <Field label="Choices" hint="One per line.">
              <Textarea
                rows={3}
                value={(field.options || []).map((o) => o.label).join("\n")}
                onChange={(e) =>
                  set({
                    options: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((label) => ({ label, value: keyFromLabel(label) })),
                  })
                }
                placeholder={"Paddy\nWheat\nSugarcane"}
              />
            </Field>
          )}

          {field.type === "photo" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="How many photos">
                <Input
                  type="number"
                  min="1"
                  max="6"
                  value={field.maxPhotos}
                  onChange={(e) => set({ maxPhotos: Number(e.target.value) || 1 })}
                />
              </Field>
              <label className="flex items-end gap-2 pb-2.5 text-sm text-[var(--g-ink-2)]">
                <input
                  type="checkbox"
                  className="accent-[var(--g-brand)]"
                  checked={field.cameraOnly !== false}
                  onChange={(e) => set({ cameraOnly: e.target.checked })}
                />
                Camera only, no gallery
              </label>
            </div>
          )}

          {["number", "currency", "area", "rating"].includes(field.type) && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Least">
                <Input type="number" value={field.min ?? ""} onChange={(e) => set({ min: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Most">
                <Input type="number" value={field.max ?? ""} onChange={(e) => set({ max: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              {field.type === "area" && (
                <Field label="Unit">
                  <Select value={field.unit} onChange={(e) => set({ unit: e.target.value })}>
                    <option value="acre">Acre</option>
                    <option value="bigha">Bigha</option>
                    <option value="hectare">Hectare</option>
                    <option value="guntha">Guntha</option>
                  </Select>
                </Field>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {field.type !== "heading" && (
              <label className="flex items-center gap-2 text-sm text-[var(--g-ink-2)]">
                <input
                  type="checkbox"
                  className="accent-[var(--g-brand)]"
                  checked={field.required}
                  onChange={(e) => set({ required: e.target.checked })}
                />
                Must be answered
              </label>
            )}
          </div>

          {/* Conditional display. Kept last because it is the one thing most
              forms never need, and putting it first makes every field look
              more complicated than it is. */}
          {field.type !== "heading" && allFields.length > 1 && (
            <div className="grid grid-cols-1 gap-3 border-t border-[var(--g-line)] pt-3 sm:grid-cols-2">
              <Field label="Only show when" hint="Leave blank to always show.">
                <Select
                  value={field.showWhen?.field || ""}
                  onChange={(e) => set({ showWhen: { field: e.target.value, equals: field.showWhen?.equals ?? "" } })}
                >
                  <option value="">Always</option>
                  {allFields
                    .filter((f) => f.key && f.key !== field.key && f.type !== "heading")
                    .map((f) => (
                      <option key={f.key} value={f.key}>{f.label || f.key}</option>
                    ))}
                </Select>
              </Field>
              {field.showWhen?.field && (
                <Field label="…equals">
                  <Input
                    value={field.showWhen?.equals ?? ""}
                    onChange={(e) => set({ showWhen: { ...field.showWhen, equals: e.target.value } })}
                    placeholder="yes"
                  />
                </Field>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @param purpose  where this template hangs — "new_customer", "scheme_step" or
 *                 "standalone". It travels with the template rather than
 *                 changing how the form is built, because there is ONE form
 *                 engine and only its attachment point differs.
 * @param startName a name to open a NEW form with, so a caller that already
 *                 knows what it is making does not ask the user to invent one.
 */
export function FormBuilderDialog({ open, templateId, onClose, onSaved, stages = [], purpose, startName = "" }) {
  const [form, setForm] = useState(null);
  const [frozenKeys, setFrozenKeys] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [removalWarning, setRemovalWarning] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRemovalWarning(null);

    if (!templateId) {
      setForm({ name: startName, description: "", stageKey: "", fields: [blankField()], requiresOtp: false, requiresPhoto: false, requiresLocation: true });
      setFrozenKeys(new Set());
      return;
    }

    setForm(null);
    salesApi
      .template(templateId)
      .then((res) => {
        const t = res.data;
        setForm({
          name: t.name,
          description: t.description || "",
          stageKey: t.stageKey || "",
          fields: (t.fields || []).map((f) => ({ ...blankField(), ...f, showWhen: f.showWhen || { field: "", equals: null } })),
          requiresOtp: t.requiresOtp,
          requiresPhoto: t.requiresPhoto,
          requiresLocation: t.requiresLocation !== false,
          version: t.version,
          submissionCount: t.submissionCount || 0,
        });
        // Once answered, every key currently in the template is frozen.
        setFrozenKeys(new Set(t.submissionCount > 0 ? (t.fields || []).map((f) => f.key) : []));
      })
      .catch(setError);
  }, [open, templateId, startName]);

  function patchField(i, next) {
    setForm((f) => ({ ...f, fields: f.fields.map((x, idx) => (idx === i ? next : x)) }));
  }
  function moveField(i, delta) {
    setForm((f) => {
      const fields = [...f.fields];
      const j = i + delta;
      if (j < 0 || j >= fields.length) return f;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...f, fields };
    });
  }
  function removeField(i) {
    setForm((f) => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) }));
  }

  async function save(confirmRemoval = false) {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        description: form.description,
        stageKey: form.stageKey,
        requiresOtp: form.requiresOtp,
        requiresPhoto: form.requiresPhoto,
        requiresLocation: form.requiresLocation,
        // Only sent when the caller named one; otherwise the template keeps
        // whatever it already had rather than being reset to the default.
        ...(purpose ? { purpose } : {}),
        confirmRemoval,
        fields: form.fields
          .filter((f) => f.label.trim())
          .map((f, i) => ({
            ...f,
            key: f.key || keyFromLabel(f.label),
            order: i * 10,
            showWhen: f.showWhen?.field ? f.showWhen : undefined,
          })),
      };

      const res = templateId ? await salesApi.saveTemplate(templateId, body) : await salesApi.createTemplate(body);
      onSaved?.(res.data);
      onClose?.();
    } catch (err) {
      // The server's "these answered fields would stop being collected" case.
      if (err.code === "FIELDS_IN_USE") setRemovalWarning(err);
      else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={templateId ? "Edit form" : "New form"}
      sub={
        form?.submissionCount
          ? `${form.submissionCount} submission(s) already answer this. Saving publishes version ${(form.version || 1) + 1}; the old answers stay readable.`
          : "The field app renders exactly what you build here."
      }
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button tone="primary" size="sm" onClick={() => save(false)} disabled={busy || !form?.name?.trim()}>
            {busy ? "Saving…" : "Save form"}
          </Button>
        </>
      }
    >
      {!form ? (
        <p className="py-8 text-center text-sm text-[var(--g-ink-3)]">Loading…</p>
      ) : (
        <div className="space-y-5">
          <ErrorNote error={error} />

          {removalWarning && (
            <div
              role="alert"
              className="rounded-[10px] border px-4 py-3 text-sm"
              style={{ borderColor: "var(--g-hint-edge)", background: "var(--g-hint-wash)", color: "var(--g-hint)" }}
            >
              <p className="font-medium">These fields would stop being collected</p>
              <p className="mt-0.5">{removalWarning.message}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" tone="primary" onClick={() => { setRemovalWarning(null); save(true); }}>
                  Go ahead
                </Button>
                <Button size="sm" tone="ghost" onClick={() => setRemovalWarning(null)}>
                  Keep them
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Form name" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Field survey" />
            </Field>
            <Field label="Used at stage" hint="The rung this form completes. Optional.">
              <Select value={form.stageKey} onChange={(e) => setForm((f) => ({ ...f, stageKey: e.target.value }))}>
                <option value="">Not tied to a stage</option>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="What it is for">
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>

          <div className="flex flex-wrap gap-4 rounded-[10px] bg-[var(--g-surface-2)] px-4 py-3">
            {[
              ["requiresLocation", "Capture where it was filled"],
              ["requiresPhoto", "Require a photograph"],
              ["requiresOtp", "Verify the customer by OTP"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-[var(--g-ink-2)]">
                <input
                  type="checkbox"
                  className="accent-[var(--g-brand)]"
                  checked={Boolean(form[key])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
                Questions ({form.fields.length})
              </h3>
              <Button size="sm" onClick={() => setForm((f) => ({ ...f, fields: [...f.fields, blankField()] }))}>
                <Plus size={14} /> Add a question
              </Button>
            </div>

            <div className="space-y-2">
              {form.fields.map((field, i) => (
                <FieldRow
                  key={i}
                  field={field}
                  index={i}
                  total={form.fields.length}
                  frozenKeys={frozenKeys}
                  allFields={form.fields}
                  onChange={(next) => patchField(i, next)}
                  onMove={moveField}
                  onRemove={removeField}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

export default FormBuilderDialog;
