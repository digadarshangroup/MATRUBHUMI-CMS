package com.matrubhoomi.field.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sinh
import kotlin.math.tan

/**
 * A real map — streets or satellite — that pans and zooms, with no mapping
 * library and no API key.
 *
 * THE TILE PROVIDERS, AND WHY THESE TWO
 * -------------------------------------
 * This started on OpenStreetMap's own tile server. That server is run on
 * donated capacity for the project's own use; it has no CDN in front of it for
 * most of the world, it rate-limits, and it looks it — which is exactly the
 * "slow and not accurate" it was. It is a courtesy, not a service.
 *
 *   STREETS   Carto Voyager. The same OSM data, rendered by Carto and served
 *             from a real CDN, at @2x for a phone screen. Fast, current, and
 *             free for this kind of use.
 *   SATELLITE Esri World Imagery. Keyless, global, and in India considerably
 *             sharper than anything else available without a contract — which
 *             matters here, because a field employee recognises a farm from the
 *             air long before they recognise it from a street name.
 *
 * Neither needs a key or a billing account. Both REQUIRE their attribution, and
 * it is drawn in the corner for whichever is showing; removing it breaks the
 * terms both are given under.
 *
 * Point TILE overrides at your own provider if this ever outgrows them.
 */

/**
 * One set of tiles. A layer is a base plus however many transparent sheets go
 * on top of it.
 */
data class TileSource(val template: String, val maxZoom: Float)

enum class MapLayer(
    val label: String,
    val base: TileSource,
    /** Transparent sheets, drawn in order over the base. */
    val overlays: List<TileSource>,
    val maxZoom: Float,
    val attribution: String,
) {
    Streets(
        label = "Map",
        // @2x tiles: on a 3x-density phone a 256px tile is a blurry stamp.
        base = TileSource("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png", 20f),
        overlays = emptyList(),   // this one already carries its own labels
        maxZoom = 20f,
        attribution = "© OpenStreetMap © CARTO",
    ),
    Satellite(
        label = "Satellite",
        // Note the {y}/{x} ORDER — Esri's REST tile service is row/column, not
        // column/row like every XYZ server. Swapping them silently returns
        // tiles from the wrong hemisphere rather than an error.
        base = TileSource(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            19f,
        ),
        // WHY THE SATELLITE VIEW NEEDS A SECOND SHEET
        // -------------------------------------------
        // Esri's imagery is PHOTOGRAPHY. There is nothing written on it — no
        // country, no state, no city, no road name — so a route drawn on it is
        // a green line on a green field and the person reading it cannot say
        // where it is without recognising the rooftops.
        //
        // This is the standard fix and the reason every satellite map you have
        // ever used is really two layers: a transparent sheet of labels sits on
        // top. Carto's is the one used here because it is the same cartography
        // as the Map layer, it is retina, and it goes to zoom 20 — so the
        // labels never run out before the imagery does.
        //
        // WHAT IT DOES NOT CARRY, honestly: individual businesses. Shop, hotel
        // and restaurant names come from OpenStreetMap's own POI data, which is
        // thin across most of India, and no keyless provider serves them as an
        // overlay. That density is what a Google or Mapbox key buys.
        //
        // NOT @2x, deliberately, and this is a memory decision rather than a
        // visual one. A 512px tile decodes to a megabyte; a 256px tile to a
        // quarter of that. With two sheets at @2x a single screenful wanted
        // ~100MB, far past any budget this app can hold, so the cache evicted
        // tiles it was still drawing and the map wore a grey border that moved
        // as you panned. The base imagery is 256px anyway, so the labels now
        // match it exactly rather than being downsampled into it.
        overlays = listOf(
            TileSource("https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png", 20f),
        ),
        maxZoom = 19f,
        attribution = "Esri, Maxar · labels © OpenStreetMap © CARTO",
    ),
    ;

    /** Base first, then each sheet in the order it is drawn. */
    val sources: List<TileSource> get() = listOf(base) + overlays
}

private const val TILE_SIZE = 256
private const val MIN_ZOOM = 2f

data class MapPoint(val lat: Double, val lng: Double)

