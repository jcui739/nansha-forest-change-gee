# -*- coding: utf-8 -*-
"""
Nansha forest change 2005-2025 -- local analysis of the Google Earth Engine exports.

Inputs  (GeoTIFF, EPSG:4326, uint8)
    data/forest_YYYY.tif       forest rasters: 1 = forest, 0 = non-forest
    data/change_2005_2025.tif  0 = stable non-forest, 1 = lost,
                               2 = gained, 3 = stable forest
Outputs
    figures/change_map.png
    figures/forest_trend.png
    a printed area table (the values quoted in the README)

Run from the repository root:

    pip install rasterio numpy matplotlib
    python analyze.py

WHY THIS SCRIPT EXISTS ALONGSIDE THE GEE SCRIPTS
    The classification and the areas are produced in Google Earth Engine
    (gee/v2_backprojection.js, using ee.Image.pixelArea() over the full grid).
    This script re-derives the same quantities *locally, from the exported
    rasters*, so the two can be cross-checked. It also draws the figures.

TWO THINGS IT DOES THAT THE FIRST DRAFT DID NOT
    1. Areas are COMPUTED from the rasters. The first draft had
           area = [29904, 32909, 40758, 38601, 42456]
       hard-coded, so the trend figure was a plot of literals -- it could
       never disagree with the text.
    2. Pixel area is corrected per latitude. The rasters are stored in
       degrees, so a naive 30 m x 30 m cell (900 m^2) OVERSTATES area by
       ~9% at 22.8 N, because one degree of longitude is only ~27.7 km
       there (vs ~111 km for latitude). Each raster row is scaled by its
       own cos(latitude). GEE's pixelArea() does the same thing properly;
       expect this local recomputation to agree with the GEE figures to
       within about 0.5%.
"""
from __future__ import annotations

import argparse
import glob
import os
import re

import numpy as np
import rasterio
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch


# ----------------------------------------------------------------------
# Pixel-area helpers (latitude-corrected).
# ----------------------------------------------------------------------
def _m_per_deg(lat_deg):
    """Metres per degree of latitude and of longitude at the given latitude."""
    phi = np.radians(np.asarray(lat_deg, dtype="float64"))
    m_lat = 111132.92 - 559.82 * np.cos(2 * phi) + 1.175 * np.cos(4 * phi)
    m_lon = 111412.84 * np.cos(phi) - 93.5 * np.cos(3 * phi)
    return m_lat, m_lon


def class_area_ha(arr, transform, res_deg, cls):
    """Hectares occupied by pixels whose value == cls, corrected per row."""
    rows = np.where((arr == cls).any(axis=1))[0]
    if rows.size == 0:
        return 0.0
    counts = (arr[rows] == cls).sum(axis=1).astype("float64")
    lats = transform.f + (rows + 0.5) * transform.e          # e is negative
    m_lat, m_lon = _m_per_deg(lats)
    pix_m2 = (res_deg * m_lat) * (res_deg * m_lon)
    return float((counts * pix_m2).sum() / 1e4)


def open_tif(path):
    with rasterio.open(path) as src:
        return src.read(1), src.transform, src.res[0]


