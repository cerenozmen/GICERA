"""
Local OCR preprocessing POC: image variants of guided high-resolution photos, for the phone's ML Kit to
read (OcrBenchScreen "Bench") and ocrBench.ts to measure against the product's label.

Everything runs locally (OpenCV, Apache-2.0; NumPy, BSD). No API, no key, no cloud.

    python prep.py <capture dir> [<capture dir> ...] --out <dir>

A capture dir holds <STEP>.jpg (EXIF-oriented as ML Kit reads it) and <STEP>.mlkit.json (ML Kit's lines
on the original). Per photo, variants:

    orig          the photo as taken (baseline)
    crop          the ingredient region (ROI) from ML Kit's line geometry, widened so row ends ML Kit lost
                  at a silhouette stay inside; the original is the fallback when no region is found
    rot           crop, deskewed by the text lines' angle
    persp         perspective-corrected from the list's corner lines (quad → rectangle)
    dewarp        text-line based dewarp: text rows traced in vertical strips, each bent row straightened
    cyl           dewarp, then unrolled as a cylinder (x = cx + R sin θ) when a package silhouette is found
    *_clahe       grey, contrast-normalised (CLAHE)
    *_sharp       grey, mild unsharp mask
    *_thr         adaptive threshold (binarised)

Nothing adds pixels that weren't photographed: every variant is a resampling of the photo.
"""
import argparse
import json
import math
import os
import re
import time

import cv2
import numpy as np

HEADING = re.compile(r"^\W*(ingr[eé]dients?|i?[çc]indekiler|[l|]cindekiler|i[çc]erik|composition|inci)\b", re.I)


def load(capture, step):
    img = cv2.imread(os.path.join(capture, f"{step}.jpg"))  # EXIF orientation applied, as ML Kit reads it
    with open(os.path.join(capture, f"{step}.mlkit.json"), encoding="utf8") as f:
        ocr = json.load(f)
    return img, ocr


def upright(img, lines):
    """The photo turned so the text reads left to right (from ML Kit's corner points), lines mapped along.

    ML Kit's boxes are in the EXIF-oriented image's pixels; a photo taken with the phone sideways has its
    text running up or down."""
    H, W = img.shape[:2]
    dx = sum(l["corners"][1][0] - l["corners"][0][0] for l in lines if l.get("corners"))
    dy = sum(l["corners"][1][1] - l["corners"][0][1] for l in lines if l.get("corners"))
    if abs(dx) >= abs(dy):
        turned = 0 if dx >= 0 else 180
    else:
        turned = 90 if dy > 0 else 270
    if turned == 0:
        return img, lines, 0
    if turned == 90:  # reading down: x' = y, y' = W - x
        out, f = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE), lambda x, y: (y, W - x)
    elif turned == 270:  # reading up: x' = H - y, y' = x
        out, f = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE), lambda x, y: (H - y, x)
    else:
        out, f = cv2.rotate(img, cv2.ROTATE_180), lambda x, y: (W - x, H - y)
    mapped = []
    for l in lines:
        corners = l.get("corners") or [[l["left"], l["top"]], [l["left"] + l["width"], l["top"]], [l["left"] + l["width"], l["top"] + l["height"]], [l["left"], l["top"] + l["height"]]]
        c = [list(f(x, y)) for x, y in corners]
        xs, ys = [p[0] for p in c], [p[1] for p in c]
        mapped.append({**l, "corners": c, "left": min(xs), "top": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)})
    return out, mapped, turned


def list_lines(lines):
    """ML Kit lines of the ingredient list: the vertical cluster of comma-separated or heading lines."""
    cand = [l for l in lines if l["text"].count(",") >= 1 or HEADING.search(l["text"])]
    if not cand:
        return []
    cand.sort(key=lambda l: l["top"])
    lh = float(np.median([l["height"] for l in cand]))
    clusters, cur = [], [cand[0]]
    for l in cand[1:]:
        prev_bottom = max(c["top"] + c["height"] for c in cur)
        if l["top"] - prev_bottom < 2.5 * lh:
            cur.append(l)
        else:
            clusters.append(cur)
            cur = [l]
    clusters.append(cur)
    best = max(clusters, key=lambda c: sum(l["text"].count(",") for l in c) + 3 * any(HEADING.search(l["text"]) for l in c))
    # Lines between the cluster's top and bottom belong to it (rows OCR read without commas).
    top = min(l["top"] for l in best)
    bottom = max(l["top"] + l["height"] for l in best)
    return [l for l in lines if l["top"] + l["height"] / 2 >= top - 0.5 * lh and l["top"] + l["height"] / 2 <= bottom + 0.5 * lh]