data class MapMarker(val point: MapPoint, val label: String = "", val isPrimary: Boolean = true)

/* ── Web mercator ──────────────────────────────────────────────────── */

private fun lngToWorldX(lng: Double, zoom: Float): Double =
    (lng + 180.0) / 360.0 * TILE_SIZE * 2.0.pow(zoom.toDouble())

private fun latToWorldY(lat: Double, zoom: Float): Double {
    val rad = lat * PI / 180.0
    return (1.0 - ln(tan(rad) + 1.0 / cos(rad)) / PI) / 2.0 * TILE_SIZE * 2.0.pow(zoom.toDouble())
}

private fun worldXToLng(x: Double, zoom: Float): Double =
    x / (TILE_SIZE * 2.0.pow(zoom.toDouble())) * 360.0 - 180.0

private fun worldYToLat(y: Double, zoom: Float): Double {
    val n = PI - 2.0 * PI * y / (TILE_SIZE * 2.0.pow(zoom.toDouble()))
    return 180.0 / PI * atan(sinh(n))
}

private fun metresPerPixel(lat: Double, zoom: Float): Double =
    156543.03392 * cos(lat * PI / 180.0) / 2.0.pow(zoom.toDouble())

/* ── Tiles ─────────────────────────────────────────────────────────── */

private var tileClientRef: OkHttpClient? = null

/**
 * The tile client, with a DISK cache.
 *
 * Without it every pan re-downloaded tiles the phone had already seen minutes
 * earlier, and reopening the screen started from nothing — on a field
 * connection that is both slow and somebody's data allowance. Tile servers send
 * long cache lifetimes, so OkHttp can serve almost all of this from disk once a
 * village has been looked at once.
 *
 * 60MB is roughly a district at street zoom. It is in `cacheDir`, so Android
 * reclaims it under storage pressure rather than the app growing without bound.
 */
private fun tileClient(context: android.content.Context): OkHttpClient =
    tileClientRef ?: synchronized(MapLayer::class) {
        tileClientRef ?: OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .cache(okhttp3.Cache(java.io.File(context.cacheDir, "tiles"), 60L * 1024 * 1024))
            // A real connection pool: a map view opens twenty tile requests at
            // once and the default five-per-host limit serialises them into
            // four rounds of latency, which is most of what "slow" was.
            .dispatcher(okhttp3.Dispatcher().apply { maxRequestsPerHost = 12 })
            .build()
            .also { tileClientRef = it }
    }

/**
 * Fetch one tile, with ONE retry.
 *
 * The previous version recorded a failed tile in a `failed` set and never asked
 * for it again for the life of the screen. Esri's imagery service drops the odd
 * request under load, so a single hiccup left a permanent grey square in the
 * middle of the satellite view — which is exactly "satellite sometimes isn't
 * loading". A transient failure now costs a retry, and if that fails the tile
 * is simply absent and will be asked for again the next time it is on screen.
 */
private suspend fun loadTile(
    context: android.content.Context,
    source: TileSource,
    z: Int,
    x: Int,
    y: Int,
): ImageBitmap? = withContext(Dispatchers.IO) {
    val url = source.template
        .replace("{z}", "$z").replace("{x}", "$x").replace("{y}", "$y")

    repeat(2) { attempt ->
        val bitmap = runCatching {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MatrubhoomiField/1.0 (internal company app)")
                .build()
            tileClient(context).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@runCatching null
                val bytes = response.body?.bytes() ?: return@runCatching null
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        }.getOrNull()

        if (bitmap != null) return@withContext bitmap
        if (attempt == 0) kotlinx.coroutines.delay(400)
    }
    null
}

/**
 * @param path      the route to draw, in order.
 * @param markers   pins on top of it.
 * @param follow    re-centre on the path as it grows — until the user moves the
 *                  map, after which it stops fighting them.
 */
