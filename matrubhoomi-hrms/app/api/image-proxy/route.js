// app/api/image-proxy/route.js
//
// Re-serves a reference image from this server, same-origin, so a client-side
// fetch() can actually read its bytes.
//
// Built specifically for CostingPDFGenerator.js's product photo (20 Aug 2026,
// "on that generated pdf, the image is not occurring"). The browser CAN load
// these images fine in a plain <img> (DriveImage already does, with
// referrerPolicy="no-referrer" — see lib/driveImage.js's own header comment
// on why lh3.googleusercontent.com needs that). What it can't do is fetch()
// them cross-origin and read the bytes back into a data: URI the way the PDF
// generator needs to: lh3 (and Cloudinary, for older uploads) don't send
// Access-Control-Allow-Origin, so the browser blocks the read even though the
// request itself succeeds — an <img> tag never needs to read the response
// body, only fetch() does, so this failure is invisible everywhere else in
// the app. Routing the same request through our own server sidesteps it
// entirely: server-to-server fetches aren't CORS-gated, and Node's fetch
// doesn't send a browser Referer header at all, so lh3's referrer check never
// even triggers here.
//
// Host-allowlisted on purpose — this must never become an open image proxy
// for arbitrary URLs.

const ALLOWED_HOSTS = new Set(["lh3.googleusercontent.com", "res.cloudinary.com"]);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const src = searchParams.get("url");
  if (!src) return new Response("Missing url", { status: 400 });

  let target;
  try {
    target = new URL(src);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString());
    if (!upstream.ok) return new Response("Upstream image fetch failed", { status: 502 });
    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (err) {
    console.error("[image-proxy] fetch failed:", err);
    return new Response("Could not fetch the image", { status: 502 });
  }
}
