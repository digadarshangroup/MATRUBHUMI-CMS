"use client";

// components/hr/SearchableSelect.js
//
// A select you can type into. Native <select> is fine for five options and
// unusable for five hundred — picking a manager out of the whole company meant
// scrolling a list with no way to jump to a name.
//
// Behaves like a native select where it matters (same height/border vocabulary,
// closes on Escape and on outside click, Enter commits) and adds the one thing
// native cannot do: a filter box.
//
// The panel is position:fixed, with coordinates measured off the trigger. Both
// places this is used sit inside a dialog whose body is `overflow-y: auto`, and
// an absolutely-positioned panel inside a scroll container gets clipped by it.
// Fixed escapes the container; the trade is that the coordinates must be
// recomputed on scroll and resize, which is what the effect below does.

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

/**
 * @param options  [{ value, label, sub }]  — `sub` is the dim second line
 * @param value    currently selected value ("" = none)
 * @param onChange (value) => void
 */
export default function SearchableSelect({
  options = [],
  value = "",
  onChange,
  placeholder = "No change",
  emptyLabel = "— None —",
  disabled = false,
  loading = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Panel geometry. Opens downward, or upward when the bottom of the viewport
  // is closer than the panel is tall.
  const PANEL_H = 300;
  const measure = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const flip = below < PANEL_H && r.top > below;
    // Never below MIN_H: on a very short viewport the arithmetic can go
    // negative, which would collapse the panel to nothing.
    const MIN_H = 150;
    const cap = (space) => Math.max(MIN_H, Math.min(PANEL_H, space - 12));
    // The trigger can be narrow (two-column grid); a full name plus ID needs
    // more room than that, so the panel may exceed it — then it is nudged back
    // inside the right edge.
    const width = Math.min(Math.max(r.width, 270), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({
      left,
      width,
      ...(flip
        ? { bottom: window.innerHeight - r.top + 4, maxH: cap(r.top) }
        : { top: r.bottom + 4, maxH: cap(below) }),
    });
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    // Every whitespace-separated term must appear somewhere in the row, so
    // "sabar 104" finds "JAGENDRA SABAR (GR0104)".
    const terms = needle.split(/\s+/);
    return options.filter((o) => {
      const hay = `${o.label || ""} ${o.sub || ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [options, q]);

  // Focus the filter box as soon as the panel opens, and keep it anchored to
  // the trigger while the dialog behind it scrolls.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    setQ("");
    setActive(0);
    measure();
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    // Capture phase so scrolling of any ancestor container is caught, not just
    // the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (val) => {
    onChange(val);
    setOpen(false);
  };

  const onInputKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active === -1) commit("");
      else if (filtered[active]) commit(filtered[active].value);
    }
  };

  return (
    <div className="ss-root" ref={rootRef}>
      <button
        type="button"
        ref={btnRef}
        className={`ss-btn ${open ? "is-open" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`ss-btn-text ${selected ? "" : "is-placeholder"}`}>
          {loading ? "Loading…" : selected ? selected.label : placeholder}
        </span>
        {selected && !disabled && (
          <span
            className="ss-clear"
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} className={`ss-chev ${open ? "is-open" : ""}`} />
      </button>

      {open && pos && (
        <div
          className="ss-panel frost-bar"
          role="listbox"
          style={{
            left: pos.left,
            width: pos.width,
            ...(pos.top !== undefined
              ? { top: pos.top }
              : { bottom: pos.bottom }),
            maxHeight: pos.maxH,
          }}
        >
          <div className="ss-searchwrap">
            <Search size={13} className="ss-search-ico" />
            <input
              ref={inputRef}
              type="text"
              className="ss-search"
              placeholder="Type a name or ID…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
            />
            {q && (
              <button
                type="button"
                className="ss-search-x"
                onClick={() => setQ("")}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="ss-list scroll-slim" ref={listRef}>
            <button
              type="button"
              className={`ss-item ${!value ? "is-selected" : ""}`}
              data-active={active === -1}
              onMouseEnter={() => setActive(-1)}
              onClick={() => commit("")}
            >
              <span className="ss-item-label is-none">{emptyLabel}</span>
              {!value && <Check size={13} className="ss-item-check" />}
            </button>

            {filtered.length === 0 ? (
              <p className="ss-empty">No matches for “{q}”</p>
            ) : (
              filtered.map((o, i) => {
                const isSel = String(o.value) === String(value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    className={`ss-item ${isSel ? "is-selected" : ""}`}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(o.value)}
                  >
                    <span className="ss-item-text">
                      <span className="ss-item-label">{o.label}</span>
                      {o.sub && <span className="ss-item-sub">{o.sub}</span>}
                    </span>
                    {isSel && <Check size={13} className="ss-item-check" />}
                  </button>
                );
              })
            )}
          </div>

          {options.length > 0 && (
            <div className="ss-foot">
              <span data-figure>{filtered.length}</span> of{" "}
              <span data-figure>{options.length}</span>
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: SS_CSS }} />
    </div>
  );
}

// Chrome Under Frost. The trigger borrows the kit's input vocabulary (raised
// surface, hairline drawn as an inset ring so the box never grows on focus) and
// the panel is a frost-bar deck at the inset radius.
//
// One rule matters more than the rest here: every hover state paints a LESS
// transparent background than the thing at rest, never more. An option's rest
// state is fully transparent and its hover is --control, so the panel keeps its
// own material underneath; a hover wash lighter than the surface would let the
// iridescent field read straight through the card in light mode.
const SS_CSS = `
.ss-root { position: relative; width: 100%; min-width: 0; }
.ss-btn {
  display: flex; align-items: center; gap: .4rem; width: 100%; height: 36px;
  padding: 0 .5rem 0 .75rem; text-align: left;
  border: 0; border-radius: var(--radius-inset);
  background: var(--surface-raised); color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--hairline);
  transition: box-shadow 180ms var(--ease-deck), background-color 180ms var(--ease-deck);
  font: inherit; font-size: 13px; cursor: pointer;
}
.ss-btn:hover:not(:disabled) { background: var(--control); }
.ss-btn.is-open { box-shadow: inset 0 0 0 1.5px var(--ink); }
.ss-btn:disabled { opacity: .5; cursor: default; }
.ss-btn:focus-visible { outline: none; box-shadow: inset 0 0 0 1.5px var(--ink); }
.ss-btn-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-btn-text.is-placeholder { color: var(--ink-faint); }
.ss-chev { flex-shrink: 0; color: var(--ink-faint); transition: transform .16s var(--ease-deck); }
.ss-chev.is-open { transform: rotate(180deg); }
.ss-clear {
  flex-shrink: 0; display: grid; place-items: center; width: 18px; height: 18px;
  border-radius: 999px; color: var(--ink-faint); cursor: pointer;
  transition: background-color 180ms var(--ease-deck), color 180ms var(--ease-deck);
}
.ss-clear:hover { background: var(--control-hover); color: var(--ink); }

/* Fixed, not absolute — see the note at the top of this file. Coordinates are
   supplied inline from the measured trigger rect. The frosted material comes
   from the .frost-bar class on the element; the background below is only the
   fallback for a mount outside .mb-ui. */
.ss-panel {
  position: fixed; z-index: 200;
  background: var(--surface-raised);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-inset);
  box-shadow: var(--deck-seat, 0 18px 40px -14px rgba(0,0,0,.35));
  display: flex; flex-direction: column; overflow: hidden;
}
.ss-searchwrap { position: relative; padding: .45rem; border-bottom: 1px solid var(--hairline); flex-shrink: 0; }
.ss-search-ico { position: absolute; left: 1.05rem; top: 50%; transform: translateY(-50%); color: var(--ink-faint); pointer-events: none; }
.ss-search {
  width: 100%; height: 32px; padding: 0 1.7rem 0 1.85rem;
  border: 0; border-radius: var(--radius-inset);
  background: var(--surface-sunken); color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--hairline);
  transition: box-shadow 180ms var(--ease-deck);
  font: inherit; font-size: 13px;
}
.ss-search::placeholder { color: var(--ink-faint); }
.ss-search:focus-visible { outline: none; box-shadow: inset 0 0 0 1.5px var(--ink); }
.ss-search-x { position: absolute; right: 1.05rem; top: 50%; transform: translateY(-50%); background: none; border: 0; color: var(--ink-faint); cursor: pointer; padding: 0; display: grid; place-items: center; }
.ss-search-x:hover { color: var(--ink); }

.ss-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: .25rem; }
.ss-item {
  display: flex; align-items: center; gap: .5rem; width: 100%;
  padding: .45rem .55rem; border: 0; border-radius: var(--radius-inset);
  background: transparent;
  color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  transition: background-color 180ms var(--ease-deck);
}
.ss-item[data-active="true"] { background: var(--control); }
.ss-item.is-selected { color: var(--ink); font-weight: 560; }
.ss-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ss-item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-item-label.is-none { color: var(--ink-faint); }
.ss-item-sub { font-size: 11px; color: var(--ink-faint); margin-top: .05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ss-item-check { flex-shrink: 0; color: var(--ink); }
.ss-empty { padding: 1.1rem .5rem; text-align: center; font-size: 12px; color: var(--ink-faint); }
.ss-foot { padding: .4rem .65rem; border-top: 1px solid var(--hairline); font-size: 11px; color: var(--ink-faint); text-align: right; flex-shrink: 0; }
`;
