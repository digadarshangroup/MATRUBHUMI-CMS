// scripts/generate-brand-assets.mjs
//
// Every size of the company mark the app asks for, rendered from ONE master.
//
//   node scripts/generate-brand-assets.mjs
//
// WHY A SCRIPT AND NOT A PILE OF EXPORTED FILES
// ---------------------------------------------
// app/layout.js hands the browser a different PNG for each favicon slot, on
// purpose: a browser given one 512px PNG for a 16px slot downloads the lot to
// draw 256 pixels, and scales it with a box filter that turns the brickwork in
// this logo into mud. That only stays true if every size is re-rendered from
// the master with a real filter whenever the artwork changes — which is what
// this does. The layout comment has always pointed at "the generator alongside
// the master"; this is it. The master is the artwork exactly as the company
// supplied it — public/matrubhoomi-logo-master.webp, byte for byte — and every
// file below is derived from it, so nothing here is a second copy to keep in
// step.
//
// THE TWO CROPS, AND WHY THE LOGO IS NOT ALWAYS THE WHOLE LOGO
// ------------------------------------------------------------
// The artwork is a lockup: a circular emblem above the word MATRUBHOOMI. Shown
// whole at 30px — which is how the rail, the sign-in card and the landing bar
// use it — that word is four pixels tall and reads as a smudge, and it is
// redundant anyway, because all three of those places already print the company
// name in text beside it.
//
// So a slot gets whichever crop it can actually show:
//
//   EMBLEM  the circular badge alone, for anything small or set beside text
//   FULL    the complete lockup, for anything standing on its own at size —
//           the letterhead, the payslip masthead, the PDF letters
//
// Both are the same artwork, untouched; only the framing differs. The emblem
// box below is measured from the master rather than eyeballed — see MEASURED.

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { statSync } from "node:fs";
import { writeFile } from "node:fs/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(root, "public", "matrubhoomi-logo-master.webp");
const out = (name) => join(root, "public", name);

// MEASURED from the master by scanning for the gap between the emblem and the
// wordmark: the emblem's ink runs x 173–1099, y 72–975, and the quietest row
// between the two blocks is y 975. This box is that bounding box squared off
// and centred, with a little air so the gear teeth are not clipped.
const EMBLEM = { left: 171, top: 58, width: 930, height: 930 };

/** Sizes drawn from the emblem alone. */
const EMBLEM_SIZES = [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["matrubhoomi-logo-64.png", 64],
  ["apple-touch-icon.png", 180],
  ["matrubhoomi-logo-192.png", 192],
  ["matrubhoomi-mark.png", 256],
];

/** Sizes drawn from the whole lockup. */
const FULL_SIZES = [
  ["matrubhoomi-logo.png", 512],
  ["matrubhoomi-logo-512.png", 512],
  ["matrubhoomi-logo-flat.png", 512],
  ["matrubhoomi-logo-letterhead.png", 800],
];

const kb = (p) => (statSync(p).size / 1024).toFixed(0).padStart(5) + " KB";

async function main() {
  const meta = await sharp(MASTER).metadata();
  console.log(`master: ${meta.width}x${meta.height}\n`);

  console.log("emblem crop (small slots, and anywhere the name is already in text):");
  for (const [name, size] of EMBLEM_SIZES) {
    await sharp(MASTER)
      .extract(EMBLEM)
      // Lanczos, which is what keeps the brick courses legible at 32px where a
      // box filter smears them into a brown block.
      .resize(size, size, { kernel: "lanczos3", fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(out(name));
    console.log(`  ${name.padEnd(30)} ${String(size).padStart(4)}px ${kb(out(name))}`);
  }

  console.log("\nfull lockup (standing alone at size):");
  for (const [name, size] of FULL_SIZES) {
    await sharp(MASTER)
      .resize(size, size, { kernel: "lanczos3", fit: "contain" })
      .png({ compressionLevel: 9 })
      .toFile(out(name));
    console.log(`  ${name.padEnd(30)} ${String(size).padStart(4)}px ${kb(out(name))}`);
  }

  // ── The copy the PDF generators inline ────────────────────────────────
  //
  // JPEG, not PNG. This artwork has an opaque backdrop, so nothing is lost by
  // dropping the alpha channel — and the same 420px mark is 81 KB of base64 as
  // a JPEG against 392 KB as a PNG. That difference is pasted into two source
  // files and carried by every bundle that imports them, so it is worth having.
  // Both call sites already choose embedJpg/embedPng from the data URI's own
  // mime type (lib/brandAssets.js → imageMimeOf), so nothing else changes.
  //
  // 420px because the masthead prints about 30mm wide; past that the page
  // cannot resolve it. 4:4:4 chroma because the default halves the colour
  // resolution, and this mark is fine brick courses and thin green letterforms
  // — exactly what that smears.
  const pdfJpg = await sharp(MASTER)
    .resize(420, 420, { kernel: "lanczos3", fit: "contain" })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const dataUri = "data:image/jpeg;base64," + pdfJpg.toString("base64");
  await writeFile(join(root, "scripts", ".brand-logo-datauri.txt"), dataUri);

  console.log(
    `\nPDF/letterhead embed: 420px JPEG, ${(pdfJpg.length / 1024).toFixed(0)} KB raw → ` +
      `${(dataUri.length / 1024).toFixed(0)} KB as a data URI`,
  );
  console.log("  written to scripts/.brand-logo-datauri.txt");
  console.log("  paste into lib/brandAssets.js (COMPANY_LOGO_BASE64) and");
  console.log("  ../matrubhoomi-hrms-backend/lib/payslipTemplate.mjs (LOGO_DATA_URI)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
