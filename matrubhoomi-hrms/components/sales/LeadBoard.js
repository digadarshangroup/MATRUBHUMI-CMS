// components/sales/LeadBoard.js
//
// The pipeline as a board: one column per stage, one card per lead, dragged
// from column to column to move it.
//
// WHY DRAG AND DROP AND NOT A DROPDOWN
// ------------------------------------
// A dropdown on each row is fewer lines of code and answers "what stage is this
// lead on". The board answers a different question, which is the one a sales
// manager actually opens this screen with: WHERE IS EVERYTHING. Sixty leads in
// seven columns is a shape you read in a second — the bulge at "interested",
// the two stuck at "payment" — and no list of sixty rows shows you that however
// it is sorted.
//
// THE DRAG IS HTML5's OWN, NOT A LIBRARY
// --------------------------------------
// react-dnd or dnd-kit is 15–40KB plus a provider, a sensor config and a
// backend, and this board needs exactly one interaction: pick up a card, drop
// it on a column. The native API does that in three handlers. What the native
// API is genuinely bad at — sortable lists, reordering WITHIN a column, touch
// devices — this board deliberately does not do: the ORDER of leads inside a
// stage carries no meaning, so there is nothing to sort.
//
// A MOVE IS OPTIMISTIC, AND REVERSIBLE
// ------------------------------------
// The card lands in the new column the instant it is dropped, because a board
// that waits 400ms for a round trip before the card moves feels broken. If the
// server refuses, the card goes back where it came from and the reason is shown
// — rather than leaving a lie on screen.
"use client";

import { useMemo, useState } from "react";
import { GripVertical, Phone } from "lucide-react";
import { salesApi } from "@/lib/salesApi";
import { StageChip, rupees, shortDate } from "@/components/sales/kit";

/** A stage's tone as a real colour, for the column's own accents. */
const TONE_VAR = {
  brand: "var(--g-brand)",
  water: "var(--g-water)",
  harvest: "var(--g-harvest)",
  brick: "var(--g-brick)",
  neutral: "var(--g-ink-3)",
};

