// app/hr/dashboard/documents/letterPdf.js
//
// Block list → A4 PDF, on pdf-lib.
//
// WHY pdf-lib AND NOT ONE OF THE OTHER FIVE: this repo already carries jsPDF,
// @react-pdf/renderer, pdf-lib, pdfkit, html2pdf and docx. pdf-lib is the one
// components/OfferLetter.js already composes letters with, it needs no React
// tree and no DOM, and it is the only one of them that will embed a signature
// PNG from raw bytes without a round trip through an <img>. A sixth stack for
// a seventh document type is how a bundle doubles.
//
// THREE THINGS THIS FILE EXISTS TO GET RIGHT, all of them things the first
// version got wrong and Word gets right:
//
//   1. MIXED WEIGHT WITHIN A LINE. "Dear Mr. Soumya," is three runs — plain,
//      bold, plain — and the signed letters lean on that constantly. So text
//      is a list of RUNS, wrapped word by word against each run's own font
//      metrics, not one string in one weight.
//
//   2. SECTIONS THAT DO NOT SPLIT. A heading strands at the foot of a page and
//      its clause starts on the next one; a paragraph breaks across the fold
//      mid-sentence. Both look like a fault in the letter. `group` blocks are
//      measured before they are drawn and moved whole to the next page if they
//      do not fit — see measure() below, which runs the real layout with the
//      pen lifted.
//
//   3. THE RIGHT TYPEFACE. The signed letters are Verdana 10.5pt, and Verdana
//      is not one of the fourteen standard PDF fonts — so it is embedded from
//      /public/fonts. See the Typeface note below for why that also fixed the
//      rupee sign, and what happens when the font cannot be fetched.
//
// Running headers are drawn in a SECOND pass, after the flow is finished,
// because "Page 3 of 7" cannot be written on page 3 until page 7 exists.

import { COMPANY_LOGO_BASE64, toPngBytes, imageMimeOf } from "@/lib/brandAssets";
import { COMPANY_ADDRESS_LINES, COMPANY_CONTACT_LINE } from "@/lib/company";

// ── Geometry ────────────────────────────────────────────────────────────────
//
// These numbers are read off the Matrubhoomi letterhead template, scaled to A4. The
// stationery is drawn on EVERY page — logo top right, red rule top left,
// address block and dark bar along the foot — so the text column has to clear
// both bands. TOP_Y and BOT_Y are what keeps body text off the furniture; move
// one of them and the letter starts printing over its own letterhead.
const PAGE = { w: 595.28, h: 841.89 };   // A4 portrait, points
const M = 56;                             // left / right margin
const W = PAGE.w - M * 2;                 // text column
const TOP_Y = PAGE.h - 108;               // first baseline, below the logo
const BOT_Y = 140;                        // content floor, above the address block
const USABLE = TOP_Y - BOT_Y;             // tallest a group can be and still fit

// ── The letterhead itself ───────────────────────────────────────────────────
// Read from lib/company.js, which is the ONE place the registered particulars
// live and is overridable from the environment. Still overridable per call, so
// a second entity or a changed registration needs no code edit here.
export const LETTERHEAD = {
    addressLines: COMPANY_ADDRESS_LINES,
    contact: COMPANY_CONTACT_LINE,
};

// ── Typeface ────────────────────────────────────────────────────────────────
//
// The signed Word letters are set in VERDANA at 10.5pt throughout (w:sz 21 in
// both documents' XML), so the PDF is too. Verdana is not one of the fourteen
// standard PDF base fonts, which means it has to be embedded — hence the .ttf
// files in /public/fonts and the fontkit registration below.
//
// Two things follow from embedding a real TrueType font rather than using a
// StandardFont:
//
//   1. UNICODE WORKS. WinAnsi could not encode "₹" and the text had to be
//      transliterated to "INR". An embedded subset carries whatever glyphs the
//      document uses, and Verdana 5.33 has U+20B9 — so the rupee sign now
//      prints as itself, exactly as it does in Word.
//
//   2. IT COSTS BYTES, unless subset. `subset: true` needs @pdf-lib/fontkit
//      specifically — plain `fontkit` v2 is API-incompatible with pdf-lib 1.17
//      and throws "subset.encodeStream is not a function" at save time. With
//      subsetting a letter is ~16 KB of font; without it, ~280 KB.
//
// If the fonts cannot be fetched the letter still renders, in Helvetica. That
// fallback is a sans-serif on purpose: a missing Verdana should degrade to
// something that looks like Verdana, not to a serif that looks deliberate.
export const FONT_URLS = {
    regular: "/fonts/verdana.ttf",
    bold: "/fonts/verdana-bold.ttf",
};