@Composable
fun TileMap(
    path: List<MapPoint>,
    modifier: Modifier = Modifier,
    markers: List<MapMarker> = emptyList(),
    follow: Boolean = true,
    lineColor: Color = MaterialTheme.colorScheme.primary,
    emptyMessage: String = "Nothing to show yet.",
    /**
     * Tapping the map opens it full screen.
     *
     * Worth having even with the gesture fix above: a 300dp window inside a
     * scrolling page is a keyhole, and reading a day's route through it means
     * fighting for every pixel. Full screen has no parent to compete with at
     * all.
     */
    onExpand: (() -> Unit)? = null,
    /**
     * Whether this map handles pan and zoom itself.
     *
     * FALSE for the preview inside a scrolling page, and that is not a
     * limitation being papered over — it is the honest resolution of a
     * conflict. A map and a scrolling list both want a vertical drag, and
     * whichever wins, the other is broken: consume the drag and the page cannot
     * be scrolled past the map; leave it and the map cannot be panned. On a
     * 300dp preview the page has the better claim.
     *
     * So the preview is a picture that opens the real thing, and the real thing
     * is full screen with nothing to compete with. One tap, and every gesture
     * works the way it should.
     */
    interactive: Boolean = true,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val tiles = remember { mutableStateMapOf<String, ImageBitmap>() }

    /*
     * THE CACHE IS BOUNDED IN BYTES, NOT IN TILES.
     *
     * It used to hold "up to 320 tiles". A Carto @2x tile is 512x512 at 4 bytes
     * a pixel — one megabyte each — so that ceiling was around 320MB of
     * bitmaps, several times a normal app heap. The result was not an
     * out-of-memory crash with a stack trace: Android's low-memory killer
     * simply took the process, and the app vanished with nothing in the log
     * except `min watermark is breached`. From the outside it looked like the
     * app "stopped showing" after using the map for a while.
     *
     * A sixth of the heap, clamped, is enough for a screen of tiles several
     * times over while leaving room for everything else the app is doing.
     */
    //
    // SCALED BY HOW MANY SHEETS THE LAYER DRAWS. A screenful is about eighteen
    // tiles; at @2x each decodes to a megabyte, so a single-sheet layer needs
    // ~18MB and the two-sheet satellite needs ~36MB for the SAME view. Left at
    // the old flat ceiling the satellite evicted tiles it was still drawing and
    // the map flickered while standing still.
    var cachedBytes by remember { mutableStateOf(0L) }
    // key -> attempts. A count, not a blacklist. See loadTile().
    val failed = remember { mutableStateMapOf<String, Int>() }

    var layer by remember { mutableStateOf(MapLayer.Streets) }

    val tileBudgetBytes = remember(layer) {
        // A screenful is roughly fifty tiles on a tall phone. At 256px each
        // decodes to 256KB, so one sheet needs ~13MB and two need ~26MB — and
        // the budget has to hold rather more than one screenful or a pan
        // evicts what is about to be needed again.
        val sheets = layer.sources.size.coerceAtLeast(1)
        (Runtime.getRuntime().maxMemory() / 5)
            .coerceIn(24L * 1024 * 1024 * sheets, 48L * 1024 * 1024 * sheets)
    }

    var centre by remember { mutableStateOf<MapPoint?>(null) }
    var zoom by remember { mutableStateOf(15f) }
    var userMoved by remember { mutableStateOf(false) }

    val all = remember(path, markers) { path + markers.map { it.point } }

    BoxWithConstraints(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }

        fun fitToContent() {
            if (all.isEmpty() || widthPx <= 0f) return
            val minLat = all.minOf { it.lat }
            val maxLat = all.maxOf { it.lat }
            val minLng = all.minOf { it.lng }
            val maxLng = all.maxOf { it.lng }
            centre = MapPoint((minLat + maxLat) / 2, (minLng + maxLng) / 2)

            if (all.size == 1) { zoom = 17f; return }

            var best = MIN_ZOOM
            var z = layer.maxZoom
            while (z >= MIN_ZOOM) {
                val w = lngToWorldX(maxLng, z) - lngToWorldX(minLng, z)
                val h = latToWorldY(minLat, z) - latToWorldY(maxLat, z)
                if (w <= widthPx * 0.85 && h <= heightPx * 0.85) { best = z; break }
                z -= 0.5f
            }
            zoom = best
        }

        LaunchedEffect(all.size, widthPx, heightPx) {
            if (userMoved && centre != null) return@LaunchedEffect
            if (!follow && centre != null) return@LaunchedEffect
            fitToContent()
        }

        val currentCentre = centre

        if (currentCentre == null) {
            Text(
                emptyMessage,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )
            return@BoxWithConstraints
        }

        val centreX = lngToWorldX(currentCentre.lng, zoom)
        val centreY = latToWorldY(currentCentre.lat, zoom)

        fun toScreen(p: MapPoint) = Offset(
            (lngToWorldX(p.lng, zoom) - centreX + widthPx / 2).toFloat(),
            (latToWorldY(p.lat, zoom) - centreY + heightPx / 2).toFloat(),
        )

        /**
         * Move and scale the view so that whatever was under `anchor` stays
         * under `anchor`.
         *
         * This is the whole of "pan and zoom feeling right". Zooming about the
         * CENTRE — which is what it did before — means reaching a corner is an
         * alternating sequence of zooms and drags, and a pinch appears to shove
         * the map sideways because the point between your fingers is not the
         * point the map grew from.
         */
        fun apply(anchor: Offset, pan: Offset, scaleBy: Float) {
            val current = centre ?: return
            val oldZoom = zoom

            /*
             * THE ORIGIN IS RECOMPUTED HERE, FROM CURRENT STATE.
             *
             * It used to close over `centreX` / `centreY`, which are computed
             * during COMPOSITION. Pointer events arrive far faster than
             * recomposition — a drag delivers dozens between frames — so every
             * event after the first recalculated from a stale origin and threw
             * the map somewhere it had already moved away from. That is the
             * jumping, and it got worse with two fingers because a pinch
             * delivers more events per frame than a drag.
             *
             * Reading `centre` and `zoom` here reads the values the PREVIOUS
             * event wrote, because a snapshot write is visible to the next read
             * on the same thread. Every event now builds on the last one.
             */
            val curCentreX = lngToWorldX(current.lng, oldZoom)
            val curCentreY = latToWorldY(current.lat, oldZoom)

            // A single event should never scale by more than a factor of two.
            // A stray reading when a second finger lands can otherwise report
            // an enormous ratio and teleport the map to street level or to the
            // whole planet in one frame.
            val safeScale = scaleBy.coerceIn(0.5f, 2f)
            val newZoom = (oldZoom + ln(safeScale.toDouble()).toFloat() / ln(2f))
                .coerceIn(MIN_ZOOM, layer.maxZoom)

            // 1. Pan, in world pixels at the OLD zoom: the map follows the
            //    finger, so the centre moves against it.
            val pannedX = curCentreX - pan.x
            val pannedY = curCentreY - pan.y

            // 2. The world point under the anchor once the pan has happened.
            val anchorLng = worldXToLng(pannedX + (anchor.x - widthPx / 2), oldZoom)
            val anchorLat = worldYToLat(pannedY + (anchor.y - heightPx / 2), oldZoom)

            // 3. Scale about THAT point, so whatever is between the fingers
            //    stays between the fingers.
            val newCentreX = lngToWorldX(anchorLng, newZoom) - (anchor.x - widthPx / 2)
            val newCentreY = latToWorldY(anchorLat, newZoom) - (anchor.y - heightPx / 2)

            zoom = newZoom
            centre = MapPoint(
                worldYToLat(newCentreY, newZoom).coerceIn(-85.0, 85.0),
                worldXToLng(newCentreX, newZoom).coerceIn(-180.0, 180.0),
            )
            userMoved = true
        }

        fun zoomBy(steps: Float) {
            apply(Offset(widthPx / 2, heightPx / 2), Offset.Zero, 2f.pow(steps))
        }

        // Which tiles cover the box.
        val zi = floor(zoom).toInt().coerceIn(MIN_ZOOM.toInt(), layer.maxZoom.toInt())
        val fraction = 2.0.pow((zoom - zi).toDouble())
        val tilePx = (TILE_SIZE * fraction).toFloat()
        val originX = centreX / fraction - widthPx / 2 / fraction
        val originY = centreY / fraction - heightPx / 2 / fraction
        val maxIndex = 1 shl zi

        val visible = remember(zi, originX, originY, widthPx, heightPx, layer) {
            val list = mutableListOf<Triple<Int, Int, Int>>()
            val x0 = floor(originX / TILE_SIZE).toInt()
            val y0 = floor(originY / TILE_SIZE).toInt()
            val x1 = floor((originX + widthPx / fraction) / TILE_SIZE).toInt()
            val y1 = floor((originY + heightPx / fraction) / TILE_SIZE).toInt()
            for (x in x0..x1) for (y in y0..y1) {
                if (y < 0 || y >= maxIndex) continue
                list.add(Triple(zi, ((x % maxIndex) + maxIndex) % maxIndex, y))
            }
            list
        }

        LaunchedEffect(visible, layer) {
            // EVERY SHEET, BASE FIRST. The base is fetched before the labels
            // that sit on it, so a slow labels server shows an unlabelled map
            // rather than an empty one — the imagery is the part that cannot be
            // done without.
            layer.sources.forEachIndexed { sheet, source ->
                visible.forEach inner@{ (z, x, y) ->
                    // A sheet whose own zoom has run out simply stops drawing.
                    // Asking for a tile past a service's maximum returns a 4xx
                    // on every frame for as long as the view is held there.
                    if (z > source.maxZoom.toInt()) return@inner

                    val key = "${layer.name}/$sheet/$z/$x/$y"
                    if (tiles.containsKey(key)) return@inner

                    // Tried too many times this session — stop asking on every
                    // frame, but do NOT blacklist: the next time this tile comes
                    // into view the counter is what limits it, not a permanent flag.
                    if ((failed[key] ?: 0) >= 3) return@inner

                    val bitmap = loadTile(context, source, z, x, y)
                if (bitmap != null) {
                    failed.remove(key)

                    // Evict the OLDEST until this one fits. Oldest rather than
                    // "clear everything", because clearing made a long pan
                    // flash the whole view back to bare grid; and by bytes
                    // rather than by count, for the reason above.
                    val cost = bitmap.width.toLong() * bitmap.height.toLong() * 4L

                    // OFF-SCREEN FIRST, THEN OLDEST.
                    //
                    // Plain oldest-first is wrong once a layer has two sheets.
                    // A base tile is always inserted before the label tile that
                    // sits on it, so "oldest" means the imagery goes and its
                    // labels stay — leaving names floating over bare grid. So
                    // eviction prefers anything not currently on screen, and
                    // only falls back to the oldest when everything is.
                    val onScreen = visible.mapTo(HashSet()) { (z, x, y) -> "$z/$x/$y" }
                    while (cachedBytes + cost > tileBudgetBytes && tiles.isNotEmpty()) {
                        val victim = tiles.keys.firstOrNull { held ->
                            held.substringAfter('/').substringAfter('/') !in onScreen
                        } ?: tiles.keys.first()
                        tiles.remove(victim)?.let {
                            cachedBytes -= it.width.toLong() * it.height.toLong() * 4L
                        }
                    }

                    tiles[key] = bitmap
                    cachedBytes += cost
                } else {
                    failed[key] = (failed[key] ?: 0) + 1
                }
                }
            }
        }

        Canvas(
            Modifier
                .fillMaxSize()
                .then(
                    if (!interactive) {
                        // A preview: one tap opens it full screen, and nothing
                        // else is claimed, so the page scrolls normally.
                        Modifier.pointerInput(Unit) {
                            detectTapGestures(onTap = { onExpand?.invoke() })
                        }
                    } else Modifier,
                )
                .pointerInput(layer, interactive) {
                    if (!interactive) return@pointerInput
                    /*
                     * WHY THIS IS A HAND-WRITTEN GESTURE LOOP AND NOT
                     * detectTransformGestures
                     * ------------------------------------------------
                     * This map lives inside a LazyColumn. detectTransformGestures
                     * waits for touch slop before it reports anything and only
                     * consumes after that — and in those few milliseconds the
                     * LazyColumn has already claimed the drag and started
                     * scrolling. The result on a real phone: pinch worked,
                     * dragging did nothing, and the page scrolled instead.
                     *
                     * So this consumes from the FIRST movement, before any
                     * ancestor gets a chance. A child sees the Main pass before
                     * its parents, so consuming here is what settles the
                     * competition — the map wins the gesture the moment a
                     * finger moves on it, and the list keeps everything that
                     * starts anywhere else.
                     */
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        do {
                            val event = awaitPointerEvent()
                            val cancelled = event.changes.any { it.isConsumed }
                            if (cancelled) break

                            val down = event.changes.count { it.pressed }
                            // calculateZoom() is only meaningful with two
                            // fingers down. With one it returns noise around
                            // 1.0, and feeding that in made a plain drag
                            // creep in and out of zoom as it went.
                            val zoomChange = if (down >= 2) event.calculateZoom() else 1f
                            val panChange = event.calculatePan()

                            if (panChange != Offset.Zero || zoomChange != 1f) {
                                val centroid = event.calculateCentroid(useCurrent = false)
                                apply(
                                    if (centroid == Offset.Unspecified) Offset(size.width / 2f, size.height / 2f)
                                    else centroid,
                                    panChange,
                                    zoomChange,
                                )
                                event.changes.forEach { it.consume() }
                            }
                        } while (event.changes.any { it.pressed })
                    }
                }
                .pointerInput(layer, interactive) {
                    if (!interactive) return@pointerInput
                    detectTapGestures(
                        // Double-tap to zoom in at the point tapped — the
                        // gesture everybody already knows from every map.
                        onDoubleTap = { at -> apply(at, Offset.Zero, 2f) },
                        onTap = { onExpand?.invoke() },
                    )
                },
        ) {
            drawGrid()

            // Base first, then each sheet over it. The order is the whole
            // point: labels drawn under the photograph would be invisible.
            layer.sources.indices.forEach { sheet ->
                visible.forEach { (z, x, y) ->
                    // A LABEL IS NEVER DRAWN WITHOUT ITS GROUND.
                    //
                    // Label tiles are a few kilobytes and imagery tiles are
                    // hundreds, so after a zoom the names arrive first — and
                    // for a second the screen showed place names floating over
                    // bare grid, which reads as a broken map rather than a
                    // loading one. An overlay waits for the base under it.
                    if (sheet > 0 && !tiles.containsKey("${layer.name}/0/$z/$x/$y")) return@forEach

                    val bitmap = tiles["${layer.name}/$sheet/$z/$x/$y"] ?: return@forEach
                    val left = (x * TILE_SIZE - originX) * fraction
                    val top = (y * TILE_SIZE - originY) * fraction
                    drawImage(
                        image = bitmap,
                        dstOffset = IntOffset(left.toInt(), top.toInt()),
                        // +1 so neighbouring tiles never show a hairline of ground
                        // between them at fractional zooms.
                        dstSize = IntSize(tilePx.toInt() + 1, tilePx.toInt() + 1),
                    )
                }
            }

            if (path.size >= 2) {
                val line = Path()
                path.forEachIndexed { i, p ->
                    val o = toScreen(p)
                    if (i == 0) line.moveTo(o.x, o.y) else line.lineTo(o.x, o.y)
                }
                // On satellite the casing has to be darker, not lighter — a
                // white line on a bright field is invisible.
                val casing = if (layer == MapLayer.Satellite) Color.Black.copy(alpha = 0.55f)
                else Color.White.copy(alpha = 0.9f)
                drawPath(line, casing, style = Stroke(width = 14f, cap = StrokeCap.Round))
                drawPath(line, lineColor, style = Stroke(width = 7f, cap = StrokeCap.Round))

                val start = toScreen(path.first())
                drawCircle(Color.White, radius = 11f, center = start)
                drawCircle(lineColor.copy(alpha = 0.7f), radius = 11f, center = start, style = Stroke(width = 4f))

                val end = toScreen(path.last())
                drawCircle(Color.White, radius = 15f, center = end)
                drawCircle(lineColor, radius = 11f, center = end)
            }

            markers.forEach { marker ->
                val o = toScreen(marker.point)
                val tone = if (marker.isPrimary) lineColor else Color(0xFF2C7DA0)
                drawCircle(tone.copy(alpha = 0.22f), radius = 22f, center = o)
                drawCircle(Color.White, radius = 13f, center = o)
                drawCircle(tone, radius = 9f, center = o)
            }
        }

        /* ── Controls ──────────────────────────────────────────────── */

        if (interactive) Column(
            Modifier.align(Alignment.TopEnd).padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            MapButton(Icons.Default.Layers, "Switch to ${if (layer == MapLayer.Streets) "satellite" else "map"}") {
                // Release the layer being left. Holding both doubles the
                // working set for tiles that are no longer on screen, and the
                // disk cache means coming back costs no network anyway.
                val leaving = layer.name
                tiles.keys.filter { it.startsWith("$leaving/") }.forEach { key ->
                    tiles.remove(key)?.let { cachedBytes -= it.width.toLong() * it.height.toLong() * 4L }
                }
                layer = if (layer == MapLayer.Streets) MapLayer.Satellite else MapLayer.Streets
                // The new layer may not go as deep as the old one.
                zoom = zoom.coerceAtMost(
                    if (layer == MapLayer.Streets) MapLayer.Streets.maxZoom else MapLayer.Satellite.maxZoom,
                )
            }
            MapButton(Icons.Default.Add, "Zoom in") { zoomBy(1f) }
            MapButton(Icons.Default.Remove, "Zoom out") { zoomBy(-1f) }
            if (userMoved) {
                MapButton(Icons.Default.MyLocation, "Fit to route") {
                    userMoved = false
                    fitToContent()
                }
            }
        }

        val mpp = metresPerPixel(currentCentre.lat, zoom)
        val metres = listOf(10, 20, 50, 100, 200, 500, 1000, 2000, 5000)
            .firstOrNull { it / mpp in 50.0..170.0 } ?: 100
        val barWidth = with(density) { (metres / mpp).toFloat().toDp() }

        Row(
            Modifier
                .align(Alignment.BottomStart)
                .padding(8.dp)
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.88f), RoundedCornerShape(6.dp))
                .padding(horizontal = 6.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .width(if (barWidth < 40.dp) 40.dp else barWidth)
                    .height(3.dp)
                    .background(MaterialTheme.colorScheme.onSurfaceVariant),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                if (metres >= 1000) "${metres / 1000} km" else "$metres m",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        /*
         * Attribution, behind an ⓘ.
         *
         * It cannot simply be deleted: Carto and Esri both supply these tiles
         * free on condition the credit is shown, and the Carto line naming
         * OpenStreetMap is the DATA credit, not the tile server — which is
         * what made it look like the provider had never changed.
         *
         * What it does not have to be is a caption printed across the corner of
         * a small screen. Every mapping app resolves this the same way — a
         * discreet mark that shows the credit when touched — so the credit is
         * always reachable and never in the way.
         */
        var showCredit by remember { mutableStateOf(false) }

        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .padding(6.dp)
                .pointerInput(Unit) { detectTapGestures { showCredit = !showCredit } },
        ) {
            if (showCredit) {
                Text(
                    layer.attribution,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .background(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                            RoundedCornerShape(6.dp),
                        )
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                )
            } else {
                Box(
                    Modifier
                        .size(18.dp)
                        .background(
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.75f),
                            RoundedCornerShape(999.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "i",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun MapButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
        shadowElevation = 2.dp,
        modifier = Modifier.size(40.dp),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures(onTap = { onClick() }) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = description, modifier = Modifier.size(20.dp))
        }
    }
}

/** The ruled ground under the tiles — what shows where one has not arrived. */
private fun DrawScope.drawGrid() {
    val step = 96f
    val colour = Color(0x14101820)
    var x = 0f
    while (x < size.width) {
        drawLine(colour, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1f)
        x += step
    }
    var y = 0f
    while (y < size.height) {
        drawLine(colour, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
        y += step
    }
}