export default function LeadBoard({ leads, stages, onOpenLead, onMoved, onError }) {
  // leadId -> stageKey, for moves that have happened on screen but are not yet
  // confirmed. Kept separate from the server's data so a refresh underneath
  // cannot silently undo what somebody just did.
  const [pending, setPending] = useState({});
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  const board = useMemo(() => {
    const columns = stages
      .filter((s) => s.isActive !== false)
      .map((stage) => ({ stage, leads: [] }));

    const byKey = new Map(columns.map((c) => [c.stage.key, c]));
    for (const lead of leads) {
      const key = pending[lead._id] ?? lead.stageKey;
      byKey.get(key)?.leads.push(lead);
    }
    return columns;
  }, [leads, stages, pending]);

  /**
   * @param stageKey the column dropped on
   * @param droppedId the lead id carried by the drag itself
   *
   * THE ID COMES FROM `dataTransfer`, NOT FROM REACT STATE.
   *
   * `dragging` is set in onDragStart, and reading it here looked fine — but a
   * state update is not guaranteed to have been applied by the time the drop
   * handler runs, and any re-render between the two (a background refetch is
   * enough) can land while the drag is in flight. The failure is silent: the
   * card simply does not move, with nothing logged.
   *
   * The DataTransfer is the browser's own channel for exactly this, it is set
   * synchronously at dragstart, and it survives anything React does in between.
   * State is kept only for the visual "this one is moving" hint.
   */
  async function drop(stageKey, droppedId) {
    const id = droppedId || dragging?._id;
    const lead = leads.find((l) => l._id === id) || dragging;
    setOver(null);
    setDragging(null);
    if (!lead || lead.stageKey === stageKey) return;

    const from = lead.stageKey;
    setPending((p) => ({ ...p, [lead._id]: stageKey }));

    try {
      await salesApi.moveLead(lead._id, stageKey);
      onMoved?.();
      // Cleared only after the parent has refetched — dropping it earlier makes
      // the card flick back to its old column for one frame.
      setPending((p) => {
        const next = { ...p };
        delete next[lead._id];
        return next;
      });
    } catch (err) {
      setPending((p) => {
        const next = { ...p };
        delete next[lead._id];
        return next;
      });
      onError?.(
        err.isPermission
          ? "You do not have permission to move leads."
          : `${lead.name} could not be moved to ${stageKey.replace(/_/g, " ")}: ${err.message}`,
      );
      // The card returns to `from` by itself: `pending` is gone and the lead's
      // own stageKey never changed.
      void from;
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {board.map(({ stage, leads: columnLeads }) => {
        const tone = TONE_VAR[stage.tone] || TONE_VAR.neutral;
        const isOver = over === stage.key;
        const value = columnLeads.reduce((sum, l) => sum + (l.dealValue || l.estimatedValue || 0), 0);

        return (
          <section
            key={stage.key}
            onDragOver={(e) => {
              // Without preventDefault the browser refuses the drop outright —
              // the single most common reason native drag and drop "does
              // nothing".
              e.preventDefault();
              if (over !== stage.key) setOver(stage.key);
            }}
            onDragLeave={() => setOver((o) => (o === stage.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              drop(stage.key, e.dataTransfer.getData("text/plain"));
            }}
            className="flex w-[280px] shrink-0 flex-col rounded-[14px] border transition-colors"
            style={{
              borderColor: isOver ? tone : "var(--g-line)",
              background: isOver ? `color-mix(in srgb, ${tone} 7%, var(--g-surface))` : "var(--g-surface-2)",
            }}
            aria-label={`${stage.name}, ${columnLeads.length} leads`}
          >
            {/* Column head */}
            <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone }} />
                <h3 className="truncate text-[13px] font-medium text-[var(--g-ink)]">{stage.name}</h3>
              </div>
              <span
                data-figure
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums"
                style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
              >
                {columnLeads.length}
              </span>
            </div>

            {value > 0 && (
              <p className="px-3 pb-2 text-[11px] tabular-nums text-[var(--g-ink-3)]">{rupees(value)}</p>
            )}

            {/* Cards */}
            <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
              {columnLeads.length === 0 && (
                <p className="px-1 py-6 text-center text-[11px] text-[var(--g-ink-faint)]">
                  {isOver ? "Drop here" : "Nothing here"}
                </p>
              )}

              {columnLeads.map((lead) => {
                const moving = pending[lead._id] !== undefined;
                const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();

                return (
                  <article
                    key={lead._id}
                    draggable={!moving}
                    onDragStart={(e) => {
                      setDragging(lead);
                      e.dataTransfer.effectAllowed = "move";
                      // Firefox refuses to start a drag unless something is set.
                      e.dataTransfer.setData("text/plain", lead._id);
                    }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={() => onOpenLead(lead._id)}
                    className="group cursor-pointer rounded-[10px] border border-[var(--g-line)] bg-[var(--g-surface)] p-2.5 transition-shadow hover:shadow-[var(--g-shadow)]"
                    style={{ opacity: moving ? 0.5 : 1 }}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical
                        size={13}
                        aria-hidden
                        className="mt-0.5 shrink-0 cursor-grab text-[var(--g-ink-faint)] opacity-0 transition-opacity group-hover:opacity-100"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--g-ink)]">{lead.name}</p>
                        <p className="mt-0.5 truncate text-[11px] tabular-nums text-[var(--g-ink-3)]">
                          {[lead.phone, lead.address?.village].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded-full p-1 text-[var(--g-ink-3)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--g-surface-2)] hover:text-[var(--g-brand)]"
                          aria-label={`Call ${lead.name}`}
                        >
                          <Phone size={13} />
                        </a>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {lead.assignedToName && (
                        <span className="rounded-full bg-[var(--g-surface-2)] px-2 py-0.5 text-[10px] text-[var(--g-ink-2)]">
                          {lead.assignedToName.split(" ")[0]}
                        </span>
                      )}
                      {(lead.dealValue || lead.estimatedValue) > 0 && (
                        <span className="text-[10px] tabular-nums text-[var(--g-ink-3)]">
                          {rupees(lead.dealValue || lead.estimatedValue)}
                        </span>
                      )}
                      {overdue && (
                        <span className="rounded-full bg-[var(--g-danger-wash)] px-2 py-0.5 text-[10px] text-[var(--g-danger)]">
                          due {shortDate(lead.nextFollowUpAt)}
                        </span>
                      )}
                      {lead.phoneVerified && (
                        <span className="text-[10px] text-[var(--g-brand)]" title="Phone verified by OTP">
                          verified
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