def roi_of(lines, W, H):
    ll = list_lines(lines)
    if not ll:
        return None, None
    lh = float(np.median([l["height"] for l in ll]))
    x0 = min(l["left"] for l in ll)
    x1 = max(l["left"] + l["width"] for l in ll)
    y0 = min(l["top"] for l in ll)
    y1 = max(l["top"] + l["height"] for l in ll)
    # Wide margins: on a tube or lid ML Kit stops before the silhouette, and the unread row ends are the point.
    mx = max(0.18 * (x1 - x0), 6 * lh)
    my = 2.5 * lh
    box = (int(max(0, x0 - mx)), int(max(0, y0 - my)), int(min(W, x1 + mx)), int(min(H, y1 + my)))
    return box, ll


def line_angle(ll):
    angles = []
    for l in ll:
        c = l.get("corners")
        if c and len(c) >= 2:
            dx, dy = c[1][0] - c[0][0], c[1][1] - c[0][1]
            if dx > 0:
                angles.append(math.degrees(math.atan2(dy, dx)))
    return float(np.median(angles)) if angles else 0.0


def rotate_crop(img, box, angle):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    M = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    rot = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return rot[y0:y1, x0:x1]


def perspective(img, ll, box):
    """The list's quad (first line's top edge, last line's bottom edge, from ML Kit corners) to a rectangle."""
    with_c = [l for l in ll if l.get("corners") and len(l["corners"]) == 4]
    if len(with_c) < 2:
        return None
    first, last = with_c[0], with_c[-1]
    tl, tr = np.array(first["corners"][0], float), np.array(first["corners"][1], float)
    br, bl = np.array(last["corners"][2], float), np.array(last["corners"][3], float)
    # Widen along the rows by the ROI margin (row ends ML Kit didn't read).
    x0, _, x1, _ = box
    left_ext = max(0.0, min(tl[0], bl[0]) - x0)
    right_ext = max(0.0, x1 - max(tr[0], br[0]))
    def along(p, q, d):
        v = (q - p) / (np.linalg.norm(q - p) + 1e-9)
        return p - v * d
    tl2, bl2 = along(tl, tr, left_ext), along(bl, br, left_ext)
    tr2, br2 = along(tr, tl, right_ext), along(br, bl, right_ext)
    lh = float(np.median([l["height"] for l in ll]))
    up = np.array([0, -2.0 * lh])
    src = np.float32([tl2 + up, tr2 + up, br2 - up, bl2 - up])
    w = int(max(np.linalg.norm(src[1] - src[0]), np.linalg.norm(src[2] - src[3])))
    h = int(max(np.linalg.norm(src[3] - src[0]), np.linalg.norm(src[2] - src[1])))
    if w < 50 or h < 20:
        return None
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def text_mask(gray, lh):
    """Text pixels (white), whatever the print's polarity, rows smeared into blobs."""
    blk = int(max(15, (lh * 1.5) // 2 * 2 + 1))
    dark = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, blk, 12)
    light = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, blk, -12)
    m = dark if dark.mean() <= light.mean() else light
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (int(max(3, lh * 1.2)), 1))
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)


