import * as turf from '@turf/turf';
import type { BBox, Feature, Polygon } from 'geojson';
import { GeoPoint } from '../types';
import { cleanZoneValue, extractAllPointAttributes } from './parserService';

export interface ClassificationOptions {
  /** تلوين الطبقة الثانية بألوان الطبقة الأولى */
  copyColors?: boolean;
  /** كتابة جميع بيانات الطبقة الأولى على الطبقة الثانية */
  copyAttributes?: boolean;
  /** تصنيف الطبقة الثانية بنفس مجلدات الطبقة الأولى */
  copyFolders?: boolean;
  /** رؤوس أعمدة الطبقة الأولى (إن وجدت) */
  layer1Headers?: string[];
  /** رؤوس أعمدة الطبقة الثانية (إن وجدت) */
  layer2Headers?: string[];
  /** اسم المجلد الافتراضي للعناصر غير الواقعة داخل أي مضلع */
  unclassifiedFolder?: string;
}

export interface ClassifiedAsset extends GeoPoint {
  district: string; // اسم المنطقة/المجلد المصنف
  matchedZoneId?: string | number;
  matchedZoneColor?: string;
  matchedZoneFolderPath?: string[];
  matchedZoneAttributesCount?: number;
  isClassified?: boolean;
}

interface PreparedZone {
  feature: Feature<Polygon>;
  bbox: BBox;
  raw: GeoPoint;
  zoneName: string;
  zoneColor?: string;
  zoneFolderPath: string[];
  zoneLayer: string;
  extractedAttrs: Record<string, string>;
}

/**
 * استخراج جميع البيانات (Attributes) من عنصر سواء من attributes أو description أو originalRow
 */
function collectFullAttributes(pt: GeoPoint, headers?: string[]): Record<string, string> {
  const attrs: Record<string, string> = {};

  if (pt.originalRow && Array.isArray(pt.originalRow) && headers && headers.length > 0) {
    headers.forEach((h, idx) => {
      if (!h) return;
      const v = pt.originalRow![idx];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        attrs[h] = String(v).trim();
      }
    });
  }

  const extracted = extractAllPointAttributes(pt);
  Object.entries(extracted).forEach(([k, v]) => {
    if (k && v !== undefined && v !== null && String(v).trim() !== '') {
      attrs[k] = String(v).trim();
    }
  });

  return attrs;
}

/**
 * استخراج إحداثيات نقاط الفحص الممثلة للعنصر (نقطة / خط / مضلع)
 */
function getCandidateTestCoords(asset: GeoPoint): [number, number][] {
  const candidates: [number, number][] = [];
  const pushValid = (x?: number, y?: number) => {
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      if (!(x === 0 && y === 0)) {
        candidates.push([x, y]);
      }
    }
  };

  if (asset.path && Array.isArray(asset.path) && asset.path.length > 0) {
    const midIdx = Math.floor(asset.path.length / 2);
    // 1. نقطة المنتصف أولاً لأنها أدق للخطوط والمضلعات التي قد يلامس طرفها الحدود
    pushValid(asset.path[midIdx]?.x, asset.path[midIdx]?.y);
    // 2. نقطة البداية والنهاية
    pushValid(asset.path[0]?.x, asset.path[0]?.y);
    pushValid(asset.path[asset.path.length - 1]?.x, asset.path[asset.path.length - 1]?.y);
    // 3. المركز الهندسي لمسار الخط/المضلع
    let sumX = 0;
    let sumY = 0;
    let cnt = 0;
    for (const p of asset.path) {
      if (typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)) {
        sumX += p.x;
        sumY += p.y;
        cnt++;
      }
    }
    if (cnt > 0) {
      pushValid(sumX / cnt, sumY / cnt);
    }
    // 4. عينة من بقية نقاط المسار
    const step = Math.max(1, Math.floor(asset.path.length / 10));
    for (let i = 0; i < asset.path.length; i += step) {
      pushValid(asset.path[i]?.x, asset.path[i]?.y);
    }
  }

  pushValid(asset.x, asset.y);
  return candidates;
}

