package com.gicera

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

/**
 * The ingredient scanner's photo geometry, on the device (no library, no network):
 *  - size(): a JPEG's size as ML Kit reads it (EXIF orientation applied), whatever way the phone was held;
 *  - crop(): a region of the photo, given in those same upright coordinates, saved at full resolution
 *    for a second, closer OCR pass. Only the region is decoded (BitmapRegionDecoder), then turned upright;
 *  - glare(): how much of a text region is washed out by a reflection (live scanner hint).
 */
class ImageCropModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ImageCrop"

  private fun plain(path: String) = path.removePrefix("file://")

  /** Degrees the stored pixels are turned by clockwise to stand upright (EXIF). */
  private fun rotation(path: String): Int =
    when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }

  private fun rawSize(path: String): Pair<Int, Int> {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, options)
    return Pair(options.outWidth, options.outHeight)
  }

  @ReactMethod
  fun size(path: String, promise: Promise) {
    try {
      val file = plain(path)
      val (w, h) = rawSize(file)
      val degrees = rotation(file)
      val result = Arguments.createMap()
      result.putInt("width", if (degrees == 90 || degrees == 270) h else w)
      result.putInt("height", if (degrees == 90 || degrees == 270) w else h)
      result.putInt("rotation", degrees)
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("size_failed", e)
    }
  }

  /** An upright rectangle, clamped to the picture, and the same rectangle in the stored pixels' coordinates. */
  private class Region(val left: Int, val top: Int, val raw: Rect, val degrees: Int)

  private fun region(file: String, left: Double, top: Double, width: Double, height: Double): Region {
    val (w, h) = rawSize(file)
    val degrees = rotation(file)
    val uw = if (degrees == 90 || degrees == 270) h else w
    val uh = if (degrees == 90 || degrees == 270) w else h
    val l = left.toInt().coerceIn(0, uw - 1)
    val t = top.toInt().coerceIn(0, uh - 1)
    val r = (left + width).toInt().coerceIn(l + 1, uw)
    val b = (top + height).toInt().coerceIn(t + 1, uh)
    // The upright rectangle in the stored pixels' coordinates (w × h). Turning the stored image upright:
    // 90° clockwise maps (x, y) to (h - y, x); 180° to (w - x, h - y); 270° to (y, w - x).
    val raw = when (degrees) {
      90 -> Rect(t, h - r, b, h - l)
      180 -> Rect(w - r, h - b, w - l, h - t)
      270 -> Rect(w - b, l, w - t, r)
      else -> Rect(l, t, r, b)
    }
    return Region(l, t, raw, degrees)
  }

  /** Crops [left, top, width, height] (upright coordinates) into a new JPEG in the cache; resolves its path. */
  @ReactMethod
  fun crop(path: String, left: Double, top: Double, width: Double, height: Double, promise: Promise) {
    try {
      val file = plain(path)
      val area = region(file, left, top, width, height)
      val l = area.left
      val t = area.top
      val raw = area.raw
      val degrees = area.degrees
      @Suppress("DEPRECATION")
      val decoder = BitmapRegionDecoder.newInstance(file, false)
        ?: throw IllegalStateException("cannot decode $file")
      val region = decoder.decodeRegion(raw, null)
      decoder.recycle()
      val upright =
        if (degrees == 0) region
        else Bitmap.createBitmap(region, 0, 0, region.width, region.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
      val out = File(reactApplicationContext.cacheDir, "crop-${System.currentTimeMillis()}.jpg")
      FileOutputStream(out).use { upright.compress(Bitmap.CompressFormat.JPEG, 95, it) }
      if (upright !== region) region.recycle()
      val result = Arguments.createMap()
      result.putString("path", out.absolutePath)
      result.putInt("left", l)
      result.putInt("top", t)
      result.putInt("width", upright.width)
      result.putInt("height", upright.height)
      upright.recycle()
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("crop_failed", e)
    }
  }

  /**
   * The share of a text region (upright coordinates) washed out by a reflection: the region is cut into
   * cells about `cell` px wide (the caller picks about a text row and a half), and a cell
   * counts as washed out when nearly all of it is clipped to white and none of it is dark (no letter
   * left). A bright label alone isn't glare: its cells still hold dark letters. Decoded subsampled, so
   * it takes a few milliseconds. Resolves { share, cells }.
   */
  @ReactMethod
  fun glare(path: String, left: Double, top: Double, width: Double, height: Double, cell: Double, promise: Promise) {
    try {
      val file = plain(path)
      val area = region(file, left, top, width, height)
      // About 12 decoded pixels per cell side: enough to see a letter's dark strokes.
      var sample = 1
      while (sample * 2 <= cell / 12) sample *= 2
      @Suppress("DEPRECATION")
      val decoder = BitmapRegionDecoder.newInstance(file, false)
        ?: throw IllegalStateException("cannot decode $file")
      val bitmap = decoder.decodeRegion(area.raw, BitmapFactory.Options().apply { inSampleSize = sample })
      decoder.recycle()
      val bw = bitmap.width
      val bh = bitmap.height
      val pixels = IntArray(bw * bh)
      bitmap.getPixels(pixels, 0, bw, 0, 0, bw, bh)
      bitmap.recycle()
      val side = maxOf(4, (cell / sample).toInt())
      var cells = 0
      var washed = 0
      var cy = 0
      while (cy < bh) {
        var cx = 0
        while (cx < bw) {
          var total = 0
          var clipped = 0
          var dark = 0
          for (y in cy until minOf(cy + side, bh)) {
            for (x in cx until minOf(cx + side, bw)) {
              val p = pixels[y * bw + x]
              val red = (p shr 16) and 0xff
              val green = (p shr 8) and 0xff
              val blue = p and 0xff
              total++
              if (minOf(red, green, blue) >= 245) clipped++
              if ((red * 299 + green * 587 + blue * 114) / 1000 < 150) dark++
            }
          }
          // Cells cut by the region's edge to under half their size don't count.
          if (total * 2 >= side * side) {
            cells++
            if (dark == 0 && clipped * 100 >= total * 85) washed++
          }
          cx += side
        }
        cy += side
      }
      val result = Arguments.createMap()
      result.putDouble("share", if (cells > 0) washed.toDouble() / cells else 0.0)
      result.putInt("cells", cells)
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("glare_failed", e)
    }
  }
}
