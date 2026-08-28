# -*- coding: utf-8 -*-
"""
Excel/Data to Advanced Standalone KMZ Converter (Golden GIS Benchmark)
Author: Map-Tools Engineering Suite (almangory/Map-tools)
Description:
  Converts Excel spreadsheets (with columns, defect logs, CCTV drawings, and Google Maps links)
  into standalone, rich-media KMZ files compatible with Google Earth, ArcGIS, and QGIS.
"""

import os
import sys
import io
import re
import json
import zipfile
import datetime
import html
import argparse
import asyncio
from typing import Dict, List, Any, Optional, Tuple

try:
    import openpyxl
    from openpyxl.drawing.image import Image as OpenpyxlImage
except ImportError:
    openpyxl = None

try:
    import httpx
except ImportError:
    httpx = None


def format_val(v: Any) -> str:
    if v is None:
        return '-'
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    return s if s else '-'


def extract_coords_from_text(text: str) -> Tuple[Optional[float], Optional[float]]:
    if not text:
        return None, None
    
    # 1. Google Maps Pin format (!3d... !4d...)
    m_pin = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', text)
    if m_pin:
        return float(m_pin.group(1)), float(m_pin.group(2))
    
    # 2. Coordinates path / search / place / q
    m_q = re.search(r'[?&/](?:q|search|place)=(-?\d+\.\d{3,}),\s*\+?(-?\d+\.\d{3,})', text)
    if m_q:
        return float(m_q.group(1)), float(m_q.group(2))
    
    # 3. Viewport @lat,lng
    m_at = re.search(r'@(-?\d+\.\d{3,}),\s*(-?\d+\.\d{3,})', text)
    if m_at:
        return float(m_at.group(1)), float(m_at.group(2))
    
    # 4. Standard Lat,Lng pair
    m_pair = re.search(r'(-?\d{1,2}\.\d{4,})\s*[,|\s]\s*(-?\d{1,3}\.\d{4,})', text)
    if m_pair:
        v1, v2 = float(m_pair.group(1)), float(m_pair.group(2))
        if -90 <= v1 <= 90 and -180 <= v2 <= 180:
            return v1, v2
        elif -90 <= v2 <= 90 and -180 <= v1 <= 180:
            return v2, v1
            
    return None, None


async def resolve_urls_batch(urls: List[str], max_concurrency: int = 25) -> Dict[str, Tuple[float, float]]:
    resolved: Dict[str, Tuple[float, float]] = {}
    if not httpx or not urls:
        return resolved

    sem = asyncio.Semaphore(max_concurrency)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }

    async def _fetch(client, u):
        async with sem:
            for _ in range(2):
                try:
                    r = await client.get(u, follow_redirects=True, timeout=12.0)
                    lat, lng = extract_coords_from_text(str(r.url))
                    if lat is not None and lng is not None:
                        return u, (lat, lng)
                    # HTML Fallback search
                    lat, lng = extract_coords_from_text(r.text)
                    if lat is not None and lng is not None:
                        return u, (lat, lng)
                except Exception:
                    await asyncio.sleep(0.5)
            return u, None

    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        tasks = [_fetch(client, u) for u in urls if u.startswith('http')]
        results = await asyncio.gather(*tasks)
        for u, coords in results:
            if coords:
                resolved[u] = coords

    return resolved


