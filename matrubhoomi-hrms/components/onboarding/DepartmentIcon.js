// components/onboarding/DepartmentIcon.js
//
// The mark on a department tile.
//
// Three sources, in order:
//
//   1. The uploaded iconUrl, when the department has one AND it loads. A URL
//      that 404s is not an icon, so the image element's onError handler falls
//      through to (2) rather than leaving a broken-image box on the front door
//      of the app.
//   2. A built-in icon chosen by slug. Every seeded department has one, so a
//      fresh install looks finished without anybody uploading anything.
//   3. The department's initials, for a department created by an admin whose
//      slug this file has never heard of. It always renders something.
//
// Kept separate from the tile so the same rules apply everywhere a department
// is drawn — the portal and the admin list — instead of each screen inventing
// its own fallback.
//
// COLOUR
// ------
// Emerald is the company's colour and it owns the interface: the mark, the
// primary action, the granted state. Department hue is a SECOND, quieter system
// that lives only on the glyph, so twelve departments stay tellable apart at a
// glance without twelve saturated blocks fighting the brand.
//
// A department's own accentColor wins when an admin has actually chosen one.
// The model defaults that field to #4F46E5 and every seeded row still carries
// it, so treating the default as a choice would paint all twelve identical.
//
// THEME
// -----
// Every surface colour is a CSS custom property owned by the page, never a
// literal, so the same component is correct in light and dark. Only the glyph
// hues are literals, and they are chosen to hold contrast on both grounds.

"use client";

import { useState } from "react";
import {
  Users, Calculator, Ruler, Scissors, Sparkles, Truck, Shield,
  ShoppingBag, SquareKanban, Warehouse, Factory, BadgeCheck, Briefcase, Boxes,
} from "lucide-react";

/** The value AccessDepartment.accentColor defaults to — i.e. "nobody picked". */
const UNSET_ACCENT = "#4F46E5";

/**
 * Slug → icon + hue. Slugs are stable (they are the login and route identity),
 * so this map does not drift the way a name-based one would.
 *
 * Hues are mid-range on purpose: light enough to read on the near-black ground
 * of the dark theme, dark enough to read on paper white. A pair per lane keeps
 * neighbours in the flow distinguishable without turning the row into a rainbow.
 */
const BY_SLUG = {
  // Order
  "sales":                  { Icon: ShoppingBag,   color: "#E4692B" },
  "merchandiser":           { Icon: Boxes,         color: "#0284C7" },
  "project-manager":        { Icon: SquareKanban,  color: "#3B7DD8" },
  "store":                  { Icon: Warehouse,     color: "#C07818" },
  // Make
  "mpc-measurement":        { Icon: Ruler,         color: "#0E9BB5" },
  "cutting-master":         { Icon: Scissors,      color: "#D2418F" },
  "embroidery":             { Icon: Sparkles,      color: "#9558DE" },
  "production-supervisor":  { Icon: Factory,       color: "#C79A16" },
  "qc":                     { Icon: BadgeCheck,    color: "#1FA363" },
  "packaging-dispatch":     { Icon: Truck,         color: "#5566DA" },
  // Company
  "ceo":                    { Icon: Briefcase,     color: "#12857A" },
  "hr":                     { Icon: Users,         color: "#8A5CF0" },
  "accountant":             { Icon: Calculator,    color: "#20A06A" },
  "platform-admin":         { Icon: Shield,        color: "#6B7A90" },
};

/**
 * A department an admin created later has no entry here, and guessing an icon
 * from the name would be wrong as often as right. Its initials say more than a
 * generic glyph would, so this returns null and the caller draws them instead.
 */
export function iconComponentFor(slug) {
  return BY_SLUG[slug]?.Icon || null;
}

/** The hue to draw a department in — its own if chosen, else the built-in one. */
export function colorFor(dept) {
  const chosen = dept?.accentColor;
  if (chosen && chosen.toUpperCase() !== UNSET_ACCENT) return chosen;
  // A literal, not var(--brand): this component is also drawn inside Access
  // Control, which does not define the portal's theme variables, and an unknown
  // custom property resolves to nothing rather than to a colour.
  return BY_SLUG[dept?.slug]?.color || UNSET_ACCENT;
}

export function initialsOf(name = "") {
  return (
    name
      .replace(/[^A-Za-z ]/g, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * @param dept   { slug, name, iconUrl, iconAlt, accentColor }
 * @param size   px — the plate, not the glyph
 * @param muted  draw it in grey, for a department this person cannot open
 * @param flat   no plate; for dense lists where the surrounding row is the tile
 * @param bare   no plate AND no tint — just the glyph, for the rail, where a
 *               column of coloured chips fights the one thing that should read
 *               as selected
 */
export default function DepartmentIcon({
  dept,
  size = 60,
  muted = false,
  flat = false,
  bare = false,
  className = "",
  style,
}) {
  // An uploaded icon is only trusted until the browser says otherwise.
  const [imageFailed, setImageFailed] = useState(false);
  const useImage = Boolean(dept?.iconUrl) && !imageFailed;

  const Glyph = iconComponentFor(dept?.slug);
  const hue = colorFor(dept);
  const color = muted ? "var(--ink-faint, #7b8794)" : hue;
  const glyphSize = bare ? size : Math.round(size * 0.42);

  return (
    <span
      aria-hidden="true"
      className={`dept-plate ${bare ? "is-bare" : flat ? "is-flat" : ""} ${muted ? "is-muted" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        // The rounded square of every app launcher. Proportional, so the shape
        // holds at 36px in the admin list and at 60px on the portal.
        borderRadius: Math.round(size * 0.28),
        "--plate-hue": hue,
        ...style,
      }}
    >
      {useImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dept.iconUrl}
          alt=""
          onError={() => setImageFailed(true)}
          className="dept-plate-img"
          style={{ filter: muted ? "grayscale(1) opacity(.55)" : undefined }}
        />
      ) : Glyph ? (
        <Glyph size={glyphSize} strokeWidth={2} style={{ color }} />
      ) : (
        <span
          className="dept-plate-initials"
          style={{ color, fontSize: Math.round(glyphSize * 0.74) }}
        >
          {initialsOf(dept?.name)}
        </span>
      )}
    </span>
  );
}