/**
 * WinAnsi fold, for the fallback fonts only.
 *
 * Anything WinAnsi cannot encode is transliterated where there is an obvious
 * equivalent and dropped where there is not — dropping a glyph costs one
 * character, throwing costs the whole letter. Not used when Verdana loads.
 */
export const ascii = (s) =>
    String(s ?? "")
        // "(₹)" would otherwise read "(INR )" — handle the bare form first.
        .replace(/₹\s*(?=\))/g, "INR")
        .replace(/₹\s*/g, "INR ")
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/[–—―]/g, "-")
        .replace(/…/g, "...")
        .replace(/[•·]/g, "-")
        .replace(/ /g, " ")
        .replace(/[^\x20-\x7E\n]/g, "");

/** Unicode path: keep the real glyphs, only normalise the invisible ones. */
const unicodeSafe = (s) =>
    String(s ?? "")
        .replace(/ /g, " ")   // NBSP — wraps wrong and is invisible in diffs
        .replace(/‑/g, "-")   // non-breaking hyphen
        .replace(/[​-‍﻿]/g, ""); // zero-width junk from Word

// ─────────────────────────────────────────────────────────────────────────────
//  Rich text
//
//  A block's `text` is either a plain string or an array of runs:
//      [{ t: "Dear " }, { t: "Mr. Soumya", b: true }, { t: "," }]
//  `b` = bold, `u` = underline. Anything else is ignored, deliberately: the
//  letters use exactly these two and a renderer that supports more would invite
//  formatting that the signed originals do not have.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise string | run | run[] to a run array. */
const toRuns = (rich) => {
    if (rich === null || rich === undefined) return [];
    if (typeof rich === "string") return [{ t: rich }];
    if (Array.isArray(rich)) return rich.filter(Boolean);
    return [rich];
};

/**
 * Split a run list on newlines into one run list per paragraph.
 * `S` is the sanitiser matching the font actually in use — see FONT_URLS.
 */
function splitParagraphs(runs, S) {
    const paras = [[]];
    for (const r of runs) {
        const pieces = S(r.t ?? "").split("\n");
        pieces.forEach((piece, i) => {
            if (i > 0) paras.push([]);
            if (piece) paras[paras.length - 1].push({ ...r, t: piece });
        });
    }
    return paras;
}

export function renderLetterPdf(blocks, opts = {}) {
    return build(blocks, opts);
}