/**
 * دالة تصنيف عناصر الطبقة الثانية بناءً على وقوعها داخل مضلعات الطبقة الأولى (المصدر):
 * - تلوين الطبقة الثانية بألوان الطبقة الأولى
 * - كتابة جميع بيانات الطبقة الأولى على الطبقة الثانية
 * - تصنيف الطبقة الثانية بنفس مجلدات الطبقة الأولى
 */
export function classifyAssetsToZones(
  targetAssets: GeoPoint[],
  refZones: GeoPoint[],
  options: ClassificationOptions = {}
): ClassifiedAsset[] {
  const {
    copyColors = true,
    copyAttributes = true,
    copyFolders = true,
    layer1Headers,
    layer2Headers,
    unclassifiedFolder = 'غير مصنف'
  } = options;

  // 1. تجهيز مضلعات الطبقة الأولى مع كامل بياناتها وألوانها ومجلداتها
  const preparedZones: PreparedZone[] = refZones
    .map((zone) => {
      if (!zone.path || zone.path.length < 3) return null;

      const ring = zone.path
        .filter((p) => typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y))
        .map((p) => [p.x, p.y]);

      if (ring.length < 3) return null;

      const firstPoint = ring[0];
      const lastPoint = ring[ring.length - 1];
      if (
        Math.abs(firstPoint[0] - lastPoint[0]) > 1e-7 ||
        Math.abs(firstPoint[1] - lastPoint[1]) > 1e-7
      ) {
        ring.push([firstPoint[0], firstPoint[1]]);
      }

      if (ring.length < 4) return null;

      try {
        const feature = turf.polygon([ring]);
        const bbox = turf.bbox(feature);

        let rawName = 'منطقة مصنفة';
        if (zone.folderPath && zone.folderPath.length > 0) {
          rawName = String(zone.folderPath[zone.folderPath.length - 1]);
        } else if (zone.layer && zone.layer !== 'undefined' && zone.layer !== 'null') {
          rawName = String(zone.layer);
        } else if (zone.name && zone.name !== 'undefined' && zone.name !== 'null') {
          rawName = String(zone.name);
        } else if (zone.id !== undefined && zone.id !== null) {
          rawName = String(zone.id);
        }
        const zoneName = cleanZoneValue(rawName) || rawName;

        const zoneFolderPath =
          zone.folderPath && zone.folderPath.length > 0
            ? zone.folderPath.map((s) => String(s).trim()).filter(Boolean)
            : [zone.layer ? String(zone.layer).trim() : zoneName];

        const zoneLayer =
          (zone.layer && zone.layer !== 'undefined' && zone.layer !== 'null'
            ? String(zone.layer).trim()
            : zoneFolderPath[zoneFolderPath.length - 1]) || zoneName;

        const zoneColor =
          zone.color || (zone as any).originalColor || undefined;

        const extractedAttrs = collectFullAttributes(zone, layer1Headers);

        // الحرص على حفظ اسم المضلع في الخصائص إن لم يكن مضمناً
        if (zone.name && !extractedAttrs['اسم_المنطقة_المصدر'] && !extractedAttrs['ZONE'] && !extractedAttrs['Zone']) {
          extractedAttrs['اسم_المنطقة_المصدر'] = String(zone.name);
        }

        return {
          feature,
          bbox,
          raw: zone,
          zoneName,
          zoneColor,
          zoneFolderPath: zoneFolderPath.length > 0 ? zoneFolderPath : [zoneName],
          zoneLayer,
          extractedAttrs
        } as PreparedZone;
      } catch {
        return null;
      }
    })
    .filter((z): z is PreparedZone => z !== null);

  // 2. تصنيف عناصر الطبقة الثانية على الطبقة الأولى
  return targetAssets.map((asset): ClassifiedAsset => {
    const assetAttrs = collectFullAttributes(asset, layer2Headers);
    const candidates = getCandidateTestCoords(asset);

    let matchedZone: PreparedZone | null = null;

    try {
      for (const [cx, cy] of candidates) {
        const pt = turf.point([cx, cy]);
        for (const zone of preparedZones) {
          const [minX, minY, maxX, maxY] = zone.bbox;
          if (cx < minX || cx > maxX || cy < minY || cy > maxY) {
            continue;
          }
          if (turf.booleanPointInPolygon(pt, zone.feature, { ignoreBoundary: false })) {
            matchedZone = zone;
            break;
          }
        }
        if (matchedZone) break;
      }
    } catch (e) {
      console.warn('خطأ في تصنيف العنصر:', e);
    }

    if (!matchedZone) {
      return {
        ...asset,
        attributes: Object.keys(assetAttrs).length > 0 ? assetAttrs : asset.attributes,
        district: unclassifiedFolder,
        layer: copyFolders ? unclassifiedFolder : asset.layer,
        folderPath: copyFolders ? [unclassifiedFolder] : asset.folderPath,
        isClassified: false
      };
    }

    // 1) تطبيق لون الطبقة الأولى على الطبقة الثانية
    const nextColor =
      copyColors && matchedZone.zoneColor ? matchedZone.zoneColor : asset.color;
    const nextOriginalColor =
      copyColors && matchedZone.zoneColor
        ? matchedZone.zoneColor
        : (asset as any).originalColor;

    // 2) تطبيق نفس مجلدات الطبقة الأولى على الطبقة الثانية
    const nextFolderPath = copyFolders
      ? [...matchedZone.zoneFolderPath]
      : asset.folderPath;
    const nextLayer = copyFolders ? matchedZone.zoneLayer : asset.layer;

    // 3) كتابة جميع بيانات الطبقة الأولى على الطبقة الثانية
    let mergedAttrs: Record<string, string> = { ...assetAttrs };
    let nextStreet = asset.street;
    let nextDistrict = matchedZone.zoneName;
    let nextCity = asset.city;
    let nextGovernorate = asset.governorate;
    let nextAttr1 = asset.attr1;
    let nextAttr2 = asset.attr2;
    let nextDescription = asset.description;

    if (copyAttributes) {
      const isLineOrPolyAsset =
        asset.type === 'LineString' ||
        (asset.path && asset.path.length >= 2 && asset.type !== 'Polygon');

      Object.entries(matchedZone.extractedAttrs).forEach(([key, val]) => {
        if (val === undefined || val === null || String(val).trim() === '') return;

        // الحفاظ على الطول الهندسي الفعلي للخط في الطبقة الثانية وعدم استبداله بمحيط مضلع الطبقة الأولى
        const cleanKey = key.toLowerCase().replace(/[\s_#-]/g, '');
        if (
          isLineOrPolyAsset &&
          (cleanKey === 'shapelength' || cleanKey === 'actuallength') &&
          mergedAttrs[key]
        ) {
          return;
        }

        mergedAttrs[key] = String(val);
      });

      if (matchedZone.raw.street) nextStreet = matchedZone.raw.street;
      if (matchedZone.raw.district) nextDistrict = matchedZone.raw.district;
      if (matchedZone.raw.city) nextCity = matchedZone.raw.city;
      if (matchedZone.raw.governorate) nextGovernorate = matchedZone.raw.governorate;
      if (matchedZone.raw.attr1) nextAttr1 = matchedZone.raw.attr1;
      if (matchedZone.raw.attr2) nextAttr2 = matchedZone.raw.attr2;

      // دمج أو تحديث الوصف النصي بحيث يعكس بيانات الطبقة الأولى
      const zoneDesc = matchedZone.raw.description ? String(matchedZone.raw.description).trim() : '';
      if (zoneDesc) {
        nextDescription = zoneDesc;
      }
    }

    return {
      ...asset,
      color: nextColor,
      originalColor: nextOriginalColor,
      layer: nextLayer,
      folderPath: nextFolderPath,
      district: nextDistrict,
      street: nextStreet,
      city: nextCity,
      governorate: nextGovernorate,
      attr1: nextAttr1,
      attr2: nextAttr2,
      description: nextDescription,
      attributes: mergedAttrs,
      // مسح originalRow القديم بعد دمجه في attributes لتجنب ظهور صفوف ناقصة بدون بيانات الطبقة الأولى عند التصدير
      originalRow: undefined,
      matchedZoneId: matchedZone.raw.id,
      matchedZoneColor: matchedZone.zoneColor,
      matchedZoneFolderPath: [...matchedZone.zoneFolderPath],
      matchedZoneAttributesCount: Object.keys(matchedZone.extractedAttrs).length,
      isClassified: true
    };
  });
}
