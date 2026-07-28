import * as turf from '@turf/turf';
import { GeoPoint } from '../types';

export interface ClassifiedAsset extends GeoPoint {
  district: string; // اسم المنطقة التي وقع فيها الأصل
}

/**
 * دالة تصنيف النقاط بناءً على وقوعها داخل المضلعات
 * @param targetAssets قائمة النقاط المراد تصنيفها
 * @param refZones قائمة المناطق (المضلعات)
 */
export function classifyAssetsToZones(targetAssets: GeoPoint[], refZones: GeoPoint[]): ClassifiedAsset[] {
  
  // 1. تحويل بيانات "المناطق" إلى صيغة Turf Polygons
  const zoneFeatures = refZones.map(zone => {
    if (!zone.path || zone.path.length < 3) return null;
    
    // استخراج الإحداثيات للمضلع
    const ring = zone.path.map(p => [p.x, p.y]);
    
    // شرط أساسي في GeoJSON و Turf: يجب أن تكون النقطة الأولى هي نفسها النقطة الأخيرة (لإغلاق المضلع)
    const firstPoint = ring[0];
    const lastPoint = ring[ring.length - 1];
    
    if (Math.abs(firstPoint[0] - lastPoint[0]) > 0.0000001 || 
        Math.abs(firstPoint[1] - lastPoint[1]) > 0.0000001) {
      ring.push([firstPoint[0], firstPoint[1]]);
    }

    try {
      // بناء المضلع وحفظ بياناته في الخصائص (properties)
      return turf.polygon([ring], { name: zone.id, layer: zone.layer || zone.name, color: zone.color });
    } catch (e) {
      return null;
    }
  }).filter(f => f !== null) as turf.Feature<turf.Polygon>[];


  // 2. إجراء المطابقة: التحقق من كل نقطة (Asset) أين تقع
  const classifiedResults = targetAssets.map(asset => {
    let assignedZoneName = 'غير مصنف'; // القيمة الافتراضية إذا لم تقع داخل أي منطقة
    let assignedColor = asset.color;

    try {
      let ptX = asset.x;
      let ptY = asset.y;
      
      if (typeof ptX !== 'number' || isNaN(ptX) || typeof ptY !== 'number' || isNaN(ptY)) {
          if (asset.path && asset.path.length > 0) {
              ptX = asset.path[0].x;
              ptY = asset.path[0].y;
          }
      }
      
      if (typeof ptX !== 'number' || isNaN(ptX) || typeof ptY !== 'number' || isNaN(ptY)) {
          return { 
             ...asset, 
             district: assignedZoneName,
             layer: assignedZoneName,
             color: assignedColor
          };
      }
      
      // تحويل النقطة إلى صيغة Turf Point
      const pointToCheck = turf.point([ptX, ptY]);

      // المرور على كل المناطق لمعرفة ما إذا كانت النقطة بداخل إحداها
      for (const zone of zoneFeatures) {
        if (turf.booleanPointInPolygon(pointToCheck, zone)) {
          let name = 'منطقة مصنفة';
          if (zone.properties?.layer && zone.properties?.layer !== 'undefined' && zone.properties?.layer !== 'null') {
              name = String(zone.properties.layer);
          } else if (zone.properties?.name && zone.properties?.name !== 'undefined' && zone.properties?.name !== 'null') {
              name = String(zone.properties.name);
          }
          assignedZoneName = name;
          if (zone.properties?.color) {
             assignedColor = String(zone.properties.color);
          }
          break; // بمجرد إيجاد المنطقة، نتوقف عن البحث لهذه النقطة
        }
      }
    } catch (e) {
      console.warn("خطأ في معالجة النقطة:", e);
    }

    // إرجاع النقطة مع اسم المنطقة الجديدة
    return { 
      ...asset, 
      district: assignedZoneName,
      layer: assignedZoneName,
      color: assignedColor
    };
  });

  return classifiedResults;
}
