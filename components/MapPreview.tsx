
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { Search as SearchIcon, Loader2, MousePointerClick, Square, Trash2, CheckCircle2, Layers as LayersIcon, Map as MapIcon, Eye, EyeOff, Globe, Maximize, Navigation2, MapPin } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GeoPoint } from '../types';
import { translations, Language } from '../translations';
import { parseCoordinatesFromText } from '../services/crs';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface MapPreviewProps {
  globalBaseMap?: BaseMapType;
  points: GeoPoint[];
  lang: Language;
  dataId?: string; // Unique string that changes when a new dataset is loaded
  isSelectionMode?: boolean;
  onPolygonComplete?: (polygon: {x: number; y: number}[]) => void;
  focusedColor?: string | null;
  focusedPoint?: GeoPoint | null;
  issueItems?: GeoPoint[];
  showIssuesOnly?: boolean;
  onToggleShowIssuesOnly?: (val: boolean) => void;
  overlapResults?: import('../services/geometryService').OverlapResult[] | null;
}

/**
 * Validates if coordinates are safe for Leaflet consumption
 */
const isValidLatLng = (lat: any, lng: any): boolean => {
  return typeof lat === 'number' && typeof lng === 'number' && 
         !isNaN(lat) && !isNaN(lng) && 
         isFinite(lat) && isFinite(lng) &&
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
};