# ----------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data", help="folder holding the GeoTIFFs")
    ap.add_argument("--figs", default="figures", help="folder for the PNGs")
    args = ap.parse_args()

    os.makedirs(args.figs, exist_ok=True)

    # ---- 1. change map ------------------------------------------------
    change_path = os.path.join(args.data, "change_2005_2025.tif")
    change, transform, res_deg = open_tif(change_path)

    print("=" * 62)
    print("change_2005_2025.tif")
    print(f"  grid        : {change.shape[1]} cols x {change.shape[0]} rows")
    print(f"  pixel size  : {res_deg:.10f} deg  (EPSG:4326)")

    lat_mid = transform.f + change.shape[0] / 2 * transform.e
    m_lat, m_lon = _m_per_deg(lat_mid)
    print(f"  pixel area  : {(res_deg*m_lat)*(res_deg*m_lon):.2f} m^2 at lat "
          f"{lat_mid:.4f}   (a naive 30x30 m cell = 900 m^2 would be ~9% too big)")

    classes = {0: "Stable non-forest", 1: "Lost forest",
               2: "Gained forest", 3: "Stable forest"}
    areas_ha = {c: class_area_ha(change, transform, res_deg, c) for c in classes}

    print("-" * 62)
    for c, name in classes.items():
        print(f"  {name:20s}: {areas_ha[c]:10.1f} ha")
    net = areas_ha[2] - areas_ha[1]
    print(f"  {'Net change (gain-loss)':20s}: {net:+10.1f} ha")
    print("=" * 62)

    # sanity check: the change map must decompose the two forest rasters
    for yr in (2005, 2025):
        fp = os.path.join(args.data, f"forest_{yr}.tif")
        if os.path.exists(fp):
            arr, tr, r0 = open_tif(fp)
            tot = class_area_ha(arr, tr, r0, 1)
            decomp = (areas_ha[3] + areas_ha[1]) if yr == 2005 else (areas_ha[3] + areas_ha[2])
            flag = "OK" if abs(tot - decomp) < 0.5 else "MISMATCH"
            print(f"  check {yr}: forest_{yr} = {tot:9.1f} ha | "
                  f"change decomposition = {decomp:9.1f} ha  [{flag}]")

    # ---- write the change map ----------------------------------------
    cmap = matplotlib.colors.ListedColormap(["#e8e8e8", "#ff4444", "#44aa44", "#004400"])
    labels = ["Stable non-forest", "Lost forest", "Gained forest", "Stable forest"]
    fig, ax = plt.subplots(figsize=(9, 9))
    ax.imshow(change, cmap=cmap, vmin=0, vmax=3)
    ax.set_title("Nansha Forest Change 2005-2025")
    ax.axis("off")
    ax.legend(handles=[Patch(facecolor=cmap(i), label=labels[i]) for i in range(4)],
              loc="lower right", fontsize=9)
    plt.tight_layout()
    out1 = os.path.join(args.figs, "change_map.png")
    plt.savefig(out1, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(f"\n  saved {out1}")

    # ---- 2. area trend ------------------------------------------------
    # (a) years that have a committed raster -> computed here
    raster = {}
    for fp in sorted(glob.glob(os.path.join(args.data, "forest_*.tif"))):
        m = re.search(r"forest_(\d{4})\.tif$", os.path.basename(fp))
        if not m:
            continue
        arr, tr, r0 = open_tif(fp)
        raster[int(m.group(1))] = class_area_ha(arr, tr, r0, 1)

    # (b) years reported by GEE but never exported as a raster.
    #     Read from a plain CSV so the provenance is visible -- these points
    #     are NOT reproducible from this repository alone, and are drawn as
    #     hollow markers to say so.
    reported = {}
    csv_path = os.path.join(args.data, "gee_reported_areas.csv")
    if os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8-sig") as fh:      # tolerate a BOM
            for line in fh:
                parts = line.strip().split(",")
                if len(parts) < 2:
                    continue
                try:
                    year, area = int(parts[0]), float(parts[1])
                except ValueError:                                # header / comment
                    continue
                reported[year] = area

    years = sorted(set(raster) | set(reported))
    if not years:
        print("\n  no area data found -- skipping the trend figure.")
        return

    print("\n  forest area by year:")
    for y in years:
        if y in raster:
            print(f"    {y}: {raster[y]:9.1f} ha   [computed from raster]")
        else:
            print(f"    {y}: {reported[y]:9.1f} ha   [GEE-reported, no raster]")

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(years, [raster.get(y, reported.get(y)) for y in years],
            "-", color="#006400", lw=2, zorder=1)
    for y in years:
        if y in raster:
            ax.plot(y, raster[y], "o", color="#006400", ms=9, zorder=3,
                    label="computed from raster" if y == years[0] else None)
            ax.annotate(f"{raster[y]:,.0f}", (y, raster[y]), xytext=(0, 10),
                        textcoords="offset points", ha="center", fontsize=8)
        else:
            ax.plot(y, reported[y], "o", mfc="white", mec="#006400", mew=2, ms=9,
                    zorder=3, label="GEE-reported (no raster)" if y == years[1] else None)
            ax.annotate(f"{reported[y]:,.0f}", (y, reported[y]), xytext=(0, 10),
                        textcoords="offset points", ha="center", fontsize=8)
    ax.set_xlabel("Year")
    ax.set_ylabel("Forest Area (ha)")
    ax.set_title("Nansha Forest Area - Landsat Back-projection")
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8, loc="best")
    plt.tight_layout()
    out2 = os.path.join(args.figs, "forest_trend.png")
    plt.savefig(out2, dpi=200)
    plt.close(fig)
    print(f"  saved {out2}")


if __name__ == "__main__":
    main()