def convert_excel_to_kmz(
    excel_path: str,
    output_kmz: Optional[str] = None,
    sheet_name: Optional[str] = None,
    group_column: Optional[str] = None,
    badge_column: Optional[str] = None,
    cache_file: Optional[str] = None
) -> str:
    if not openpyxl:
        raise ImportError("openpyxl is required. Run: pip install openpyxl")

    if not output_kmz:
        base, _ = os.path.splitext(excel_path)
        output_kmz = f"{base}.kmz"

    print(f"Loading Excel file: {excel_path}...")
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb[sheet_name] if sheet_name and sheet_name in wb.sheetnames else wb.active

    headers = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]
    while headers and headers[-1] is None:
        headers.pop()

    # Load cache if available
    cache = {}
    if cache_file and os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                cache = json.load(f)
        except Exception:
            pass

    # Extract images mapped to rows
    row_images = {}
    if hasattr(ws, '_images'):
        for img in ws._images:
            r_idx = None
            if hasattr(img.anchor, '_from'):
                r_idx = img.anchor._from.row + 1
            elif hasattr(img.anchor, 'row'):
                r_idx = img.anchor.row
            
            if r_idx is not None:
                if r_idx not in row_images:
                    row_images[r_idx] = []
                ext = getattr(img, 'format', 'jpg') or 'jpg'
                ext = ext.lower()
                if ext == 'jpeg': ext = 'jpg'
                row_images[r_idx].append((img._data(), ext))

    print(f"Found {len(row_images)} rows with embedded CCTV/drawing images.")

    # Parse rows
    raw_rows = []
    urls_to_resolve = []
    for r in range(2, ws.max_row + 1):
        d = {headers[c-1]: ws.cell(r, c).value for c in range(1, len(headers) + 1)}
        if not any(v is not None for v in d.values()):
            continue
        
        # Look for location / url column
        loc_val = None
        for k, v in d.items():
            if k and any(term in str(k).lower() for term in ['location', 'map', 'موقع', 'رابط', 'google', 'url']):
                loc_val = v
                break
        
        url_cleaned = str(loc_val).replace(' ', '').replace('\n', '').replace('\r', '').strip() if loc_val else ''
        if url_cleaned.startswith('http') and url_cleaned not in cache:
            urls_to_resolve.append(url_cleaned)
            
        raw_rows.append({'row': r, 'data': d, 'url': url_cleaned})

    # Resolve URLs if httpx is available
    if urls_to_resolve:
        print(f"Resolving {len(urls_to_resolve)} unique Google Maps URLs...")
        new_coords = asyncio.run(resolve_urls_batch(list(set(urls_to_resolve))))
        for u, coords in new_coords.items():
            cache[u] = {'lat': coords[0], 'lng': coords[1]}
        if cache_file:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)

    # Build Placemarks
    all_kmz_images = {}
    folders_dict: Dict[str, List[str]] = {}

    for item in raw_rows:
        r = item['row']
        d = item['data']
        u = item['url']

        lat, lng = None, None
        if u in cache:
            lat = cache[u]['lat']
            lng = cache[u]['lng']
        elif u:
            lat, lng = extract_coords_from_text(u)

        if lat is None or lng is None:
            # Fallback search in all cell values
            for v in d.values():
                if v:
                    lat, lng = extract_coords_from_text(str(v))
                    if lat is not None and lng is not None:
                        break

        if lat is None or lng is None:
            continue

        # Grouping
        grp = 'General'
        if group_column and group_column in d and d[group_column]:
            grp = str(d[group_column]).strip()
        else:
            # Auto-detect department / layer
            for k, v in d.items():
                if k and any(term in str(k).lower() for term in ['جهة', 'قسم', 'layer', 'department', 'status']):
                    if v:
                        grp = str(v).strip()
                        break

        if grp not in folders_dict:
            folders_dict[grp] = []

        # Images HTML
        img_tags_html = ''
        if r in row_images:
            for idx, (img_bytes, ext) in enumerate(row_images[r]):
                img_path = f'images/photo_r{r}_{idx+1}.{ext}'
                all_kmz_images[img_path] = img_bytes
                img_tags_html += f'''
                <div style="margin-top:10px; text-align:center;">
                    <div style="font-size:11px; color:#475569; margin-bottom:4px; font-weight:bold;">📷 صورة المعاينة / الفحص</div>
                    <img src="{img_path}" alt="Defect Photo" style="max-width:100%; height:auto; border-radius:6px; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" />
                </div>'''

        # Build table rows
        rows_html = ''
        extended_data_items = []
        for k, v in d.items():
            if not k:
                continue
            val_str = format_val(v)
            extended_data_items.append((str(k), val_str))
            
            is_highlight = any(term in str(k).lower() for term in ['defect', 'عيب', 'ملاحظ', 'كسر', 'تسريب', 'issue', 'comment'])
            val_style = "color:#dc2626; font-weight:bold;" if is_highlight else "color:#0f172a;"
            
            rows_html += f'''
            <tr>
                <th style="background-color:#f8fafc; color:#475569; width:38%; font-weight:600; white-space:nowrap; padding:5px 8px; border-bottom:1px solid #f1f5f9; text-align:right;">{html.escape(str(k))}</th>
                <td style="{val_style} padding:5px 8px; border-bottom:1px solid #f1f5f9; text-align:right; word-break:break-word;">{html.escape(val_str)}</td>
            </tr>'''

        rows_html += f'''
        <tr>
            <th style="background-color:#f8fafc; color:#475569; width:38%; font-weight:600; white-space:nowrap; padding:5px 8px; border-bottom:1px solid #f1f5f9; text-align:right;">الإحداثيات الجغرافية</th>
            <td style="color:#0f172a; padding:5px 8px; border-bottom:1px solid #f1f5f9; text-align:right;">{lat:.6f}, {lng:.6f}</td>
        </tr>'''

        maps_btn = ''
        if u and u.startswith('http'):
            maps_btn = f'''
            <div style="text-align:center; margin-top:12px;">
                <a href="{html.escape(u)}" target="_blank" style="display:inline-block; padding:7px 16px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-weight:bold; font-size:12px; border-radius:6px; box-shadow:0 2px 4px rgba(37,99,235,0.25);">
                    📍 فتح الموقع في Google Maps
                </a>
            </div>'''

        title = f"موقع [{d.get('Sr.', r-1)}]" if 'Sr.' in d else f"عنصر رقم {r-1}"
        for k in ['Line No.', 'Line', 'ID', 'Name', 'رقم الخط']:
            if k in d and d[k]:
                title += f" - {d[k]}"
                break

        badge_txt = grp
        if badge_column and badge_column in d and d[badge_column]:
            badge_txt = str(d[badge_column])

        html_desc = f'''<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:12px; color:#1e293b; margin:0; padding:6px; background-color:#ffffff; direction:rtl; text-align:right; line-height:1.4; max-width:440px; box-sizing:border-box;">
  <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.08); background-color:#ffffff;">
    <div style="border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin-bottom:8px;">
      <div style="font-size:14px; font-weight:bold; color:#0f172a; margin:0 0 4px 0;">{html.escape(title)}</div>
      <div style="margin-top:4px;"><span style="display:inline-block; padding:2px 8px; font-size:11px; font-weight:bold; color:#ffffff; background-color:#0284c7; border-radius:10px;">{html.escape(badge_txt)}</span></div>
    </div>
    <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:12px; direction:rtl; text-align:right;">
      {rows_html}
    </table>
    {img_tags_html}
    {maps_btn}
  </div>
</body>
</html>'''

        ext_data_xml = '      <ExtendedData>\n'
        for k, v in extended_data_items:
            clean_k = re.sub(r'[^a-zA-Z0-9_\u0600-\u06FF]', '_', k)
            ext_data_xml += f'        <Data name="{html.escape(clean_k)}"><value>{html.escape(v)}</value></Data>\n'
        ext_data_xml += '      </ExtendedData>'

        pm_xml = f'''    <Placemark>
      <name>{html.escape(title)}</name>
      <Snippet maxLines="2">{html.escape(title)}</Snippet>
      <description><![CDATA[{html_desc}]]></description>
{ext_data_xml}
      <Point>
        <coordinates>{lng:.7f},{lat:.7f},0</coordinates>
      </Point>
    </Placemark>'''

        folders_dict[grp].append(pm_xml)

    # Build KML
    folders_kml = ''
    total_pms = 0
    for grp_name, pms in folders_dict.items():
        total_pms += len(pms)
        folders_kml += f'''
    <Folder>
      <name>{html.escape(grp_name)} [{len(pms)}]</name>
      <open>1</open>
'''
        for pm in pms:
            folders_kml += pm + '\n'
        folders_kml += '    </Folder>\n'

    kml_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{html.escape(os.path.basename(output_kmz))}</name>
    <open>1</open>
    {folders_kml}
  </Document>
