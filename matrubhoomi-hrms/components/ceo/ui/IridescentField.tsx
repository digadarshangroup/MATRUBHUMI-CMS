"use client";

/**
 * The chrome field — the back layer of "Chrome Under Frost".
 *
 * Six large soft hues drifting on independent cycles behind everything. It is
 * the only thing here that moves at rest, and every frosted surface depends on
 * it: glass over a flat backdrop is not glass, it is grey. Rendered in CSS
 * rather than as a bitmap so it never repeats, costs no bytes, and stays sharp
 * on any display.
 *
 * Mount it ONCE, at the root of your layout, before your content. It is
 * `position: fixed; z-index: -1`, so it sits behind everything without
 * participating in layout.
 *
 * **Cost.** Ten permanently-composited layers (six blobs, four specular bands),
 * each carrying `will-change: transform`. On integrated graphics that is real
 * VRAM, and it runs whether or not anybody is interacting. `data-perf="low"` on
 * <html> skips the render entirely — not merely hides it, because a hidden
 * element with `will-change` still asks the compositor for a layer.
 */

import { useEffect, useState } from "react";

type Blob = {
  hue: string;
  top: string;
  left: string;
  size: string;
  dx: string;
  dy: string;
  ds: string;
  dur: string;
  delay: string;
  opacity: number;
};

const blobs: Blob[] = [
  {
    hue: "var(--color-field-ivory)",
    top: "28%",
    left: "6%",
    size: "46vw",
    dx: "9%",
    dy: "-7%",
    ds: "1.22",
    dur: "48s",
    delay: "0s",
    opacity: 0.9,
  },
  {
    hue: "var(--color-field-gold)",
    top: "52%",
    left: "22%",
    size: "38vw",
    dx: "-7%",
    dy: "8%",
    ds: "1.14",
    dur: "56s",
    delay: "-8s",
    opacity: 0.82,
  },
  {
    hue: "var(--color-field-rose)",
    top: "44%",
    left: "44%",
    size: "42vw",
    dx: "6%",
    dy: "9%",
    ds: "1.26",
    dur: "44s",
    delay: "-16s",
    opacity: 0.78,
  },
  {
    hue: "var(--color-field-mauve)",
    top: "20%",
    left: "58%",
    size: "40vw",
    dx: "-9%",
    dy: "6%",
    ds: "1.18",
    dur: "62s",
    delay: "-24s",
    opacity: 0.72,
  },
  {
    hue: "var(--color-field-slate)",
    top: "58%",
    left: "70%",
    size: "48vw",
    dx: "7%",
    dy: "-9%",
    ds: "1.2",
    dur: "50s",
    delay: "-12s",
    opacity: 0.8,
  },
  {
    hue: "var(--color-field-deep)",
    top: "72%",
    left: "36%",
    size: "52vw",
    dx: "-6%",
    dy: "-6%",
    ds: "1.3",
    dur: "68s",
    delay: "-30s",
    opacity: 0.55,
  },
];

/**
 * Reads the CEO root's perf flag rather than <html>'s: this kit is installed on
 * one subtree of a larger CMS, so the attribute lives on `.mb-ui` and the
 * rest of the app has no opinion about it.
 */
const isLow = () =>
  typeof document !== "undefined" &&
  document.querySelector(".mb-ui")?.getAttribute("data-perf") === "low";

/**
 * Watches `<html data-perf>`, so the field answers to the same flag the CSS does.
 *
 * Seeded from the attribute rather than from `false`, because the point of
 * skipping the render is to never CREATE the ten compositing layers. Starting
 * false would mount them for one frame and then tear them down, which is the
 * cost this exists to avoid.
 */
function useLowPerf(): boolean {
  const [low, setLow] = useState(isLow);
  useEffect(() => {
    const read = () => setLow(isLow());
    read();
    const root = document.querySelector(".mb-ui");
    if (!root) return undefined;
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-perf"] });
    return () => obs.disconnect();
  }, []);
  return low;
}

export function IridescentField() {
  const low = useLowPerf();
  if (low) return null;

  return (
    <div className="field" aria-hidden="true">
      {blobs.map((b, i) => (
        <span
          key={i}
          className="field-blob"
          style={
            {
              top: b.top,
              left: b.left,
              width: b.size,
              height: b.size,
              // Per-blob alpha as a VARIABLE, not an inline `opacity`. Inline
              // opacity beats the stylesheet, so the theme's
              // `--field-blob-opacity` (which dark mode sets to 0.42) was being
              // silently ignored. The stylesheet now multiplies the two, so the
              // per-blob variation and the per-theme dimming both apply.
              "--blob-alpha": b.opacity,
              background: `radial-gradient(circle at 34% 30%, ${b.hue}, transparent 68%)`,
              "--dx": b.dx,
              "--dy": b.dy,
              "--ds": b.ds,
              "--dur": b.dur,
              "--delay": b.delay,
            } as React.CSSProperties
          }
        />
      ))}
      {/* Specular bands over the hue blobs. Without these the field averages
          into a neutral haze and the frost above reads as plain grey — chrome
          is legible precisely because it has highlights and shadow cores for
          the glass to distort. */}
      {blobs.slice(0, 4).map((b, i) => (
        <span
          key={`spec-${i}`}
          className="field-spec"
          style={
            {
              top: b.top,
              left: b.left,
              width: b.size,
              height: b.size,
              opacity: 0.5,
              "--angle": `${72 + i * 34}deg`,
              "--dx": b.dx,
              "--dy": b.dy,
              "--ds": b.ds,
              "--dur": b.dur,
              "--delay": b.delay,
            } as React.CSSProperties
          }
        />
      ))}
      <span className="field-vignette" />
    </div>
  );
}