async function build(blocks, opts) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    const pdf = await PDFDocument.create();

    // ── Fonts ───────────────────────────────────────────────────────────────
    // Verdana when it loads, Helvetica when it does not. `opts.fonts` lets a
    // caller hand the bytes over directly — the render tests run in Node, where
    // fetch("/fonts/…") has no origin to resolve against.
    let regular;
    let bold;
    let unicode = false;
    try {
        const fontkit = (await import("@pdf-lib/fontkit")).default;
        pdf.registerFontkit(fontkit);

        const grab = async (key) => {
            const given = opts.fonts?.[key];
            if (given) return given;
            const res = await fetch(FONT_URLS[key]);
            if (!res.ok) throw new Error(`${FONT_URLS[key]} → ${res.status}`);
            return new Uint8Array(await res.arrayBuffer());
        };
        const [r, b] = await Promise.all([grab("regular"), grab("bold")]);

        // subset: true is not optional — see the note by FONT_URLS. It also
        // keeps a seven-page letter at ~16 KB of font instead of ~280 KB.
        regular = await pdf.embedFont(r, { subset: true });
        bold = await pdf.embedFont(b, { subset: true });
        unicode = true;
    } catch (e) {
        // Never fatal. A letter in the wrong typeface is a cosmetic problem; a
        // Generate button that dies because a static asset 404'd is not.
        if (typeof console !== "undefined") {
            console.warn("[letterPdf] Verdana unavailable, falling back to Helvetica:", e?.message);
        }
        regular = await pdf.embedFont(StandardFonts.Helvetica);
        bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        unicode = false;
    }

    /** The sanitiser that matches the font actually in use. */
    const S = unicode ? unicodeSafe : ascii;

    const INK = rgb(0.09, 0.09, 0.11);
    const MUTED = rgb(0.42, 0.42, 0.46);
    const LINE = rgb(0.78, 0.78, 0.8);
    const RULE = rgb(0.35, 0.35, 0.38);

    // Lifted straight out of the signed letters: the Annexure I header row is
    // filled #95B3D7 in both Word files, and it is the ONLY filled row — the
    // rest of the table is white with a plain grid, exactly as in Word.
    const TH_FILL = rgb(0.584, 0.702, 0.843);   // #95B3D7 — header only
    const GRID = rgb(0.30, 0.32, 0.36);         // table rules
    const BRAND_RED = rgb(0.706, 0.161, 0.169); // the letterhead's crimson
    const FOOT_DARK = rgb(0.106, 0.114, 0.137); // the foot bar

    const embedImage = async (dataUri) => {
        const bytes = toPngBytes(dataUri);
        if (!bytes) return null;
        try {
            return imageMimeOf(dataUri) === "image/jpeg"
                ? await pdf.embedJpg(bytes)
                : await pdf.embedPng(bytes);
        } catch {
            return null;
        }
    };

    const logoImg = opts.logo === null ? null : await embedImage(opts.logo || COMPANY_LOGO_BASE64);
    const signImg = await embedImage(opts.signatureImage);

    // ── The pen ─────────────────────────────────────────────────────────────
    // `dry > 0` means we are measuring: nothing is drawn and nothing paginates,
    // so the caller can ask "how tall is this?" using the real layout code
    // rather than a second implementation that will drift from it.
    const ctx = { page: null, y: 0, first: true, dry: 0 };

    // The stationery is NOT drawn here — it goes on in the final pass, so that
    // every page gets it including ones added after this point, and so the
    // page count in the running header is known.
    const newPage = () => {
        if (ctx.dry) return;                    // measuring never paginates
        ctx.page = pdf.addPage([PAGE.w, PAGE.h]);
        ctx.y = TOP_Y;
        ctx.first = false;
    };

    const need = (h) => {
        if (ctx.dry) return;
        if (!ctx.page || ctx.y - h < BOT_Y) newPage();
    };

    const fontFor = (run, baseBold) => (run.b || baseBold ? bold : regular);

    /**
     * Break one paragraph of runs into drawn lines.
     * Each word carries its own font, so a bold word inside a plain sentence
     * is measured with the bold metrics and the line still fits.
     */
    function layoutParagraph(runs, size, width, baseBold) {
        const words = [];
        for (const r of runs) {
            for (const piece of String(r.t ?? "").split(/(\s+)/)) {
                if (!piece) continue;
                const f = fontFor(r, baseBold);
                words.push({
                    t: piece,
                    space: /^\s+$/.test(piece),
                    u: !!r.u,
                    f,
                    w: f.widthOfTextAtSize(piece, size),
                });
            }
        }

        const lines = [];
        let cur = [];
        let curW = 0;
        const flush = () => {
            while (cur.length && cur[cur.length - 1].space) {
                curW -= cur[cur.length - 1].w;
                cur.pop();
            }
            if (cur.length) lines.push({ items: cur, w: curW });
            cur = [];
            curW = 0;
        };

        for (const word of words) {
            if (word.space && cur.length === 0) continue;   // no leading space
            if (!word.space && curW + word.w > width && cur.length) flush();
            cur.push(word);
            curW += word.w;
        }
        flush();
        return lines;
    }

    /** Draw rich text. Advances ctx.y. */
    const text = (rich, o = {}) => {
        const size = o.size ?? 10.5;
        const gap = o.gap ?? 4;
        const indent = o.indent || 0;
        const width = W - indent - (o.rightPad || 0);
        const color = o.color || INK;

        for (const para of splitParagraphs(toRuns(rich), S)) {
            const lines = layoutParagraph(para, size, width, o.bold);
            if (!lines.length) { ctx.y -= size + gap; continue; }
            for (const line of lines) {
                need(size + gap);
                let x = M + indent + (o.center ? (width - line.w) / 2 : 0);
                for (const it of line.items) {
                    if (!ctx.dry && it.t.trim()) {
                        ctx.page.drawText(it.t, {
                            x, y: ctx.y - size, size, font: it.f, color,
                        });
                    }
                    if (!ctx.dry && (o.underline || it.u)) {
                        ctx.page.drawLine({
                            start: { x, y: ctx.y - size - 1.9 },
                            end: { x: x + it.w, y: ctx.y - size - 1.9 },
                            thickness: 0.6, color,
                        });
                    }
                    x += it.w;
                }
                ctx.y -= size + gap;
            }
        }
    };

    /**
     * How tall would these blocks be, drawn from here?
     * Runs the identical dispatch with the pen lifted, then rewinds.
     */
    const measureFn = (fn) => {
        const saved = { page: ctx.page, y: ctx.y, first: ctx.first };
        ctx.dry += 1;
        const y0 = ctx.y;
        fn();
        const h = y0 - ctx.y;
        ctx.dry -= 1;
        ctx.page = saved.page;
        ctx.y = saved.y;
        ctx.first = saved.first;
        return h;
    };
    const measure = (items) => measureFn(() => emitAll(items));

    // ── Block dispatch ──────────────────────────────────────────────────────
    function emit(b) {
        switch (b.t) {
            case "group": {
                // The whole point of this block: measure first, and if it will
                // not fit in what is left, start it on a fresh page instead of
                // letting it break. A group taller than a whole page has to
                // break somewhere, so it is allowed to flow.
                const h = measure(b.items || []);
                if (!ctx.dry && h <= USABLE && ctx.y - h < BOT_Y) newPage();
                emitAll(b.items || []);
                break;
            }

            case "space":
                ctx.y -= b.h ?? 8;
                break;

            case "pagebreak":
                // Only break if something has been written on this page. A
                // section that happened to end exactly at the page floor would
                // otherwise get a break onto a page it is already on, leaving a
                // completely empty sheet in the middle of the letter.
                if (!ctx.dry && (!ctx.page || ctx.y < TOP_Y)) newPage();
                break;

            case "rule":
                need(12);
                if (!ctx.dry) {
                    ctx.page.drawLine({
                        start: { x: M, y: ctx.y - 4 }, end: { x: M + W, y: ctx.y - 4 },
                        thickness: 0.6, color: LINE,
                    });
                }
                ctx.y -= 12;
                break;

            // h1/h2 carry the underline the signed letters use on every
            // section heading; h3 is the worker annexure's sub-heading, which
            // is bold only.
            case "h1":
                ctx.y -= 4;
                text(b.text, {
                    size: 13.5, bold: true, underline: true,
                    center: b.center !== false, gap: 5,
                });
                ctx.y -= 4;
                break;

            case "h2":
                ctx.y -= 8;
                text(b.text, { size: 11.5, bold: true, underline: true, gap: 5 });
                ctx.y -= 2;
                break;

            case "h3":
                ctx.y -= 6;
                text(b.text, { size: 10.5, bold: true, gap: 4 });
                break;

            case "p": {
                const o = {
                    size: b.size ?? 10.5,
                    bold: b.bold,
                    underline: b.underline,
                    center: b.center,
                    indent: b.indent,
                    gap: 4,
                };
                // Keep the paragraph whole. A clause that breaks mid-sentence
                // across the fold reads as a printing fault, and these are
                // contracts — so a paragraph that would split moves down
                // entire, as long as it can fit on a page at all.
                const h = measureFn(() => text(b.text, o));
                if (!ctx.dry && h <= USABLE && ctx.y - h < BOT_Y) newPage();
                text(b.text, o);
                ctx.y -= b.tight ? 0 : 5;
                break;
            }

            case "lines":
                for (const l of b.items || []) text(l, { size: 10.5, gap: 3, bold: b.bold });
                break;

            case "kv": {
                need(17);
                const label = S(b.label);
                const lw = Math.max(bold.widthOfTextAtSize(label, 10.5) + 10, 100);
                if (!ctx.dry) {
                    ctx.page.drawText(label, { x: M, y: ctx.y - 10.5, size: 10.5, font: regular, color: INK });
                    ctx.page.drawText(S(b.value), {
                        x: M + lw, y: ctx.y - 10.5, size: 10.5, font: bold, color: INK,
                    });
                }
                ctx.y -= 17;
                break;
            }

            // Both list cases reserve a full line BEFORE reading the cursor, so
            // the marker and the first line of text always land together.
            case "ul":
                for (const item of b.items || []) {
                    const o = { size: 10.5, indent: (b.indent || 0) + 18, gap: 4 };
                    const h = measureFn(() => text(item, o));
                    if (!ctx.dry && h <= USABLE && ctx.y - h < BOT_Y) newPage();
                    need(15);
                    if (!ctx.dry) {
                        ctx.page.drawText("-", {
                            x: M + (b.indent || 0) + 6, y: ctx.y - 10.5,
                            size: 10.5, font: regular, color: INK,
                        });
                    }
                    text(item, o);
                    ctx.y -= 2;
                }
                break;

            case "ol":
                (b.items || []).forEach((item, i) => {
                    const o = { size: 10.5, indent: 24, gap: 4 };
                    // Each numbered clause is kept whole for the same reason a
                    // paragraph is: clause 12 split over two pages looks wrong
                    // on a document someone signs.
                    const h = measureFn(() => text(item, o));
                    if (!ctx.dry && h <= USABLE && ctx.y - h < BOT_Y) newPage();
                    need(15);
                    if (!ctx.dry) {
                        ctx.page.drawText(`${i + 1}.`, {
                            x: M + 4, y: ctx.y - 10.5, size: 10.5, font: regular, color: INK,
                        });
                    }
                    text(item, o);
                    ctx.y -= 3;
                });
                break;

            /**
             * Blank ruled fields for the employee to actually sign on.
             * The first version printed the labels and nothing to write on;
             * this reserves real space above the rules as well, because a
             * signature needs room, not a caption.
             */
            case "sigfields": {
                const fields = b.items || [];
                need(46);
                ctx.y -= b.lead ?? 26;              // room to sign
                const gapX = 26;
                const total = fields.reduce((a, f) => a + (f.w || 150), 0) + gapX * (fields.length - 1);
                let x = M + (b.center ? Math.max(0, (W - total) / 2) : 0);
                for (const f of fields) {
                    const lw = f.w || 150;
                    const label = S(f.label || "");
                    const labelW = regular.widthOfTextAtSize(label, 10);
                    if (!ctx.dry) {
                        ctx.page.drawText(label, { x, y: ctx.y, size: 10, font: regular, color: INK });
                        ctx.page.drawLine({
                            start: { x: x + labelW + 6, y: ctx.y - 2 },
                            end: { x: x + lw, y: ctx.y - 2 },
                            thickness: 0.7, color: RULE,
                        });
                    }
                    x += lw + gapX;
                }
                ctx.y -= 18;
                break;
            }

            case "sign": {
                // Atomic: the company line, the mark and the name must not be
                // split across a fold.
                const h = measureFn(() => emitSign(b));
                if (!ctx.dry && h <= USABLE && ctx.y - h < BOT_Y) newPage();
                emitSign(b);
                break;
            }

            case "table":
                emitTable(b);
                break;

            default:
                if (b.text) text(b.text, { size: 10.5, gap: 4 });
                break;
        }
    }

    function emitSign(b) {
        if (b.company) {
            text([{ t: `For ${b.company},`, b: true }], { size: 10.5, gap: 4 });
            ctx.y -= 2;
        }
        if (signImg) {
            const h = 42;
            const w = Math.min((signImg.width / signImg.height) * h, 190);
            need(h + 4);
            if (!ctx.dry) {
                ctx.page.drawImage(signImg, { x: M, y: ctx.y - h, width: w, height: h });
            }
            ctx.y -= h + 4;
        } else {
            // No signature image: leave the same amount of blank paper so the
            // letter can be printed and signed by hand.
            ctx.y -= 46;
        }
        if (b.name) text([{ t: b.name, b: true }], { size: 10.5, gap: 3 });
        if (b.designation) text([{ t: b.designation, b: true }], { size: 10.5, gap: 3 });
    }

    /**
     * The Annexure I table, drawn to match the Word original cell for cell:
     *
     *   - one blue header row, both cells bold
     *   - ordinary rows split into a label column and a right-aligned amount
     *   - "EMPLOYEE DEDUCTIONS" / "EMPLOYER CONTRIBUTION" are MERGED across
     *     both columns and centred, with no fill and no column divider
     *   - one genuinely EMPTY row before EMPLOYER CONTRIBUTION
     *   - total / net / gross rows bold, on white
     *
     * The earlier version banded and zebra-striped it, which read as a
     * dashboard rather than as the annexure to a contract.
     */
    function emitTable(b) {
        const colR = 152;
        const colL = W - colR;
        const rowH = 18;

        const cell = (t, x, yy, f, size, align, wid) => {
            if (ctx.dry) return;
            const s = S(t);
            const tw = f.widthOfTextAtSize(s, size);
            const tx =
                align === "right" ? x + wid - tw - 8
                    : align === "center" ? x + (wid - tw) / 2
                        : x + 8;
            ctx.page.drawText(s, { x: tx, y: yy + 5.5, size, font: f, color: INK });
        };
        const hline = (yy) => {
            if (ctx.dry) return;
            ctx.page.drawLine({
                start: { x: M, y: yy }, end: { x: M + W, y: yy },
                thickness: 0.7, color: GRID,
            });
        };
        const vline = (x, top) => {
            if (ctx.dry) return;
            ctx.page.drawLine({
                start: { x, y: top }, end: { x, y: top + rowH },
                thickness: 0.7, color: GRID,
            });
        };

        const header = () => {
            need(rowH + 2);
            const top = ctx.y - rowH;
            if (!ctx.dry) {
                ctx.page.drawRectangle({ x: M, y: top, width: W, height: rowH, color: TH_FILL });
            }
            hline(top + rowH);                       // the table's top edge
            cell(b.head?.[0] || "Component", M, top, bold, 10, "left", colL);
            cell(b.head?.[1] || "Amount", M + colL, top, bold, 10, "left", colR);
            vline(M, top); vline(M + colL, top); vline(M + W, top);
            hline(top);
            ctx.y = top;
        };

        header();
        for (const r of b.rows || []) {
            // A table continuing onto a new page repeats its header — a column
            // of bare numbers under nothing is unreadable.
            if (!ctx.dry && ctx.y - rowH < BOT_Y) { newPage(); header(); }
            const top = ctx.y - rowH;

            if (r.band) {
                // Merged across the full width: no centre divider.
                cell(r.band, M, top, bold, 10, "center", W);
                vline(M, top); vline(M + W, top);
            } else if (r.empty) {
                vline(M, top); vline(M + colL, top); vline(M + W, top);
            } else {
                const f = r.strong ? bold : regular;
                cell(r.label ?? "", M, top, f, 10, "left", colL);
                cell(
                    r.amount === undefined || r.amount === null ? "" : String(r.amount),
                    M + colL, top, f, 10, "right", colR,
                );
                vline(M, top); vline(M + colL, top); vline(M + W, top);
            }
            hline(top);
            ctx.y = top;
        }

        ctx.y -= 10;
    }

    function emitAll(items) {
        for (const b of items || []) emit(b);
    }

    // ── Flow ────────────────────────────────────────────────────────────────
    newPage();
    emitAll(blocks);

    // ── The closing letterhead page ─────────────────────────────────────────
    // OFF BY DEFAULT. A blank sheet of stationery at the end of a contract just
    // reads as a page that failed to print — the letterhead is already on every
    // page, which is what "the letterhead is on the document" actually needs to
    // mean. Pass `closingPage: true` to get one back.
    const closingPage = opts.closingPage === true ? pdf.addPage([PAGE.w, PAGE.h]) : null;
    if (closingPage && logoImg) {
        // The watermark is the brand mark at very low opacity. pdf-lib applies
        // `opacity` to images through an ExtGState, so this is a real alpha and
        // not a pale copy of the artwork.
        const wm = Math.min(W, 360);
        const wh = (logoImg.height / logoImg.width) * wm;
        closingPage.drawImage(logoImg, {
            x: (PAGE.w - wm) / 2,
            y: (PAGE.h - wh) / 2,
            width: wm,
            height: wh,
            opacity: 0.055,
        });
    }

    // ── Second pass: the letterhead, on every page ──────────────────────────
    const head = { ...LETTERHEAD, ...(opts.letterhead || {}) };
    const pages = pdf.getPages();
    const label = S(opts.headerLabel || "");

    pages.forEach((p, i) => {
        // Red rule, top left.
        p.drawRectangle({ x: 0, y: PAGE.h - 14, width: 302, height: 14, color: BRAND_RED });

        // The mark, top right — on EVERY page, not just the first.
        if (logoImg) {
            const h = 46;
            const w = (logoImg.width / logoImg.height) * h;
            p.drawImage(logoImg, { x: PAGE.w - 44 - w, y: PAGE.h - 34 - h, width: w, height: h });
        }

        // The running header moves to the LEFT: the logo now owns the right.
        if (label) {
            p.drawText(`${label} | Page ${i + 1} of ${pages.length}`, {
                x: M, y: PAGE.h - 52, size: 8.5, font: regular, color: MUTED,
            });
        }

        // Foot: hairline, address block, contact line, dark bar with a red end.
        p.drawLine({
            start: { x: M, y: 118 }, end: { x: PAGE.w - M, y: 118 },
            thickness: 0.8, color: LINE,
        });
        let fy = 100;
        for (const line of head.addressLines || []) {
            const s = S(line);
            p.drawText(s, {
                x: (PAGE.w - bold.widthOfTextAtSize(s, 8.5)) / 2,
                y: fy, size: 8.5, font: bold, color: INK,
            });
            fy -= 12;
        }
        if (head.contact) {
            const s = S(head.contact);
            p.drawText(s, {
                x: (PAGE.w - bold.widthOfTextAtSize(s, 8.5)) / 2,
                y: fy - 6, size: 8.5, font: bold, color: INK,
            });
        }
        p.drawRectangle({ x: 0, y: 0, width: PAGE.w - 96, height: 30, color: FOOT_DARK });
        p.drawRectangle({ x: PAGE.w - 96, y: 0, width: 96, height: 30, color: BRAND_RED });
    });

    const bytes = await pdf.save();
    // Copy into a fresh ArrayBuffer: pdf-lib returns a Uint8Array over a larger
    // pooled buffer, and handing that straight to Blob can carry trailing bytes.
    return new Blob([bytes.slice()], { type: "application/pdf" });
}