def trace_rows(gray, lh, strips=14):
    """Row centre lines: peaks of each vertical strip's horizontal ink profile, followed strip to strip."""
    H, W = gray.shape
    mask = text_mask(gray, lh)
    xs, peaks = [], []
    sw = W / strips
    for s in range(strips):
        a, b = int(s * sw), int((s + 1) * sw)
        prof = mask[:, a:b].mean(axis=1)
        prof = cv2.GaussianBlur(prof.reshape(-1, 1).astype(np.float32), (1, 0), sigmaX=0, sigmaY=max(1.0, lh / 4)).ravel()
        thr = max(8.0, 0.35 * prof.max())
        ps = [y for y in range(1, H - 1) if prof[y] >= thr and prof[y] >= prof[y - 1] and prof[y] > prof[y + 1]]
        kept = []
        for y in sorted(ps, key=lambda y: -prof[y]):
            if all(abs(y - k) > 0.6 * lh for k in kept):
                kept.append(y)
        xs.append((a + b) / 2)
        peaks.append(sorted(kept))
    mid = strips // 2
    rows = []
    for y in peaks[mid]:
        pts = {mid: y}
        for direction in (-1, 1):
            cur = y
            s = mid + direction
            while 0 <= s < strips:
                near = [p for p in peaks[s] if abs(p - cur) < 0.45 * lh]
                if not near:
                    s += direction
                    continue
                cur = min(near, key=lambda p: abs(p - cur))
                pts[s] = cur
                s += direction
        if len(pts) >= max(4, strips // 3):
            rows.append(sorted((xs[s], float(v)) for s, v in pts.items()))
    return rows


def dewarp(img, lh):
    """Each traced row straightened to its height at the image's centre (vertical displacement only)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    H, W = gray.shape
    rows = trace_rows(gray, lh)
    if len(rows) < 2:
        return None, {"rows": len(rows), "sag": 0.0}
    cx = W / 2
    xs = np.arange(W, dtype=np.float32)
    curves, sags = [], []
    for pts in rows:
        x = np.array([p[0] for p in pts])
        y = np.array([p[1] for p in pts])
        f = np.polyfit(x, y, 2 if len(pts) >= 5 else 1)
        # Only where the row was traced; beyond, it goes on level (no extrapolated bend).
        c = np.polyval(f, np.clip(xs, x.min(), x.max()))
        curves.append(c)
        sags.append(float(np.max(np.abs(c - c[int(cx)]))) / lh)
    curves = np.array(curves)  # rows × W: each row's y at every x
    order = np.argsort(curves[:, int(cx)])
    curves = curves[order]
    targets = curves[:, int(cx)]
    # How much the list's rows bend (the median row, in line heights): FLAT below 0.25.
    sag = float(np.median(sags))
    # For every output (x, y): the source y, interpolated between the rows around y.
    map_y = np.zeros((H, W), np.float32)
    ys = np.arange(H, dtype=np.float32)
    for x in range(W):
        map_y[:, x] = np.interp(ys, targets, curves[:, x], left=np.nan, right=np.nan)
        # Outside the traced rows: shifted like the nearest row.
        lo, hi = targets[0], targets[-1]
        map_y[ys < lo, x] = ys[ys < lo] + (curves[0, x] - lo)
        map_y[ys > hi, x] = ys[ys > hi] + (curves[-1, x] - hi)
    map_x = np.tile(xs, (H, 1))
    out = cv2.remap(img, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return out, {"rows": len(rows), "sag": round(sag, 3)}


def silhouette(gray, lh):
    """The package's left and right edges in the region: the strongest brightness steps of the column
    profile (the package against its background), one in each outer part of the region."""
    H, W = gray.shape
    prof = cv2.GaussianBlur(gray.mean(axis=0).astype(np.float32).reshape(1, -1), (0, 0), sigmaX=max(2.0, lh / 2)).ravel()
    d = np.abs(np.diff(prof))
    third = W // 3
    li = int(np.argmax(d[:third]))
    ri = 2 * third + int(np.argmax(d[2 * third :]))
    base = float(np.median(d)) + 1e-6
    # A real edge: a step many times the profile's usual change, and the package at least half the region.
    if d[li] < 6 * base or d[ri] < 6 * base or ri - li < 0.4 * W:
        return None
    return li, ri


def squeeze(img, lh):
    """Foreshortening: vertical-stroke density near the text's left/right ends against its middle. Print
    on a cylinder is squeezed towards the silhouette (more strokes per pixel); on a flat label it isn't."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    rows = trace_rows(gray, lh)
    if len(rows) < 2:
        return None
    gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
    edges = gx > np.percentile(gx, 90)
    band = np.zeros_like(edges)
    for pts in rows:
        ys = [p[1] for p in pts]
        y0, y1 = int(max(0, min(ys) - 0.4 * lh)), int(min(gray.shape[0], max(ys) + 0.4 * lh))
        band[y0:y1, :] = True
    dens = (edges & band).sum(axis=0).astype(np.float32)
    dens = cv2.GaussianBlur(dens.reshape(1, -1), (0, 0), sigmaX=lh).ravel()
    cols = np.where(dens > 0.2 * dens.max())[0]
    if len(cols) < 20:
        return None
    t0, t1 = cols[0], cols[-1]
    w = t1 - t0
    outer = np.concatenate([dens[t0 : t0 + int(0.15 * w)], dens[t1 - int(0.15 * w) : t1]]).mean()
    mid = dens[t0 + int(0.3 * w) : t1 - int(0.3 * w)].mean()
    return round(float(outer / (mid + 1e-6)), 3)


def unroll(img, lh):
    """A cylinder's surface unrolled: x = cx + R sin θ, θ sampled evenly (R from the silhouette)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    H, W = gray.shape
    sil = silhouette(gray, lh)
    if not sil:
        return None, {"silhouette": None}
    l, r = sil
    cx, R = (l + r) / 2, (r - l) / 2
    th_max = math.asin(0.995)  # up to the silhouette: nothing visible is cut away
    out_w = int(2 * R * th_max)
    thetas = np.linspace(-th_max, th_max, out_w, dtype=np.float32)
    map_x = np.tile((cx + R * np.sin(thetas)).astype(np.float32), (H, 1))
    map_y = np.tile(np.arange(H, dtype=np.float32).reshape(-1, 1), (1, out_w))
    out = cv2.remap(img, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return out, {"silhouette": [int(l), int(r)], "R": round(R, 1)}


def enhance(img, lh, kind):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if kind == "clahe":
        return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    if kind == "sharp":
        blur = cv2.GaussianBlur(gray, (0, 0), 1.2)
        return cv2.addWeighted(gray, 1.5, blur, -0.5, 0)
    if kind == "thr":
        blk = int(max(15, (lh * 1.5) // 2 * 2 + 1))
        return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, blk, 10)
    raise ValueError(kind)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("captures", nargs="+")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    manifest = []
    for capture in args.captures:
        cap = os.path.basename(os.path.normpath(capture))
        steps = sorted(f[:-4] for f in os.listdir(capture) if f.endswith(".jpg"))
        for step in steps:
            original, ocr = load(capture, step)
            # (The app logged the frame as portrait whatever the phone's orientation: the image's own size counts.)
            img, lines, turned = upright(original, ocr["lines"])
            H, W = img.shape[:2]
            box, ll = roi_of(lines, W, H)
            lh = float(np.median([l["height"] for l in ll])) if ll else 40.0
            angle = line_angle(ll) if ll else 0.0
            geometry = {"roi": box, "lineHeight": round(lh, 1), "angle": round(angle, 2), "turned": turned}
            variants = {}
            def timed(name, fn):
                t = time.time()
                out = fn()
                ms = int((time.time() - t) * 1000)
                if out is not None:
                    variants[name] = (out, ms)
            timed("orig", lambda: original)
            if box:
                crop = img[box[1] : box[3], box[0] : box[2]]
                timed("crop", lambda: crop)
                timed("rot", lambda: rotate_crop(img, box, angle))
                timed("persp", lambda: perspective(img, ll, box))
                base = variants["rot"][0]
                t = time.time()
                dw, info = dewarp(base, lh)
                geometry["dewarp"] = info
                if dw is not None:
                    variants["dewarp"] = (dw, int((time.time() - t) * 1000))
                t = time.time()
                cy, cinfo = unroll(dw if dw is not None else base, lh)
                geometry["cylinder"] = cinfo
                if cy is not None:
                    variants["cyl"] = (cy, int((time.time() - t) * 1000))
                # FLAT: rows bend less than a quarter of a line height and the print isn't squeezed towards the ends.
                sq = squeeze(base, lh)
                geometry["squeeze"] = sq
                geometry["class"] = "CURVED" if info.get("sag", 0) >= 0.25 or (sq is not None and sq >= 1.25) else "FLAT"
                for src in [k for k in ("crop", "dewarp", "cyl") if k in variants]:
                    for kind in ("clahe", "sharp", "thr"):
                        timed(f"{src}_{kind}", lambda s=src, k=kind: enhance(variants[s][0], lh, k))
            for name, (out, ms) in variants.items():
                fname = f"{cap}__{step}__{name}.jpg"
                cv2.imwrite(os.path.join(args.out, fname), out, [cv2.IMWRITE_JPEG_QUALITY, 95])
                manifest.append({"file": fname, "capture": cap, "step": step, "variant": name, "width": int(out.shape[1]), "height": int(out.shape[0]), "prepMs": ms, "geometry": geometry})
            print(f"{cap} {step}: {W}x{H} turned {turned}, class {geometry.get('class', '-')} (squeeze {geometry.get('squeeze')}), roi {box}, angle {angle:.1f}, dewarp {geometry.get('dewarp')}, cyl {geometry.get('cylinder')}, {len(variants)} variants")
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf8") as f:
        json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main()