const MapPreview: React.FC<MapPreviewProps> = ({ 
  points, 
  lang, 
  dataId, 
  isSelectionMode, 
  onPolygonComplete, 
  focusedColor, 
  focusedPoint,
  issueItems,
  showIssuesOnly = false,
  onToggleShowIssuesOnly,
  overlapResults, 
  globalBaseMap 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.LayerGroup | null>(null);
  const drawLayerGroup = useRef<L.LayerGroup | null>(null);
  const currentDrawGroup = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const issueMarkersMap = useRef<Map<string | number, L.Marker | L.CircleMarker | L.Polyline>>(new Map());
  
  const isDrawingRef = useRef(false);
  const polygonCoordsRef = useRef<L.LatLng[]>([]);
  const lastDataIdRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{lat: number, lng: number} | null>(null);
  
  // Layer States
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapType>('satellite');
  
  const [showPolygons, setShowPolygons] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [showDataOverlay, setShowDataOverlay] = useState(true);

  const t = translations[lang];

  // Helper to check if point has validation issue
  const isIssuePoint = (pt: GeoPoint): boolean => {
    return Boolean(
      pt.isIssue ||
      pt.color === '#000000' ||
      pt.color === '#ef4444' ||
      (pt.layer && pt.layer.includes('MISSING')) ||
      (pt.description && pt.description.includes('[MISSING:'))
    );
  };

  // Helper functions for extracting critical attributes (Segment ID, Permit No, Diameter)
  const stripHtmlTags = (str: string): string => {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const extractSegmentId = (pt: GeoPoint): string | null => {
    if (pt.attributes) {
      for (const [k, v] of Object.entries(pt.attributes)) {
        if (v && typeof v === 'string' && v.trim() && v.trim() !== '0') {
          const key = k.toLowerCase();
          if (key.includes('segment') || key.includes('seg_') || key.includes('segid') || key.includes('شريحة') || key.includes('قطاع')) {
            const clean = stripHtmlTags(v);
            if (clean && clean !== '0' && clean.toLowerCase() !== 'null') return clean;
          }
        }
      }
    }
    if (pt.description) {
      const match = pt.description.match(/(?:segment\s*id|segment_id|segmentid|segment\s*no|seg\s*id|seg_id|segid|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|شريحة|قطاع)\s*[:=]\s*([^\r\n,;<>&|/<]+)/i);
      if (match && match[1]) {
        const clean = stripHtmlTags(match[1]);
        if (clean && clean !== '0' && clean.toLowerCase() !== 'null') return clean;
      }
    }
    return null;
  };

  const extractPermitNo = (pt: GeoPoint): string | null => {
    if (pt.attributes) {
      for (const [k, v] of Object.entries(pt.attributes)) {
        if (v && typeof v === 'string' && v.trim() && v.trim() !== '0') {
          const key = k.toLowerCase();
          if (key.includes('permit') || key.includes('تصريح') || key.includes('ترخيص')) {
            const clean = stripHtmlTags(v);
            if (clean && clean !== '0' && clean.toLowerCase() !== 'null') return clean;
          }
        }
      }
    }
    if (pt.description) {
      const match = pt.description.match(/(?:permit\s*no|permit_no|permitno|permit\s*num|permit_number|permit\s*id|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*التصريح|ترخيص|تصريح)\s*[:=]\s*([^\r\n,;<>&|/<]+)/i);
      if (match && match[1]) {
        const clean = stripHtmlTags(match[1]);
        if (clean && clean !== '0' && clean.toLowerCase() !== 'null') return clean;
      }
    }
    return null;
  };

  const extractDiameter = (pt: GeoPoint): string | null => {
    if (pt.attributes) {
      for (const [k, v] of Object.entries(pt.attributes)) {
        if (v && typeof v === 'string' && v.trim() && v.trim() !== '0') {
          const key = k.toLowerCase();
          if (key.includes('diameter') || key.includes('dia') || key.includes('dn') || key.includes('size') || key.includes('قطر') || key.includes('القطر')) {
            const clean = stripHtmlTags(v);
            if (clean && clean !== '0' && clean.toLowerCase() !== 'null') return clean;
          }
        }
      }
    }
    if (pt.description) {
      const match = pt.description.match(/(?:diameter|pipe_diameter|pipe\s*dia|dia|dn|size|القطر|قطر\s*الأنبوب|قطر\s*الأنبيب|قطر)\s*[:=]\s*([^\r\n,;<>&|/<]+)/i);
      if (match && match[1]) {
        const clean = stripHtmlTags(match[1]);
        if (clean && clean !== '0' && clean.toLowerCase() !== 'null') return clean;
      }
    }
    if (pt.attr1) {
      const match = pt.attr1.match(/(?:\bDN\s*|\b|\bقطر\s*)(\d{2,4}\s*(?:mm|مم)?)\b/i);
      if (match && match[1]) return match[1].trim();
    }
    if (pt.attr2) {
      const match = pt.attr2.match(/(?:\bDN\s*|\b|\bقطر\s*)(\d{2,4}\s*(?:mm|مم)?)\b/i);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  };

  const buildTooltipContent = (pt: GeoPoint, lang: Language, hasIssue: boolean) => {
    const segId = extractSegmentId(pt);
    const permitNo = extractPermitNo(pt);
    const diameter = extractDiameter(pt);

    let html = `<div class="p-3 bg-[#0b1329]/95 backdrop-blur-md text-white rounded-2xl border border-cyan-500/40 shadow-2xl font-sans text-xs min-w-[220px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`;
    
    html += `<div class="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-2 gap-2">
      <div class="flex items-center gap-1.5 font-bold text-amber-400 text-[12px] truncate">
        <span>📍</span>
        <span class="truncate">${pt.id}</span>
      </div>
      ${pt.layer ? `<span class="bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-semibold px-2 py-0.5 rounded-full truncate">${pt.layer}</span>` : ''}
    </div>`;

    html += `<div class="space-y-1.5 text-[11px]">`;

    if (segId) {
      html += `<div class="flex items-center justify-between gap-3 bg-purple-950/40 px-2.5 py-1 rounded-xl border border-purple-500/30">
        <span class="text-purple-200/80 font-medium">${lang === 'ar' ? 'رقم الشريحة (Segment ID):' : 'Segment ID:'}</span>
        <span class="font-bold text-purple-300">${segId}</span>
      </div>`;
    }

    if (permitNo) {
      html += `<div class="flex items-center justify-between gap-3 bg-orange-950/40 px-2.5 py-1 rounded-xl border border-orange-500/30">
        <span class="text-orange-200/80 font-medium">${lang === 'ar' ? 'رقم الترخيص (Permit):' : 'Permit No:'}</span>
        <span class="font-bold text-orange-300">${permitNo}</span>
      </div>`;
    }

    if (diameter) {
      html += `<div class="flex items-center justify-between gap-3 bg-cyan-950/40 px-2.5 py-1 rounded-xl border border-cyan-500/30">
        <span class="text-cyan-200/80 font-medium">${lang === 'ar' ? 'القطر (Diameter):' : 'Diameter:'}</span>
        <span class="font-bold text-cyan-300">${diameter}</span>
      </div>`;
    }

    if (hasIssue) {
      html += `<div class="mt-2 flex items-center justify-center gap-1.5 bg-red-500/10 px-2.5 py-1.5 rounded-xl border border-red-500/30 text-red-400 font-bold">
        <span class="animate-pulse">⚠️</span>
        <span>${lang === 'ar' ? 'تحذير: توجد ملاحظة / خطأ' : 'Warning: Issue Detected'}</span>
      </div>`;
    } else if (pt.type !== 'Polygon') {
      html += `<div class="mt-2 flex items-center justify-center gap-1.5 bg-emerald-500/10 px-2.5 py-1.5 rounded-xl border border-emerald-500/30 text-emerald-400 font-bold">
        <span>✨</span>
        <span>${lang === 'ar' ? 'مطابق وسليم' : 'Valid and Compliant'}</span>
      </div>`;
    }

    html += `</div></div>`;
    return html;
  };

  const detectedIssuePoints = useMemo(() => {
    if (issueItems && issueItems.length > 0) return issueItems;
    return points.filter(isIssuePoint);
  }, [points, issueItems]);

  const zoomToIssuesExtent = useCallback(() => {
    if (!mapInstance.current || detectedIssuePoints.length === 0) return;
    const bounds = L.latLngBounds([]);
    let validCount = 0;
    
    detectedIssuePoints.forEach(pt => {
      if (isValidLatLng(pt.y, pt.x)) {
        if (pt.path && Array.isArray(pt.path)) {
          pt.path.forEach(p => {
            if (isValidLatLng(p.y, p.x)) {
              bounds.extend([p.y, p.x]);
              validCount++;
            }
          });
        } else {
          bounds.extend([pt.y, pt.x]);
          validCount++;
        }
      }
    });

    if (validCount > 0 && bounds.isValid()) {
      mapInstance.current.fitBounds(bounds, { padding: [100, 100], maxZoom: 18, animate: true });
    }
  }, [detectedIssuePoints]);

  // Handle zooming to a single focused point (when user clicks issue item in modal)
  useEffect(() => {
    if (focusedPoint && mapInstance.current && isValidLatLng(focusedPoint.y, focusedPoint.x)) {
      mapInstance.current.flyTo([focusedPoint.y, focusedPoint.x], 18, { animate: true, duration: 1.5 });
      
      const targetMarker = issueMarkersMap.current.get(focusedPoint.id);
      if (targetMarker && 'openPopup' in targetMarker) {
        setTimeout(() => {
          (targetMarker as any).openPopup();
        }, 800);
      }
    }
  }, [focusedPoint]);

  useEffect(() => {
    if (globalBaseMap) {
      setBaseMap(globalBaseMap);
    }
  }, [globalBaseMap]);


  const baseMapConfigs: Record<BaseMapType, { url: string, name: string, icon: React.ReactNode }> = {
    satellite: { url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', name: t.layerSatellite, icon: <Globe className="w-5 h-5" /> },
    streets: { url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', name: t.layerStreets, icon: <MapIcon className="w-5 h-5" /> },
    terrain: { url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', name: t.layerTerrain, icon: <Square className="w-5 h-5" /> },
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: t.layerOSM, icon: <Globe className="w-5 h-5 opacity-50" /> }
  };

  const zoomToDataExtent = useCallback(() => {
    if (!mapInstance.current || points.length === 0) return;
    const bounds = L.latLngBounds([]);
    let validCount = 0;
    
    points.forEach(pt => { 
        const hasValidCoords = isValidLatLng(pt.y, pt.x) || (pt.path && Array.isArray(pt.path) && pt.path.some(p => isValidLatLng(p.y, p.x))); 
        if (hasValidCoords) {
            if (pt.path && Array.isArray(pt.path)) {
                pt.path.forEach(p => {
                    if (isValidLatLng(p.y, p.x)) {
                        bounds.extend([p.y, p.x]);
                        validCount++;
                    }
                });
            } else {
                bounds.extend([pt.y, pt.x]);
                validCount++;
            }
        }
    });

    if (validCount > 0 && bounds.isValid()) {
        mapInstance.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
    }
  }, [points]);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;
    
    mapInstance.current = L.map(mapContainer.current, { 
      zoomControl: false,
      attributionControl: false 
    }).setView([24.7136, 46.6753], 11);

    tileLayerRef.current = L.tileLayer(baseMapConfigs[baseMap].url, {
      maxZoom: 20,
    }).addTo(mapInstance.current);

    layerGroup.current = L.layerGroup().addTo(mapInstance.current);
    drawLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    currentDrawGroup.current = L.layerGroup().addTo(mapInstance.current);

    // Add scale bar
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(mapInstance.current);

    mapInstance.current.on('mousemove', (e: L.LeafletMouseEvent) => {
        setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) return;
      polygonCoordsRef.current = [...polygonCoordsRef.current, e.latlng];
      setHasPolygon(true);
      
      if (currentDrawGroup.current) {
        currentDrawGroup.current.clearLayers();
        const coords = polygonCoordsRef.current;
        if (coords.length > 0) {
          coords.forEach(c => L.circleMarker(c, { radius: 5, color: '#dcb13c', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(currentDrawGroup.current!));
          if (coords.length > 1) L.polyline(coords, { color: '#ffffff', weight: 3, dashArray: '5, 10' }).addTo(currentDrawGroup.current!);
          if (coords.length > 2) L.polygon(coords, { color: '#ffffff', weight: 2, fillColor: '#dcb13c', fillOpacity: 0.3 }).addTo(currentDrawGroup.current!);
        }
      }
    });

    L.control.zoom({ position: lang === 'ar' ? 'topleft' : 'topright' }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (tileLayerRef.current && mapInstance.current) {
      tileLayerRef.current.setUrl(baseMapConfigs[baseMap].url);
    }
  }, [baseMap]);

  useEffect(() => {
    if (!layerGroup.current || !mapInstance.current) return;
    if (showDataOverlay) {
        layerGroup.current.addTo(mapInstance.current);
    } else {
        layerGroup.current.remove();
    }
  }, [showDataOverlay]);

  useEffect(() => {
    if (!mapInstance.current || !layerGroup.current) return;

    layerGroup.current.clearLayers();
    issueMarkersMap.current.clear();

    if (points.length === 0) {
      lastDataIdRef.current = null;
      return;
    }

    const renderPoints = showIssuesOnly ? points.filter(isIssuePoint) : points;

    renderPoints.forEach(pt => { 
      const hasValidCoords = isValidLatLng(pt.y, pt.x) || (pt.path && Array.isArray(pt.path) && pt.path.some(p => isValidLatLng(p.y, p.x))); 
      if (hasValidCoords) { 
        const isOverlap = overlapResults?.some(o => !o.isIntersection && (String(o.id1) === String(pt.id) || String(o.id2) === String(pt.id)));
        const isIntersectionLine = overlapResults?.some(o => o.isIntersection && (String(o.id1) === String(pt.id) || String(o.id2) === String(pt.id)));
        const hasIssue = isIssuePoint(pt);
        
        let featColor = isOverlap ? '#000000' : String(pt.color || '#dcb13c').toLowerCase();
        if (hasIssue && !isOverlap) {
          featColor = pt.color === '#000000' ? '#000000' : '#ef4444';
        }
        
        let popupContent = `<div class="p-3 min-w-[240px] font-sans" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
          <div class="font-bold text-primary border-b border-slate-200 pb-2 mb-2 text-[13px] flex items-center justify-between">
            <span>${pt.id}</span>
            ${hasIssue ? `<span class="bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">⚠️ ${lang === 'ar' ? 'عنصر به ملاحظة' : 'Issue Found'}</span>` : ''}
          </div>`;
        if (hasIssue) {
          popupContent += `<div class="mb-3 p-2.5 rounded-xl bg-red-50/50 border border-red-200 text-red-700 text-[11px] font-medium space-y-1 shadow-sm">
            <div class="flex items-center gap-1.5 font-bold text-red-800">
              <span>⚠️</span>
              <span>${lang === 'ar' ? 'تفاصيل الملاحظة / التدقيق:' : 'Audit Issue Details:'}</span>
            </div>
            <p class="text-[10px] leading-relaxed text-slate-700 font-semibold">
              ${pt.issueReason || pt.description || (lang === 'ar' ? 'عنصر ناتج عن فحص البيانات' : 'Validation audit item')}
            </p>
          </div>`;
        }
        
        if (pt.street || pt.district) {
          popupContent += `<div class="space-y-1.5 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
            ${pt.street ? `<div class="text-[10px] leading-tight"><span class="text-slate-500 block font-bold uppercase mb-0.5">${lang === 'ar' ? 'الشارع' : 'Street'}</span> <span class="font-bold text-slate-800">${pt.street}</span></div>` : ''}
            ${pt.district ? `<div class="text-[10px] leading-tight"><span class="text-slate-500 block font-bold uppercase mb-0.5">${lang === 'ar' ? 'الحي' : 'District'}</span> <span class="font-bold text-slate-800">${pt.district}</span></div>` : ''}
          </div>`;
        }
        
        popupContent += `<div class="flex items-center justify-center text-[10px] text-slate-500 font-medium border-t border-slate-200 pt-2 mt-1" dir="ltr">
          <span>${pt.y.toFixed(6)}, ${pt.x.toFixed(6)}</span>
        </div></div>`;
        if (focusedColor && featColor !== String(focusedColor || '').toLowerCase() && !isOverlap && !isIntersectionLine && !hasIssue) return;
        let marker: L.Marker | L.CircleMarker | L.Polyline | L.Polygon | null = null;


        if (pt.type === 'Polygon' && pt.path && Array.isArray(pt.path)) {
          if (!showPolygons) return;
          const latLngs = pt.path
            .filter(p => isValidLatLng(p.y, p.x))
            .map(p => [p.y, p.x] as [number, number]);
          
          if (latLngs.length >= 3) {
            marker = L.polygon(latLngs, { 
              color: hasIssue ? '#ef4444' : (isOverlap ? '#000000' : '#ffffff'), 
              weight: hasIssue ? 5 : (isOverlap ? 4 : 2), 
              fillColor: hasIssue ? '#f87171' : (isOverlap ? '#9c27b0' : featColor), 
              fillOpacity: hasIssue ? 0.7 : (isOverlap ? 0.7 : 0.5)
            });
            
            if (pt.layer === 'Split Polygons' || pt.layer === 'Split Boundaries') {
              const center = (marker as L.Polygon).getBounds().getCenter();
              L.marker(center, {
                icon: L.divIcon({
                  className: 'bg-white/90 border border-slate-200 px-2 py-1 rounded-md shadow-lg text-[10px] font-black text-slate-800 whitespace-nowrap',
                  html: `<span>${pt.id}</span>`,
                  iconAnchor: [20, 10]
                })
              }).addTo(layerGroup.current!);
            }
          }
        } else if (pt.type === 'LineString' && pt.path && Array.isArray(pt.path)) {
          if (!showLines) return;
          const latLngs = pt.path
            .filter(p => isValidLatLng(p.y, p.x))
            .map(p => [p.y, p.x] as [number, number]);
          
          if (latLngs.length >= 2) {
            marker = L.polyline(latLngs, { 
              color: hasIssue ? '#dc2626' : (isOverlap ? '#000000' : featColor), 
              weight: hasIssue ? 8 : ((isOverlap || isIntersectionLine) ? 8 : 4), 
              opacity: hasIssue ? 1 : ((isOverlap || isIntersectionLine) ? 1 : 0.8),
              dashArray: hasIssue ? '10, 8' : undefined
            });

            // If feature has issue, place a prominent pulsing ⚠️ warning marker at line midpoint
            if (hasIssue) {
              const midIdx = Math.floor(latLngs.length / 2);
              const midPt = latLngs[midIdx];
              const pulseIcon = L.divIcon({
                className: 'bg-transparent border-0',
                html: `<div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
                         <div style="position:absolute; width:100%; height:100%; background-color:#ef4444; border-radius:50%; opacity:0.6; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                         <div style="position:relative; width:26px; height:26px; background-color:#dc2626; border:2px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:900; font-size:12px; box-shadow:0 4px 12px rgba(220,38,38,0.7);">⚠️</div>
                       </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                popupAnchor: [0, -18]
              });
              const pulseMarker = L.marker(midPt, { icon: pulseIcon }).addTo(layerGroup.current!);
              pulseMarker.bindPopup(popupContent);
              pulseMarker.bindTooltip(buildTooltipContent(pt, lang, hasIssue), {
                sticky: true,
                direction: 'top',
                offset: [0, -18],
                opacity: 0.98,
                className: 'leaflet-custom-tooltip-styled'
              });
              issueMarkersMap.current.set(pt.id, pulseMarker);
            }
          }
        } else {
          if (!showPoints) return;
          if (hasIssue) {
            const pulseIcon = L.divIcon({
              className: 'bg-transparent border-0',
              html: `<div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
                       <div style="position:absolute; width:100%; height:100%; background-color:#ef4444; border-radius:50%; opacity:0.6; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                       <div style="position:relative; width:26px; height:26px; background-color:#dc2626; border:2px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:900; font-size:12px; box-shadow:0 4px 12px rgba(220,38,38,0.7);">⚠️</div>
                     </div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
              popupAnchor: [0, -18]
            });
            marker = L.marker([pt.y, pt.x], { icon: pulseIcon });
          } else if (pt.iconUrl) {
            let safeUrl = pt.iconUrl;
            if (safeUrl.startsWith('http://')) safeUrl = safeUrl.replace('http://', 'https://');
            const customIcon = L.divIcon({
              className: 'bg-transparent border-0',
              html: `<div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                       <img src="${safeUrl}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                       ${pt.color ? `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background-color:${pt.color}; mix-blend-mode: multiply; -webkit-mask-image: url('${safeUrl}'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('${safeUrl}'); mask-size: contain; mask-repeat: no-repeat; mask-position: center; pointer-events: none;"></div>` : ''}
                       <div style="display:none; width:14px; height:14px; background-color:${featColor || '#3b82f6'}; border:2px solid ${isOverlap ? '#000000' : '#fff'}; border-radius:50%;"></div>
                     </div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 28],
              popupAnchor: [0, -28]
            });
            marker = L.marker([pt.y, pt.x], { icon: customIcon });
          } else {
            marker = L.circleMarker([pt.y, pt.x], { radius: isOverlap ? 10 : 7, fillColor: isOverlap ? '#9c27b0' : featColor, color: isOverlap ? '#000000' : '#fff', weight: isOverlap ? 4 : 2, fillOpacity: 1 });
          }
        }
        
        if (marker) {
          marker.bindPopup(popupContent);
          marker.bindTooltip(buildTooltipContent(pt, lang, hasIssue), {
            sticky: true,
            direction: 'top',
            offset: [0, -10],
            opacity: 0.98,
            className: 'leaflet-custom-tooltip-styled'
          });

          const baseWeight = hasIssue ? 8 : ((isOverlap || isIntersectionLine) ? 8 : (pt.type === 'Polygon' ? 2 : 4));
          marker.on('mouseover', function() {
            if ('setStyle' in this) {
              (this as any).setStyle({ weight: baseWeight + 3, opacity: 1, fillOpacity: 0.8 });
            }
          });
          marker.on('mouseout', function() {
            if ('setStyle' in this) {
              (this as any).setStyle({ weight: baseWeight, opacity: hasIssue ? 1 : ((isOverlap || isIntersectionLine) ? 1 : 0.8), fillOpacity: hasIssue ? 0.7 : (isOverlap ? 0.7 : 0.5) });
            }
          });

          layerGroup.current?.addLayer(marker);
          if (!issueMarkersMap.current.has(pt.id)) {
            issueMarkersMap.current.set(pt.id, marker);
          }
        }
      }
    });

    // Add intersection points explicitly
    if (overlapResults) {
      overlapResults.forEach(o => {
        if (o.isIntersection && o.intersectionPoint && isValidLatLng(o.intersectionPoint.y, o.intersectionPoint.x)) {
           const lat = o.intersectionPoint.y;
           const lng = o.intersectionPoint.x;
           const marker = L.circleMarker([lat, lng], { radius: 8, fillColor: '#9c27b0', color: '#ffffff', weight: 3, fillOpacity: 1 }).addTo(layerGroup.current!);
           
           marker.bindPopup(`
             <div class="p-2.5 font-sans min-w-[210px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
               <div class="font-black text-purple-700 mb-1 text-[13px] flex items-center justify-between gap-2 border-b border-purple-100 pb-1">
                 <span>📍 ${lang === 'ar' ? 'نقطة تقاطع / تداخل' : 'Intersection Point'}</span>
                 <span class="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full font-bold">${o.type || 'Intersection'}</span>
               </div>
               <div class="text-[10px] text-slate-500 font-mono mb-2 dir-ltr">
                 ${o.id1} × ${o.id2}
               </div>
               <div class="bg-purple-50/70 border border-purple-200/80 rounded-lg p-2 text-[11px] font-mono space-y-1 text-slate-800">
                 <div class="flex items-center justify-between">
                   <span class="text-slate-500 text-[10px] font-sans">${lang === 'ar' ? 'خط العرض (Lat):' : 'Latitude:'}</span>
                   <span class="font-bold text-purple-950 dir-ltr">${lat.toFixed(6)}</span>
                 </div>
                 <div class="flex items-center justify-between">
                   <span class="text-slate-500 text-[10px] font-sans">${lang === 'ar' ? 'خط الطول (Lng):' : 'Longitude:'}</span>
                   <span class="font-bold text-purple-950 dir-ltr">${lng.toFixed(6)}</span>
                 </div>
               </div>
             </div>
           `);

           marker.bindTooltip(`${lang === 'ar' ? 'نقطة تقاطع' : 'Intersection'}: Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`, {
             sticky: true,
             direction: 'top',
             offset: [0, -8],
             opacity: 0.95
           });
        }
      });
    }

    // Auto-zoom logic: Triggered when dataId changes or when new points arrive for the first time
    if (dataId && dataId !== lastDataIdRef.current) {
        zoomToDataExtent();
        lastDataIdRef.current = dataId;
    }
  }, [points, lang, focusedColor, isDrawing, dataId, zoomToDataExtent, overlapResults, showPolygons, showLines, showPoints, showIssuesOnly]);

  const toggleDrawing = () => {
    if (isDrawing) {
        isDrawingRef.current = false;
        setIsDrawing(false);
        if (polygonCoordsRef.current.length > 2) {
            if (onPolygonComplete) onPolygonComplete(polygonCoordsRef.current.map(c => ({ x: c.lng, y: c.lat })));
            if (drawLayerGroup.current && currentDrawGroup.current) {
                // We keep drawn shapes in the Splitter tab managed via App state
                // This local currentDrawGroup is just for the "active" drawing session
                currentDrawGroup.current.clearLayers();
            }
        }
    } else {
        isDrawingRef.current = true;
        setIsDrawing(true);
        polygonCoordsRef.current = [];
    }
  };

  const clearDrawing = () => {
    polygonCoordsRef.current = [];
    setHasPolygon(false);
    drawLayerGroup.current?.clearLayers();
    currentDrawGroup.current?.clearLayers();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstance.current) return;
    setIsSearching(true);
    try {
        const query = searchQuery.trim();
        const extracted = parseCoordinatesFromText(query);
        if (extracted) {
            mapInstance.current.flyTo([extracted.lat, extracted.lon], 16);
        } else {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data && data.length > 0) mapInstance.current.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 13);
        }
    } catch (e) {} finally { setIsSearching(false); }
  };

  return (
    <div className="relative w-full h-full bg-[#1b2a32] overflow-hidden">
        <style>{`
          .leaflet-tooltip.leaflet-custom-tooltip-styled {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .leaflet-tooltip.leaflet-custom-tooltip-styled::before {
            display: none !important;
          }
        `}</style>
        <div ref={mapContainer} className="w-full h-full z-0" />
        
        {/* Floating Top Banner for Issue Control */}
        {detectedIssuePoints.length > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] flex items-center gap-2 bg-[#0b2d3d]/95 backdrop-blur-md border border-rose-500/50 p-1.5 sm:p-2 rounded-2xl shadow-2xl animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/20 text-rose-300 rounded-xl text-xs font-black">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>{lang === 'ar' ? `تم رصد ${detectedIssuePoints.length} مشكلة` : `${detectedIssuePoints.length} Issues Detected`}</span>
            </div>

            <button
              onClick={() => {
                if (onToggleShowIssuesOnly) {
                  onToggleShowIssuesOnly(!showIssuesOnly);
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all border flex items-center gap-1.5",
                showIssuesOnly
                  ? "bg-rose-600 text-white border-rose-400 shadow-lg"
                  : "bg-white/10 text-white hover:bg-white/20 border-white/20"
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {showIssuesOnly
                  ? (lang === 'ar' ? 'عرض الكل' : 'Show All')
                  : (lang === 'ar' ? 'عزل المشاكل فقط' : 'Isolate Issues')}
              </span>
            </button>

            <button
              onClick={zoomToIssuesExtent}
              className="px-3 py-1.5 bg-accent text-primary hover:bg-accent/90 rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 active:scale-95"
            >
              <Maximize className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تقريب وتحديد الأماكن' : 'Zoom & Focus'}</span>
            </button>
          </div>
        )}

        {/* Layer & Control Menu */}
        <div className={cn(
            "absolute top-4 sm:top-6 z-[600] flex flex-col gap-2.5 sm:gap-3 transition-all",
            lang === 'ar' ? 'right-3 sm:right-6' : 'left-3 sm:left-6'
        )}>
            <button 
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95",
                    showLayerMenu && "ring-2 ring-accent border-accent/50"
                )}
            >
                <LayersIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button 
                onClick={zoomToDataExtent}
                disabled={points.length === 0}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t.zoomToData}
            >
                <Maximize className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            
            {showLayerMenu && (
                <div className={cn(
                    "absolute top-0 bg-white/98 backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl p-4 sm:p-7 w-64 sm:w-72 border border-white/40 animate-in fade-in zoom-in duration-200 origin-top max-h-[75vh] overflow-y-auto custom-scrollbar",
                    lang === 'ar' ? 'right-12 sm:right-16' : 'left-12 sm:left-16'
                )}>
                    <div className="flex items-center gap-2 mb-4 sm:mb-5">
                        <MapIcon className="w-4 h-4 text-accent" />
                        <h4 className="text-[10px] sm:text-[11px] font-black uppercase text-primary tracking-[0.2em]">{t.baseMaps}</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-8">
                        {(Object.keys(baseMapConfigs) as BaseMapType[]).map((key) => (
                            <button
                                key={key}
                                onClick={() => setBaseMap(key)}
                                className={cn(
                                    "flex flex-col items-center gap-3 p-4 rounded-2xl transition-all border group",
                                    baseMap === key ? "bg-accent/10 border-accent text-primary" : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-white hover:border-slate-300"
                                )}
                            >
                                <div className={cn("p-2 rounded-xl transition-all", baseMap === key ? "bg-accent text-primary" : "bg-white text-slate-300 group-hover:text-primary")}>
                                    {baseMapConfigs[key].icon}
                                </div>
                                <span className="text-[10px] font-black uppercase text-center leading-tight">{baseMapConfigs[key].name}</span>
                            </button>
                        ))}
                    </div>
                    
                    <div className="flex items-center gap-2 mb-5">
                        <Eye className="w-4 h-4 text-accent" />
                        <h4 className="text-[11px] font-black uppercase text-primary tracking-[0.2em]">{t.dataOverlay}</h4>
                    </div>

                    <button 
                        onClick={() => setShowDataOverlay(!showDataOverlay)}
                        className={cn(
                            "w-full flex items-center justify-between p-4 rounded-[1.5rem] transition-all border",
                            showDataOverlay ? "bg-primary text-white border-primary shadow-lg" : "bg-slate-50 text-slate-400 border-slate-100"
                        )}
                    >
                        <span className="text-[11px] font-black uppercase">{t.dataOverlay}</span>
                        {showDataOverlay ? <Eye className="w-5 h-5 text-accent" /> : <EyeOff className="w-5 h-5 opacity-40" />}
                    </button>
                    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100">
                        <h4 className="text-[11px] font-black uppercase text-slate-400 mb-1">{lang === 'ar' ? 'تصفية العناصر' : 'Filter Elements'}</h4>
                        <div className="grid grid-cols-3 gap-2">
                            <button 
                                onClick={() => setShowPolygons(!showPolygons)}
                                className={`py-2 px-1 rounded-xl transition-all border text-[9px] font-black uppercase flex flex-col items-center gap-1 ${showPolygons ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <Square className="w-4 h-4" />
                                {lang === 'ar' ? 'مضلعات' : 'Polygons'}
                            </button>
                            <button 
                                onClick={() => setShowLines(!showLines)}
                                className={`py-2 px-1 rounded-xl transition-all border text-[9px] font-black uppercase flex flex-col items-center gap-1 ${showLines ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <Navigation2 className="w-4 h-4" />
                                {lang === 'ar' ? 'خطوط' : 'Lines'}
                            </button>
                            <button 
                                onClick={() => setShowPoints(!showPoints)}
                                className={`py-2 px-1 rounded-xl transition-all border text-[9px] font-black uppercase flex flex-col items-center gap-1 ${showPoints ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <MapPin className="w-4 h-4" />
                                {lang === 'ar' ? 'نقاط' : 'Points'}
                            </button>
                        </div>
                    </div>

                </div>
            )}
        </div>

        {/* Cursor Coordinates Tracker */}
        {cursorCoords && (
            <div className={cn(
                "absolute bottom-2 lg:bottom-6 z-[600] px-3 py-1.5 sm:px-4 sm:py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-slate-200 text-[9px] sm:text-[10px] font-black text-slate-600 flex gap-2 sm:gap-4 animate-in fade-in duration-300 hidden sm:flex",
                lang === 'ar' ? 'left-3 sm:left-6' : 'right-3 sm:right-6'
            )} dir="ltr">
                <div className="flex items-center gap-1.5"><Navigation2 className="w-3 h-3 text-accent" /><span>{cursorCoords.lat.toFixed(6)}, {cursorCoords.lng.toFixed(6)}</span></div>
            </div>
        )}

        <div className="absolute bottom-20 lg:bottom-10 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-3 w-[92%] max-w-md pointer-events-none">
             {isSelectionMode && (
                <div className="flex gap-3 pointer-events-auto animate-in slide-in-from-bottom duration-500">
                    <button onClick={toggleDrawing} className={cn(
                        "flex items-center gap-3 px-8 py-4 rounded-3xl shadow-2xl font-black text-[12px] uppercase tracking-wider transition-all",
                        isDrawing ? "bg-red-600 text-white animate-pulse" : "bg-accent text-primary"
                    )}>
                        {isDrawing ? <CheckCircle2 className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        {isDrawing ? (lang === 'ar' ? "إنهاء الرسم الحالي" : "End Drawing") : (lang === 'ar' ? "رسم مضلع جديد" : "Draw New Area")}
                    </button>
                    <button onClick={clearDrawing} className="px-5 py-4 bg-white text-red-600 rounded-2xl shadow-2xl font-black text-xs hover:bg-red-50 transition-colors border border-red-100 active:scale-90">
                       <Trash2 className="w-5 h-5" />
                    </button>
                </div>
             )}
             
             <form onSubmit={handleSearch} className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center p-2 border border-slate-200/50 w-full pointer-events-auto ring-1 ring-black/5">
                <button type="submit" className="p-3.5 bg-primary text-white rounded-2xl shadow-lg hover:bg-secondary transition-all shrink-0 active:scale-90">
                   {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                </button>
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder={t.searchPlaceholder} 
                  className="outline-none text-[13px] px-5 py-2 w-full bg-transparent text-slate-900 font-bold placeholder:text-slate-400/60" 
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                />
             </form>
        </div>

        {isDrawing && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-[500] bg-primary/95 text-white px-8 py-5 rounded-[2rem] text-xs font-black shadow-2xl flex items-center border border-white/20 animate-bounce backdrop-blur-md">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center me-3">
                    <MousePointerClick className="w-4 h-4 text-accent" />
                </div>
                {t.drawInstruction}
            </div>
        )}
    </div>
  );
};

export default MapPreview;