</kml>'''

    # Package KMZ
    print(f"Packaging {output_kmz} ({total_pms} placemarks, {len(all_kmz_images)} embedded images)...")
    with zipfile.ZipFile(output_kmz, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as kmz:
        kmz.writestr('doc.kml', kml_content.encode('utf-8'))
        for img_path, img_data in all_kmz_images.items():
            kmz.writestr(img_path, img_data)

    print(f"KMZ file created successfully at: {output_kmz}")
    return output_kmz


def main():
    parser = argparse.ArgumentParser(description="Convert Excel with photos and links to Standalone KMZ")
    parser.add_argument("excel", help="Path to Excel (.xlsx) file")
    parser.add_argument("-o", "--output", help="Path to output KMZ file")
    parser.add_argument("-s", "--sheet", help="Sheet name (optional)")
    parser.add_argument("-g", "--group-by", help="Column name to group folders by")
    parser.add_argument("-b", "--badge", help="Column name for badge pill text")
    parser.add_argument("-c", "--cache", help="Cache JSON file for resolved URLs", default="coords_cache.json")
    
    args = parser.parse_args()
    convert_excel_to_kmz(
        excel_path=args.excel,
        output_kmz=args.output,
        sheet_name=args.sheet,
        group_column=args.group_by,
        badge_column=args.badge,
        cache_file=args.cache
    )


if __name__ == "__main__":
    main()