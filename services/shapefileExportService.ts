import shpwrite from '@mapbox/shp-write';
import { GeoPoint } from '../types';
import { extractAllPointAttributes } from './parserService';

const ARABIC_KEY_MAP: Record<string, string> = {
  'الشارع': 'STREET',
  'اسم الشارع': 'STREET',
  'الحي': 'DISTRICT',
  'المنطقة': 'ZONE',
  'القطر': 'DIAMETER',
  'النوع': 'TYPE',
  'الحالة': 'STATUS',
  'الوصف': 'DESC',
  'رقم الترخيص': 'PERMIT_NO',
  'رقم القطاع': 'SEGMENT_ID'
};

/**
 * تحويل مجموعة نقاط GeoPoint إلى كائن GeoJSON FeatureCollection
 */
export const convertGeoPointsToGeoJSON = (points: GeoPoint[]): any => {
  const features = points.map((pt, idx) => {
    let geometry: any;

    const defaultX = pt.x ?? (pt.path && pt.path[0]?.x) ?? 0;
    const defaultY = pt.y ?? (pt.path && pt.path[0]?.y) ?? 0;

    if (pt.type === 'LineString' && pt.path && pt.path.length >= 2) {
      geometry = {
        type: 'LineString',
        coordinates: pt.path.map(p => [p.x ?? 0, p.y ?? 0])
      };
    } else if (pt.type === 'Polygon' && pt.path && pt.path.length >= 3) {
      // Ensure polygon is closed for valid ESRI Shapefile
      const coords = pt.path.map(p => [p.x ?? 0, p.y ?? 0]);
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]]);
      }
      geometry = {
        type: 'Polygon',
        coordinates: [coords]
      };
    } else {
      geometry = {
        type: 'Point',
        coordinates: [defaultX, defaultY]
      };
    }

    // Prepare DBF attributes table (max 10 chars per property key in Shapefile DBF)
    const props: Record<string, any> = {
      ID: String(pt.id || `P_${idx + 1}`).substring(0, 50),
      Layer: String(pt.layer || '0').substring(0, 50),
      Color: String(pt.color || '').substring(0, 20),
      Length_m: pt.length ? Number(pt.length.toFixed(2)) : 0,
      Street: String(pt.street || '').substring(0, 80),
      District: String(pt.district || '').substring(0, 80)
    };

    // Include extracted custom attributes from descriptions or attributes record
    const extracted = extractAllPointAttributes(pt);
    let attrCounter = 1;
    Object.entries(extracted).forEach(([k, v]) => {
      let cleanKey = ARABIC_KEY_MAP[k] || k.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 10);
      if (!cleanKey) {
        cleanKey = `ATTR_${attrCounter++}`;
      }
      if (props[cleanKey] === undefined) {
        props[cleanKey] = String(v || '').substring(0, 254);
      }
    });

    return {
      type: 'Feature',
      geometry,
      properties: props
    };
  });

  return {
    type: 'FeatureCollection',
    features
  };
};

/**
 * تصدير البيانات إلى ملف Shapefile بصيغة ZIP مضغوطة وتحميلها للمستخدم
 */
export const downloadShapefile = async (data: GeoPoint[], filename: string = 'Export_Shapefile') => {
  if (!data || data.length === 0) {
    alert('لا توجد بيانات متاحة للتصدير إلى Shapefile!');
    return;
  }

  try {
    const geojson = convertGeoPointsToGeoJSON(data);
    const cleanFilename = filename.split('.')[0] || 'Map_Data';

    // Generate zip array buffer using shp-write
    const zipArrayBuffer = await shpwrite.zip(geojson, {
      folder: cleanFilename,
      types: {
        point: 'points',
        polygon: 'polygons',
        line: 'lines'
      }
    });

    // Create a Blob and trigger download
    const blob = new Blob([zipArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanFilename}_SHP.zip`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err: any) {
    console.error("Shapefile export error:", err);
    throw new Error(err?.message || "Failed to generate Shapefile");
  }
};
