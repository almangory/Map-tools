
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { 
  Search as SearchIcon, Loader2, MousePointerClick, Square, Trash2, 
  CheckCircle2, Layers as LayersIcon, Map as MapIcon, Eye, EyeOff, 
  Globe, Maximize, Download, Navigation2, MapPin, RotateCcw, Info, 
  X, Sparkles, Compass, Mountain, Activity, ArrowDownRight, Waves, 
  FileSpreadsheet, ChevronDown, ChevronUp, Gauge, Droplet, Ruler
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  GeoPoint, BaseMapType, HydraulicNetworkSummary, 
  HydraulicColorMode, AsphaltCalculationParams, PipeHydraulicData 
} from '../types';
import { translations, Language } from '../translations';
import { parseCoordinatesFromText } from '../services/crs';
import { NetworkFlowAnalysis } from '../services/flowDirectionService';
import { 
  analyzeNetworkHydraulics, exportHydraulicFlowExcel, 
  DEFAULT_ASPHALT_PARAMS, DEFAULT_MANNING_N 
} from '../services/hydraulicService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface MapPreviewProps {
  onPointClick?: (pt: GeoPoint) => void;
  layerOpacity?: number;
  is3DMode?: boolean;
  globalBaseMap?: BaseMapType;
  points: GeoPoint[];
  lang: Language;
  dataId?: string; // Unique string that changes when a new dataset is loaded
  isSelectionMode?: boolean;
  onPolygonComplete?: (polygon: {x: number; y: number}[]) => void;
  focusedColor?: string | null;
  focusedPoint?: GeoPoint | null;
  selectedProfilePoints?: GeoPoint[];
  hoveredElevationPoint?: {lat: number, lng: number, z?: number, dist?: number, slope?: number} | null;
  issueItems?: GeoPoint[];
  showIssuesOnly?: boolean;
  onToggleShowIssuesOnly?: (val: boolean) => void;
  overlapResults?: import('../services/geometryService').OverlapResult[] | null;
  onClearAudit?: () => void;
  showFlowDirection?: boolean;
  onToggleFlowDirection?: (val: boolean) => void;
  flowAnalysis?: NetworkFlowAnalysis | null;
  
  // Hydraulic & Asphalt props
  hydraulicSummary?: HydraulicNetworkSummary | null;
  hydraulicColorMode?: HydraulicColorMode;
  onSetHydraulicColorMode?: (mode: HydraulicColorMode) => void;
  asphaltParams?: AsphaltCalculationParams;
  manningN?: number;
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
  selectedProfilePoints = [],
  hoveredElevationPoint,
  issueItems,
  showIssuesOnly = false,
  onToggleShowIssuesOnly,
  overlapResults, 
  globalBaseMap,
  layerOpacity = 1,
  is3DMode = false,
  onClearAudit,
  onPointClick,
  showFlowDirection = false,
  onToggleFlowDirection,
  flowAnalysis,
  hydraulicSummary: propHydraulicSummary,
  hydraulicColorMode: propHydraulicColorMode,
  onSetHydraulicColorMode,
  asphaltParams = DEFAULT_ASPHALT_PARAMS,
  manningN = DEFAULT_MANNING_N
}) => {

  useEffect(() => {
    if (!mapInstance.current) return;

    if (hoveredElevationPoint && isValidLatLng(hoveredElevationPoint.lat, hoveredElevationPoint.lng)) {
      const { lat, lng, z, dist, slope } = hoveredElevationPoint;
      const zText = z !== undefined ? `${z.toFixed(2)} ${lang === 'ar' ? 'م' : 'm'}` : '';
      const distText =
        dist !== undefined
          ? dist >= 1000
            ? `${(dist / 1000).toFixed(2)} ${lang === 'ar' ? 'كم' : 'km'}`
            : `${dist.toFixed(0)} ${lang === 'ar' ? 'م' : 'm'}`
          : '';
      const slopeText = slope !== undefined ? `${slope.toFixed(1)}%` : '0.0%';

      // Ensure map pans if point is off-screen
      const bounds = mapInstance.current.getBounds();
      if (!bounds.contains([lat, lng])) {
        mapInstance.current.panTo([lat, lng], { animate: true, duration: 0.15 });
      }

      const iconHtml = `
        <div style="width: 200px; height: 110px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; pointer-events: none;">
          <!-- Google Earth Floating Label Stack -->
          <div style="background-color: rgba(10, 20, 28, 0.95); border: 2px solid #ef4444; color: #ffffff; padding: 5px 10px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.8); text-align: center; white-space: nowrap; margin-bottom: 2px;">
            <div style="font-weight: 900; font-size: 13px; color: #ffffff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
              ${zText}
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 800; font-size: 11px; color: #e2e8f0; margin-top: 2px;">
              ${distText ? `<span>${distText}</span>` : ''}
              <span style="background-color: #991b1b; color: #fef2f2; padding: 1px 6px; border-radius: 6px; font-weight: 900; border: 1px solid #ef4444;">${slopeText}</span>
            </div>
          </div>

          <!-- Google Earth Signature Red Pointer Arrow -->
          <div style="width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent; border-top: 20px solid #dc2626; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.9));"></div>

          <!-- Target Ground Ring -->
          <div style="position: relative; width: 16px; height: 16px; margin-top: -2px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 22px; height: 22px; background-color: #ef4444; border-radius: 50%; opacity: 0.8; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 12px; height: 12px; background-color: #dc2626; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 12px #ef4444;"></div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'leaflet-hover-pointer-icon',
        html: iconHtml,
        iconSize: [200, 110],
        iconAnchor: [100, 110]
      });

      if (hoverMarkerRef.current) {
        mapInstance.current.removeLayer(hoverMarkerRef.current);
        hoverMarkerRef.current = null;
      }

      hoverMarkerRef.current = L.marker([lat, lng], {
        icon: customIcon,
        interactive: false,
        zIndexOffset: 20000
      }).addTo(mapInstance.current);
    } else {
      if (hoverMarkerRef.current && mapInstance.current) {
        mapInstance.current.removeLayer(hoverMarkerRef.current);
        hoverMarkerRef.current = null;
      }
    }
  }, [hoveredElevationPoint, lang]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.LayerGroup | null>(null);
  const drawLayerGroup = useRef<L.LayerGroup | null>(null);
  const currentDrawGroup = useRef<L.LayerGroup | null>(null);
  const hoverMarkerRef = useRef<L.Marker | null>(null);
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
  const [showFlowInfoOverlay, setShowFlowInfoOverlay] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapType>('satellite');
  
  // Hydraulic States
  const [localHydraulicColorMode, setLocalHydraulicColorMode] = useState<HydraulicColorMode>('default');
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  
  const activeColorMode = propHydraulicColorMode || localHydraulicColorMode;
  
  const handleColorModeChange = (mode: HydraulicColorMode) => {
    setLocalHydraulicColorMode(mode);
    if (onSetHydraulicColorMode) {
      onSetHydraulicColorMode(mode);
    }
  };

  // Reset coloring mode to original file colors when a new dataset is loaded
  useEffect(() => {
    if (dataId) {
      setLocalHydraulicColorMode('default');
    }
  }, [dataId]);

  const activeHydraulicSummary = useMemo(() => {
    if (propHydraulicSummary) return propHydraulicSummary;
    return analyzeNetworkHydraulics(points, flowAnalysis, manningN, asphaltParams);
  }, [points, flowAnalysis, manningN, asphaltParams, propHydraulicSummary]);
  
  const [showPolygons, setShowPolygons] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [showOutfalls, setShowOutfalls] = useState(true);
  const [showDataOverlay, setShowDataOverlay] = useState(true);

  const t = translations[lang];

  // Helper to check if point has validation issue
  const isIssuePoint = (pt: GeoPoint): boolean => {
    return Boolean(
      pt.isIssue ||
      Boolean(pt.issueReason && pt.issueReason.trim()) ||
      (pt.layer && pt.layer.includes('_MISSING_ATTRS')) ||
      (pt.description && pt.description.includes('[MISSING:'))
    );
  };

  const getIssueReasonText = (pt: GeoPoint, language: 'ar' | 'en'): string => {
    if (pt.issueReason && pt.issueReason.trim()) {
      return pt.issueReason.trim();
    }
    if (pt.description && pt.description.includes('[MISSING:')) {
      const match = pt.description.match(/\[MISSING:\s*([^\]]+)\]/i);
      if (match && match[1]) {
        return language === 'ar' 
          ? `عنصر ينقصه البيانات التالية: (${match[1]})` 
          : `Element missing required fields: (${match[1]})`;
      }
    }
    if (pt.layer && pt.layer.includes('_MISSING_ATTRS')) {
      return language === 'ar' 
        ? 'عنصر ينقصه القطر أو المنطقة (Diameter / Zone)' 
        : 'Missing Diameter or Zone attributes';
    }
    if (pt.isIssue) {
      return language === 'ar' 
        ? 'ملاحظة تدقيق في بيانات العنصر' 
        : 'Data validation audit issue';
    }
    return '';
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
    const pipeHyd = activeHydraulicSummary.pipesMap.get(pt.id) || activeHydraulicSummary.pipesMap.get(String(pt.id)) || (typeof pt.id === 'number' ? activeHydraulicSummary.pipesMap.get(Number(pt.id)) : undefined);

    let html = `<div class="p-3 bg-[#0b1329]/95 backdrop-blur-md text-white rounded-2xl border border-cyan-500/40 shadow-2xl font-sans text-xs min-w-[240px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`;
    
    html += `<div class="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-2 gap-2">
      <div class="flex items-center gap-1.5 font-bold text-amber-400 text-[12px] truncate">
        <span>📍</span>
        <span class="truncate">${pt.id}</span>
      </div>
      ${pt.layer ? `<span class="bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-semibold px-2 py-0.5 rounded-full truncate">${pt.layer}</span>` : ''}
    </div>`;

    html += `<div class="space-y-1.5 text-[11px]">`;

    if (pipeHyd && showFlowDirection) {
      html += `<div class="p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/40 space-y-1 my-1">
        <div class="flex items-center justify-between">
          <span class="text-cyan-300 font-bold">🌊 ${lang === 'ar' ? 'سرعة التدفق (V):' : 'Velocity:'}</span>
          <span class="font-mono font-black" style="color: ${pipeHyd.velocityColor}">${pipeHyd.velocity.toFixed(2)} m/s</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-white/70">${lang === 'ar' ? 'الحالة:' : 'Status:'}</span>
          <span class="font-bold px-1.5 py-0.5 rounded text-[9px]" style="background-color: ${pipeHyd.velocityColor}33; color: ${pipeHyd.velocityColor}; border: 1px solid ${pipeHyd.velocityColor}66;">
            ${lang === 'ar' ? pipeHyd.statusBadgeAr : pipeHyd.statusBadgeEn}
          </span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-white/70">${lang === 'ar' ? 'التصريف (Q_full):' : 'Max Q:'}</span>
          <span class="font-mono font-bold text-blue-300">${pipeHyd.maxCapacityLs.toFixed(1)} L/s</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-white/70">${lang === 'ar' ? 'التصريف 75%:' : 'Design Q75%:'}</span>
          <span class="font-mono font-bold text-emerald-300">${pipeHyd.designCapacity75Ls.toFixed(1)} L/s</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-white/70">${lang === 'ar' ? 'الميل (Slope):' : 'Slope:'}</span>
          <span class="font-mono font-bold text-white">${pipeHyd.slopePercent.toFixed(2)}%</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-white/70">${lang === 'ar' ? 'الأسفلت:' : 'Asphalt:'}</span>
          <span class="font-mono font-bold text-amber-300">${pipeHyd.asphaltAreaM2.toFixed(1)} m² (${pipeHyd.asphaltVolumeM3.toFixed(2)} m³)</span>
        </div>
      </div>`;
    }

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

    if (diameter && (!pipeHyd || !showFlowDirection)) {
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
    return (points || []).filter(isIssuePoint);
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
    if (!mapInstance.current) return;
    const panes = ['overlayPane', 'markerPane', 'shadowPane', 'popupPane'];
    panes.forEach(pane => {
      const el = mapInstance.current.getPane(pane);
      if (el) {
        el.style.opacity = layerOpacity.toString();
      }
    });
  }, [layerOpacity]);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (is3DMode) {
      mapContainer.current.style.transform = 'perspective(1000px) rotateX(60deg) scale(1.1)';
      mapContainer.current.style.transformOrigin = 'center 70%';
    } else {
      mapContainer.current.style.transform = 'none';
    }
  }, [is3DMode]);

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


  const exportMapToSVG = useCallback(() => {
    if (!mapInstance.current) return;
    const svgElement = document.querySelector('.leaflet-overlay-pane svg');
    if (!svgElement) {
      alert(lang === 'ar' ? 'لا توجد بيانات متجهية (Vector) لتصديرها بصيغة SVG.' : 'No vector data found to export as SVG.');
      return;
    }
    
    const clonedSvg = svgElement.cloneNode(true) as Element;
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const container = mapInstance.current.getContainer();
    const mapWidth = container?.clientWidth || 1200;
    const mapHeight = container?.clientHeight || 800;

    clonedSvg.setAttribute('width', String(mapWidth));
    clonedSvg.setAttribute('height', String(mapHeight));
    if (!clonedSvg.getAttribute('viewBox')) {
      clonedSvg.setAttribute('viewBox', `0 0 ${mapWidth} ${mapHeight}`);
    }

    // Export Flow Direction Arrows & Outfall Nodes if Flow Analysis is Active
    if (showFlowDirection && mapInstance.current) {
      const arrowsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      arrowsGroup.setAttribute('id', 'flow-direction-arrows-layer');

      if (showLines !== false && points && points.length > 0) {
        points.forEach(pt => {
          if (pt.type === 'LineString' && pt.path && Array.isArray(pt.path)) {
            const segResult = flowAnalysis?.segments.get(pt.id) || 
                              flowAnalysis?.segments.get(String(pt.id)) || 
                              (typeof pt.id === 'number' ? flowAnalysis?.segments.get(Number(pt.id)) : undefined);
            
            let activePath = pt.path;
            if (segResult?.directedPath) {
              activePath = segResult.directedPath;
            }

            const latLngs = activePath
              .filter(p => isValidLatLng(p.y, p.x))
              .map(p => [p.y, p.x] as [number, number]);

            if (latLngs.length >= 2) {
              const layerPts = latLngs.map(l => mapInstance.current!.latLngToLayerPoint(l));

              // End vertex arrow (p2)
              const p1 = layerPts[layerPts.length - 2];
              const p2 = layerPts[layerPts.length - 1];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
              const rot = angleDeg + 90;

              const arrowG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              arrowG.setAttribute('transform', `translate(${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}) rotate(${rot.toFixed(2)})`);
              arrowG.innerHTML = `
                <g transform="translate(-11, -11)">
                  <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
                </g>
              `;
              arrowsGroup.appendChild(arrowG);

              // Segment midpoint arrows for longer segments (> 25px)
              for (let i = 0; i < layerPts.length - 1; i++) {
                const s1 = layerPts[i];
                const s2 = layerPts[i + 1];
                const sdx = s2.x - s1.x;
                const sdy = s2.y - s1.y;
                const segDist = Math.hypot(sdx, sdy);

                if (segDist > 25) {
                  const midX = (s1.x + s2.x) / 2;
                  const midY = (s1.y + s2.y) / 2;
                  const segAngleDeg = Math.atan2(sdy, sdx) * (180 / Math.PI);
                  const segRot = segAngleDeg + 90;

                  const midArrowG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                  midArrowG.setAttribute('transform', `translate(${midX.toFixed(2)}, ${midY.toFixed(2)}) rotate(${segRot.toFixed(2)})`);
                  midArrowG.innerHTML = `
                    <g transform="translate(-10, -10)">
                      <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#ef4444" stroke="#ffffff" stroke-width="1.5" transform="scale(0.85)"/>
                    </g>
                  `;
                  arrowsGroup.appendChild(midArrowG);
                }
              }
            }
          }
        });
      }
      clonedSvg.appendChild(arrowsGroup);

      // Add Outfall Nodes
      if (flowAnalysis?.outfallNodes && flowAnalysis.outfallNodes.length > 0) {
        const outfallsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        outfallsGroup.setAttribute('id', 'outfall-nodes-layer');

        flowAnalysis.outfallNodes.forEach(outfallNode => {
          if (isValidLatLng(outfallNode.y, outfallNode.x)) {
            const pt = mapInstance.current!.latLngToLayerPoint([outfallNode.y, outfallNode.x]);
            const outfallG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            outfallG.setAttribute('transform', `translate(${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
            outfallG.innerHTML = `
              <circle r="18" fill="#06b6d4" fill-opacity="0.3" stroke="#0284c7" stroke-width="1.5" />
              <circle r="12" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
              <path d="M-6 2 C-4 0, -2 0, 0 2 C2 4, 4 4, 6 2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
              <path d="M-6 -2 C-4 -4, -2 -4, 0 -2 C2 0, 4 0, 6 -2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
            `;
            outfallsGroup.appendChild(outfallG);
          }
        });
        clonedSvg.appendChild(outfallsGroup);
      }
    }
    
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);
    if (!source.match(/^<\?xml/)) {
      source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    }
    
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `geogis-map-flow-export-${new Date().getTime()}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [lang, points, showFlowDirection, flowAnalysis, showLines]);

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
        const issueReasonText = getIssueReasonText(pt, lang);
        
        let featColor = isOverlap ? '#000000' : String(pt.color || '#dcb13c').toLowerCase();
        if (hasIssue && !isOverlap) {
          featColor = pt.color === '#000000' ? '#000000' : '#ef4444';
        }
        
        let popupContent = `<div class="p-3 min-w-[240px] font-sans" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
          <div class="font-bold text-primary border-b border-slate-200 pb-2 mb-2 text-[13px] flex items-center justify-between">
            <span>${pt.id}</span>
            ${hasIssue && issueReasonText ? `<span class="bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">⚠️ ${lang === 'ar' ? 'عنصر به ملاحظة' : 'Issue Found'}</span>` : ''}
          </div>`;
        if (hasIssue && issueReasonText) {
          popupContent += `<div class="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[11px] font-medium space-y-1 shadow-sm">
            <div class="flex items-center gap-1.5 font-bold text-red-800 border-b border-red-200/60 pb-1 mb-1">
              <span>⚠️</span>
              <span>${lang === 'ar' ? 'نوع الملاحظة / التدقيق:' : 'Audit Issue Type:'}</span>
            </div>
            <p class="text-[11px] leading-relaxed text-red-950 font-black">
              ${issueReasonText}
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
          
          const segResult = flowAnalysis?.segments.get(pt.id) || flowAnalysis?.segments.get(String(pt.id)) || (typeof pt.id === 'number' ? flowAnalysis?.segments.get(Number(pt.id)) : undefined);
          const isFlowActive = showFlowDirection;

          // Determine directed path for flow animation (if reversed, reverse vertices so stroke moves towards outfall)
          let activePath = pt.path;
          if (isFlowActive && segResult?.directedPath) {
            activePath = segResult.directedPath;
          }

          const latLngs = activePath
            .filter(p => isValidLatLng(p.y, p.x))
            .map(p => [p.y, p.x] as [number, number]);
          
          if (latLngs.length >= 2) {
            const isProfileSelected = selectedProfilePoints?.some(sp => sp.id === pt.id);
            const profileSeqIndex = selectedProfilePoints ? selectedProfilePoints.findIndex(sp => sp.id === pt.id) : -1;

            const pipeHyd = activeHydraulicSummary.pipesMap.get(pt.id) || activeHydraulicSummary.pipesMap.get(String(pt.id)) || (typeof pt.id === 'number' ? activeHydraulicSummary.pipesMap.get(Number(pt.id)) : undefined);

            if (isFlowActive && pipeHyd) {
              popupContent += `<div class="mb-3 p-3 rounded-2xl bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900 text-[11px] font-medium space-y-2 shadow-xl border border-cyan-500/40 text-white">
                <div class="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 font-bold">
                  <span class="text-cyan-300 flex items-center gap-1">🌊 ${lang === 'ar' ? 'الخصائص الهيدروليكية (معادلة مانينغ):' : 'Hydraulic Flow (Manning):'}</span>
                  <span class="text-[9.5px] px-2 py-0.5 rounded-full font-bold shadow" style="background-color: ${pipeHyd.velocityColor}33; color: ${pipeHyd.velocityColor}; border: 1px solid ${pipeHyd.velocityColor}66;">
                    ${lang === 'ar' ? pipeHyd.statusBadgeAr : pipeHyd.statusBadgeEn}
                  </span>
                </div>
                
                <div class="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'السرعة V:' : 'Velocity:'}</span> <b style="color:${pipeHyd.velocityColor}" class="font-mono">${pipeHyd.velocity.toFixed(2)} m/s</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'القطر D:' : 'Diameter:'}</span> <b class="text-white font-mono">${pipeHyd.diameterMm} mm</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'الميل S:' : 'Slope:'}</span> <b class="text-white font-mono">${pipeHyd.slopePercent.toFixed(2)}%</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'التصريف Q:' : 'Max Q:'}</span> <b class="text-blue-300 font-mono">${pipeHyd.maxCapacityLs.toFixed(1)} L/s</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5 col-span-2"><span class="text-white/60">${lang === 'ar' ? 'التصريف 75%:' : 'Design Q75%:'}</span> <b class="text-emerald-300 font-mono">${pipeHyd.designCapacity75Ls.toFixed(1)} L/s</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5 col-span-2"><span class="text-white/60">${lang === 'ar' ? 'الاتجاه:' : 'Direction:'}</span> <b class="text-cyan-200 font-mono">${pipeHyd.flowDirectionTextAr}</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5 col-span-2 flex items-center justify-between"><span class="text-white/60">${lang === 'ar' ? 'الأسفلت (أمانة الرياض):' : 'Asphalt:'}</span> <span class="font-mono font-bold text-amber-300">${pipeHyd.asphaltAreaM2.toFixed(1)} m² | ${pipeHyd.asphaltVolumeM3.toFixed(2)} m³</span></div>
                </div>
              </div>`;
            } else if (isFlowActive && segResult) {
              const priorityBadgeBg = segResult.priority === 1 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : (segResult.priority === 2 ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40');
              const priorityBoxBorder = segResult.priority === 1 ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200' : (segResult.priority === 2 ? 'bg-amber-950/80 border-amber-500/40 text-amber-200' : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-200');

              popupContent += `<div class="mb-3 p-2.5 rounded-xl ${priorityBoxBorder} text-[11px] font-medium space-y-1 shadow-md border">
                <div class="flex items-center justify-between border-b border-white/10 pb-1 mb-1 font-bold">
                  <span>🌊 ${lang === 'ar' ? 'اتجاه التدفق الهيدروليكي' : 'Flow Direction'}</span>
                  <span class="text-[9.5px] px-2 py-0.5 rounded-full border ${priorityBadgeBg}">${segResult.priorityLabelAr}</span>
                </div>
                <div class="text-[10.5px]"><b>${lang === 'ar' ? 'السبب المعياري:' : 'Logic Reason:'}</b> ${segResult.directionReasonAr}</div>
                <div class="text-[10px] opacity-90"><b>${lang === 'ar' ? 'توجيه المسار:' : 'Path Order:'}</b> ${segResult.isReversed ? (lang === 'ar' ? 'معكوس ليطابق اتجاه الصب (Reversed)' : 'Reversed to match downstream flow') : (lang === 'ar' ? 'مطابق للرسم الاصلي (Forward)' : 'Matches original digitizing direction')}</div>
              </div>`;
            }

            // Determine line color by activeColorMode independently of flow direction
            let flowLineColor = featColor || '#06b6d4';
            let flowAnimClass = isFlowActive ? 'flow-anim-optimal' : undefined;

            if (activeColorMode === 'velocity') {
              if (pipeHyd) {
                flowLineColor = pipeHyd.velocityColor;
                flowAnimClass = isFlowActive ? pipeHyd.animationClass : undefined;
              } else {
                flowLineColor = '#00E676';
              }
            } else if (activeColorMode === 'priority') {
              if (pipeHyd) {
                if (pipeHyd.priority === 1) flowLineColor = '#22c55e';
                else if (pipeHyd.priority === 2) flowLineColor = '#f59e0b';
                else flowLineColor = '#06b6d4';
              } else if (segResult) {
                if (segResult.priority === 1) flowLineColor = '#22c55e';
                else if (segResult.priority === 2) flowLineColor = '#f59e0b';
                else flowLineColor = '#06b6d4';
              } else {
                flowLineColor = '#06b6d4';
              }
            } else if (activeColorMode === 'diameter') {
              if (pipeHyd) {
                if (pipeHyd.diameterMm <= 200) flowLineColor = '#06b6d4';
                else if (pipeHyd.diameterMm <= 400) flowLineColor = '#3b82f6';
                else if (pipeHyd.diameterMm <= 600) flowLineColor = '#8b5cf6';
                else flowLineColor = '#ec4899';
              } else {
                flowLineColor = featColor || '#06b6d4';
              }
            } else {
              // 'default' mode: Preserve original layer/file colors
              flowLineColor = featColor || '#06b6d4';
            }

            // Determine final display color
            const polylineColor = isProfileSelected 
              ? '#dcb13c' 
              : (hasIssue 
                ? '#dc2626' 
                : (isOverlap 
                  ? '#000000' 
                  : (activeColorMode !== 'default' ? flowLineColor : (isFlowActive ? '#00E676' : featColor))));

            marker = L.polyline(latLngs, { 
              color: polylineColor, 
              weight: isProfileSelected ? 10 : (hasIssue ? 8 : ((isOverlap || isIntersectionLine) ? 8 : (isFlowActive ? 6 : 3))), 
              opacity: isProfileSelected ? 1 : (hasIssue ? 1 : ((isOverlap || isIntersectionLine) ? 1 : (isFlowActive ? 0.95 : 0.8))),
              dashArray: isFlowActive ? '8, 12' : (hasIssue ? '10, 8' : undefined),
              className: isFlowActive ? (flowAnimClass || 'flow-anim-optimal') : undefined
            });

            // If flow direction is active, add downstream directional arrow in RED
            if (isFlowActive && latLngs.length >= 2) {
              const p1 = latLngs[latLngs.length - 2];
              const p2 = latLngs[latLngs.length - 1];
              const dy = p2[0] - p1[0];
              const dx = (p2[1] - p1[1]) * Math.cos((p1[0] * Math.PI) / 180);
              const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
              const arrowIcon = L.divIcon({
                className: 'bg-transparent border-0',
                html: `<div style="transform: rotate(${90 - angleDeg}deg); width:22px; height:22px; display:flex; align-items:center; justify-content:center; filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.95));">
                         <svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="1.5" width="22" height="22">
                           <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                         </svg>
                       </div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
              });
              L.marker(p2, { icon: arrowIcon, interactive: false }).addTo(layerGroup.current!);
            }

            // If feature is selected in profile, place a sequence badge at the midpoint
            if (isProfileSelected && profileSeqIndex !== -1) {
              const midIdx = Math.floor(latLngs.length / 2);
              const midPt = latLngs[midIdx];
              const badgeIcon = L.divIcon({
                className: 'bg-transparent border-0',
                html: `<div style="position:relative; display:flex; align-items:center; justify-content:center; width:28px; height:28px; background-color:#dcb13c; color:#0b2d3d; font-weight:900; font-size:12px; border:2px solid #ffffff; border-radius:9999px; box-shadow:0 4px 12px rgba(220,177,60,0.8);">#${profileSeqIndex + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
              });
              L.marker(midPt, { icon: badgeIcon, interactive: false }).addTo(layerGroup.current!);
            }

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
          marker.on('click', () => { onPointClick?.(pt); });
          marker.bindTooltip(buildTooltipContent(pt, lang, hasIssue), {
            sticky: true,
            direction: 'top',
            offset: [0, -10],
            opacity: 0.98,
            className: 'leaflet-custom-tooltip-styled'
          });

          const baseWeight = hasIssue ? 8 : ((isOverlap || isIntersectionLine) ? 8 : (pt.type === 'Polygon' ? 2 : 3));
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
             <div class="p-2 font-mono text-center text-purple-950 font-bold text-[13px] dir-ltr">
               ${lat.toFixed(6)}, ${lng.toFixed(6)}
             </div>
           `);

           marker.bindTooltip(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, {
             sticky: true,
             direction: 'top',
             offset: [0, -8],
             opacity: 0.95
           });
        }
      });
    }

    // Render Outfall Destination Nodes when Flow Direction and Outfalls are enabled
    if (showFlowDirection && showOutfalls && flowAnalysis?.outfallNodes) {
      flowAnalysis.outfallNodes.forEach(outfallNode => {
        if (!isValidLatLng(outfallNode.y, outfallNode.x)) return;

        const outfallHtml = `
          <div style="position:relative; width:22px; height:22px; display:flex; align-items:center; justify-content:center;">
            <div class="leaflet-outfall-pulse-bg" style="position:absolute; width:100%; height:100%; border:1.5px solid #06b6d4; border-radius:50%;"></div>
            <div style="position:relative; width:20px; height:20px; background:linear-gradient(135deg, #0284c7, #06b6d4); border:1.5px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:10px; box-shadow:0 2px 8px rgba(0,0,0,0.6);">
              🌊
            </div>
          </div>
        `;

        const outfallIcon = L.divIcon({
          className: 'bg-transparent border-0',
          html: outfallHtml,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        const outfallMarker = L.marker([outfallNode.y, outfallNode.x], { icon: outfallIcon, zIndexOffset: 15000 });
        outfallMarker.bindPopup(`
          <div class="p-3 bg-[#081e2b] text-white rounded-2xl font-sans min-w-[200px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
            <div class="flex items-center gap-2 text-cyan-400 font-bold border-b border-cyan-500/30 pb-2 mb-2 text-xs">
              <span>🌊</span>
              <span>${lang === 'ar' ? 'نقطة المصب النهائية' : 'Outfall Terminal Node'}</span>
            </div>
            <div class="text-[11px] space-y-1 text-slate-200">
              <div><b>${lang === 'ar' ? 'معرف المصب' : 'Outfall ID'}:</b> <span class="font-bold text-amber-300">${outfallNode.id}</span></div>
              <div><b>${lang === 'ar' ? 'عدد الأنابيب الصابة' : 'Inflow Pipes'}:</b> <span class="font-bold text-cyan-300">${outfallNode.inflowCount}</span></div>
              <div class="text-[10px] text-cyan-400/80 dir-ltr font-mono mt-1">${outfallNode.y.toFixed(6)}, ${outfallNode.x.toFixed(6)}</div>
            </div>
          </div>
        `);
        outfallMarker.addTo(layerGroup.current!);
      });
    }

    // Auto-zoom logic: Triggered when dataId changes or when new points arrive for the first time
    if (dataId && dataId !== lastDataIdRef.current) {
        zoomToDataExtent();
        lastDataIdRef.current = dataId;
    }
  }, [points, lang, focusedColor, isDrawing, dataId, zoomToDataExtent, overlapResults, showPolygons, showLines, showPoints, showOutfalls, showIssuesOnly, selectedProfilePoints, showFlowDirection, flowAnalysis, activeColorMode, activeHydraulicSummary]);

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
        
        {/* Floating Top Banner for Issue & Auto-Audit Control */}
        {(detectedIssuePoints.length > 0 || (overlapResults && overlapResults.length > 0) || showIssuesOnly) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] flex flex-wrap items-center justify-center gap-2 bg-[#0b2d3d]/95 backdrop-blur-md border border-rose-500/50 p-1.5 sm:p-2 rounded-2xl shadow-2xl animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/20 text-rose-300 rounded-xl text-xs font-black">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>
                {overlapResults && overlapResults.length > 0
                  ? (lang === 'ar' ? `تم رصد ${overlapResults.length} تداخل مكاني (فحص تلقائي)` : `${overlapResults.length} Spatial Overlaps (Auto Audit)`)
                  : (lang === 'ar' ? `تم رصد ${detectedIssuePoints.length} ملاحظات فحص` : `${detectedIssuePoints.length} Issues Detected`)}
              </span>
            </div>

            {detectedIssuePoints.length > 0 && (
              <>
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
              </>
            )}

            {onClearAudit && (
              <button
                onClick={onClearAudit}
                className="px-3 py-1.5 bg-rose-500/30 hover:bg-rose-600 text-rose-100 border border-rose-400/50 rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                title={lang === 'ar' ? 'إزالة نتائج الفحص والتظليل والتنبيهات التلقائية' : 'Clear Audit Highlights'}
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                <span>{lang === 'ar' ? 'إزالة نتائج الفحص' : 'Clear Audit'}</span>
              </button>
            )}
          </div>
        )}

        {/* Floating Hydraulic Flow & Velocity Legend (Shown when showFlowDirection is active) */}
        {showFlowDirection && (
          <div className={cn(
            "absolute top-4 sm:top-6 z-[600] transition-all duration-300 max-w-[92vw] sm:max-w-xs",
            lang === 'ar' ? 'left-3 sm:left-6' : 'right-3 sm:right-6'
          )}>
            <div className="bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 rounded-3xl shadow-2xl overflow-hidden text-white transition-all">
              {/* Card Header */}
              <div className="p-3 bg-gradient-to-r from-slate-900 via-cyan-950/80 to-slate-900 border-b border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                    <Waves className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-white flex items-center gap-1.5 leading-tight">
                      <span>{lang === 'ar' ? 'سرعات الجريان (مانينغ)' : 'Flow Velocity (Manning)'}</span>
                    </h4>
                    <span className="text-[9px] text-cyan-300 font-mono font-semibold">
                      {lang === 'ar' ? 'المتوسط:' : 'Avg:'} {(activeHydraulicSummary?.avgVelocity ?? activeHydraulicSummary?.averageVelocity ?? 0).toFixed(2)} m/s
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Outfalls Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setShowOutfalls(!showOutfalls)}
                    className={cn(
                      "p-1.5 rounded-xl border transition-all text-[10px] flex items-center gap-1 font-bold",
                      showOutfalls 
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30" 
                        : "bg-slate-900/80 text-slate-400 border-white/10 opacity-70"
                    )}
                    title={lang === 'ar' ? (showOutfalls ? 'إخفاء نقاط المصب' : 'إظهار نقاط المصب') : (showOutfalls ? 'Hide Outfalls' : 'Show Outfalls')}
                  >
                    <span className="text-[11px]">🌊</span>
                    <span className="text-[9px] font-black">{lang === 'ar' ? 'المصبات' : 'Outfalls'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportHydraulicFlowExcel(activeHydraulicSummary, 'Hydraulic_Flow_Report', lang)}
                    className="p-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all text-[10px] flex items-center gap-1 font-bold"
                    title={lang === 'ar' ? 'تصدير تقرير Excel الهيدروليكي' : 'Export Hydraulic Excel'}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
                    className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                    title={isLegendCollapsed ? (lang === 'ar' ? 'توسيع' : 'Expand') : (lang === 'ar' ? 'طي' : 'Collapse')}
                  >
                    {isLegendCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Card Body (Collapsible) */}
              {!isLegendCollapsed && (
                <div className="p-3 space-y-2.5 text-xs animate-in fade-in duration-200">
                  {/* Color Mode Switcher Chips */}
                  <div>
                    <div className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>{lang === 'ar' ? 'نمط تلوين الخريطة:' : 'Color Coding Mode:'}</span>
                      <span className="text-cyan-400 font-mono">{activeColorMode}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        onClick={() => handleColorModeChange('velocity')}
                        className={cn(
                          "py-1 px-1 rounded-xl text-[8.5px] font-extrabold transition-all border flex items-center justify-center gap-1",
                          activeColorMode === 'velocity'
                            ? "bg-cyan-500 text-white border-cyan-300 shadow-md shadow-cyan-500/20"
                            : "bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800"
                        )}
                      >
                        <Gauge className="w-2.5 h-2.5" />
                        <span>{lang === 'ar' ? 'السرعة' : 'Velocity'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleColorModeChange('priority')}
                        className={cn(
                          "py-1 px-1 rounded-xl text-[8.5px] font-extrabold transition-all border flex items-center justify-center gap-1",
                          activeColorMode === 'priority'
                            ? "bg-cyan-500 text-white border-cyan-300 shadow-md shadow-cyan-500/20"
                            : "bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800"
                        )}
                      >
                        <Compass className="w-2.5 h-2.5" />
                        <span>{lang === 'ar' ? 'الأولوية' : 'Priority'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleColorModeChange('diameter')}
                        className={cn(
                          "py-1 px-1 rounded-xl text-[8.5px] font-extrabold transition-all border flex items-center justify-center gap-1",
                          activeColorMode === 'diameter'
                            ? "bg-cyan-500 text-white border-cyan-300 shadow-md shadow-cyan-500/20"
                            : "bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800"
                        )}
                      >
                        <Ruler className="w-2.5 h-2.5" />
                        <span>{lang === 'ar' ? 'القطر' : 'Diameter'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleColorModeChange('default')}
                        className={cn(
                          "py-1 px-1 rounded-xl text-[8.5px] font-extrabold transition-all border flex items-center justify-center gap-1",
                          activeColorMode === 'default'
                            ? "bg-cyan-500 text-white border-cyan-300 shadow-md shadow-cyan-500/20"
                            : "bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800"
                        )}
                      >
                        <LayersIcon className="w-2.5 h-2.5" />
                        <span>{lang === 'ar' ? 'الأصلي' : 'Default'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Velocity Tiers Legend */}
                  {activeColorMode === 'velocity' && (
                    <div className="space-y-1 pt-1 border-t border-white/10 text-[10px]">
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] shadow-sm shadow-[#00E676]/60 inline-block" />
                          <span className="font-bold text-emerald-300">{lang === 'ar' ? '0.6 - 3.0 m/s (سلس ومطابق)' : '0.6 - 3.0 m/s (Optimal)'}</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">{activeHydraulicSummary?.optimalVelocityCount ?? activeHydraulicSummary?.statsByVelocity?.optimal ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-amber-950/40 border border-amber-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FF9800] shadow-sm shadow-[#FF9800]/60 inline-block" />
                          <span className="font-bold text-amber-300">{lang === 'ar' ? '< 0.6 m/s (رسوبيات)' : '< 0.6 m/s (Sedimentation)'}</span>
                        </div>
                        <span className="font-mono font-bold text-amber-400">{activeHydraulicSummary?.lowVelocityCount ?? activeHydraulicSummary?.statsByVelocity?.low ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-rose-950/40 border border-rose-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FF1744] shadow-sm shadow-[#FF1744]/60 inline-block" />
                          <span className="font-bold text-rose-300">{lang === 'ar' ? '> 3.0 m/s (نحر وتآكل)' : '> 3.0 m/s (Scour Risk)'}</span>
                        </div>
                        <span className="font-mono font-bold text-rose-400">{activeHydraulicSummary?.highVelocityCount ?? activeHydraulicSummary?.statsByVelocity?.high ?? 0}</span>
                      </div>
                    </div>
                  )}

                  {/* Priority Tiers Legend */}
                  {activeColorMode === 'priority' && (
                    <div className="space-y-1 pt-1 border-t border-white/10 text-[10px]">
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                          <span className="font-bold text-emerald-300">{lang === 'ar' ? 'P1 مناسيب الأنابيب (Inverts)' : 'P1 Pipe Inverts'}</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">{flowAnalysis?.statsByPriority.priority1_pipeElevation || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-amber-950/40 border border-amber-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                          <span className="font-bold text-amber-300">{lang === 'ar' ? 'P2 أرقام المناهل (Manholes)' : 'P2 Manholes'}</span>
                        </div>
                        <span className="font-mono font-bold text-amber-400">{flowAnalysis?.statsByPriority.priority2_manholes || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                          <span className="font-bold text-cyan-300">{lang === 'ar' ? 'P3 تضاريس الأرض (DEM)' : 'P3 DEM Elevation'}</span>
                        </div>
                        <span className="font-mono font-bold text-cyan-400">{flowAnalysis?.statsByPriority.priority3_dem || 0}</span>
                      </div>
                    </div>
                  )}

                  {/* Diameter Tiers Legend */}
                  {activeColorMode === 'diameter' && (
                    <div className="space-y-1 pt-1 border-t border-white/10 text-[10px]">
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4] inline-block" />
                          <span className="font-bold text-cyan-300">≤ 200 mm</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-blue-950/40 border border-blue-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] inline-block" />
                          <span className="font-bold text-blue-300">201 - 400 mm</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] inline-block" />
                          <span className="font-bold text-purple-300">401 - 600 mm</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-xl bg-pink-950/40 border border-pink-500/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899] inline-block" />
                          <span className="font-bold text-pink-300">&gt; 600 mm</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary Network Totals */}
                  <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-1.5 text-[9.5px]">
                    <div className="p-1.5 rounded-xl bg-slate-900/80 border border-white/5">
                      <span className="text-slate-400 block">{lang === 'ar' ? 'إجمالي التصريف:' : 'Total Q:'}</span>
                      <span className="font-mono font-bold text-cyan-300 text-[10.5px]">
                        {(activeHydraulicSummary?.totalCapacityLs ?? activeHydraulicSummary?.totalFullCapacityLs ?? 0) >= 1000 
                          ? `${((activeHydraulicSummary?.totalCapacityLs ?? activeHydraulicSummary?.totalFullCapacityLs ?? 0) / 1000).toFixed(2)} m³/s`
                          : `${(activeHydraulicSummary?.totalCapacityLs ?? activeHydraulicSummary?.totalFullCapacityLs ?? 0).toFixed(0)} L/s`}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-xl bg-slate-900/80 border border-white/5">
                      <span className="text-slate-400 block">{lang === 'ar' ? 'كمية الأسفلت:' : 'Asphalt Vol:'}</span>
                      <span className="font-mono font-bold text-amber-300 text-[10.5px]">
                        {(activeHydraulicSummary?.totalAsphaltVolumeM3 ?? 0).toFixed(1)} m³
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
                title={lang === 'ar' ? 'أنواع الخرائط والطبقات' : 'Map Layers & Options'}
            >
                <LayersIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="relative group flex items-center gap-1.5">
              <button 
                  type="button"
                  onClick={() => onToggleFlowDirection?.(!showFlowDirection)}
                  className={cn(
                      "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl shadow-xl flex items-center justify-center transition-all border active:scale-95 relative",
                      showFlowDirection 
                        ? "bg-cyan-500 text-white border-cyan-300 ring-2 ring-cyan-400/50 shadow-cyan-500/30" 
                        : "bg-white/95 backdrop-blur-md text-slate-700 hover:bg-white border-white/20"
                  )}
                  title={lang === 'ar' ? 'تشغيل / إيقاف اتجاه التدفق الهيدروليكي' : 'Toggle Hydraulic Flow Direction'}
              >
                  <Waves className={cn("w-5 h-5 sm:w-6 sm:h-6", showFlowDirection && "animate-bounce")} />
                  {showFlowDirection && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-300 border-2 border-white animate-ping" />
                  )}
              </button>

              {/* Info Toggle Button */}
              <button
                  type="button"
                  onClick={() => setShowFlowInfoOverlay(!showFlowInfoOverlay)}
                  className={cn(
                    "w-7 h-7 sm:w-8 sm:h-8 rounded-xl backdrop-blur-md flex items-center justify-center transition-all border shadow-lg active:scale-95",
                    showFlowInfoOverlay
                      ? "bg-cyan-600 text-white border-cyan-300 ring-2 ring-cyan-400/40"
                      : "bg-slate-900/85 hover:bg-slate-900 text-cyan-300 border-cyan-500/30"
                  )}
                  title={lang === 'ar' ? 'معلومات آلية المنسوب والجاذبية (DEM)' : 'DEM & Gravity Flow Information'}
              >
                  <Info className="w-4 h-4" />
              </button>

              {/* Technical Info Overlay Dashboard (Shown on Hover OR when Info button clicked) */}
              <div className={cn(
                "absolute top-0 z-50 w-80 sm:w-96 p-4 rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 shadow-2xl text-white text-xs transition-all duration-200 animate-in fade-in zoom-in-95",
                showFlowInfoOverlay ? "block" : "hidden group-hover:block",
                lang === 'ar' ? "right-20 sm:right-24" : "left-20 sm:left-24"
              )}>
                <div className="font-black text-cyan-300 text-xs pb-2.5 mb-2.5 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span className="text-xs font-extrabold">
                      {lang === 'ar' ? 'آلية تحليل المنسوب (DEM) والجاذبية' : 'DEM & Gravity Flow Analysis Engine'}
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowFlowInfoOverlay(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5 text-[11px] leading-relaxed text-slate-200">
                  {/* Principle 1: Gravity Slope */}
                  <div className="p-2 rounded-2xl bg-cyan-950/50 border border-cyan-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-cyan-300 text-xs">
                      <Compass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{lang === 'ar' ? '1. الانحدار وجاذبية السائل (Gravity Flow Slope)' : '1. Hydraulic Gravity Slope'}</span>
                    </div>
                    <p className="text-slate-300 text-[10.5px]">
                      {lang === 'ar' 
                        ? 'يتحدد اتجاه الحركة تلقائياً بفعل انحناء وسقوط الجاذبية الأرضية من المنسوب المرتفع إلى المنخفض (Upstream → Downstream).'
                        : 'Water flows natively from higher to lower invert elevations under earth gravity.'}
                    </p>
                  </div>

                  {/* Principle 2: DEM Terrain Sampling */}
                  <div className="p-2 rounded-2xl bg-emerald-950/50 border border-emerald-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-xs">
                      <Mountain className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{lang === 'ar' ? '2. استكمال المنسوب الطبوغرافي (DEM Elevation)' : '2. DEM Terrain Elevation Sampling'}</span>
                    </div>
                    <p className="text-slate-300 text-[10.5px]">
                      {lang === 'ar'
                        ? 'عند غياب مناسيب قاع الأنابيب، يتم استعلام نموذج الارتفاعات الرقمي (DEM) لحساب انحدار سطح الأرض واستنتاج الاتجاه تلقائياً.'
                        : 'If pipe invert levels are missing, the Digital Elevation Model (DEM) extracts terrain topography to determine flow direction.'}
                    </p>
                  </div>

                  {/* Priorities Hierarchy */}
                  <div className="space-y-1 pt-1 border-t border-white/10 text-[10.5px]">
                    <div className="font-bold text-slate-200 mb-0.5">
                      {lang === 'ar' ? 'تسلسل أولويات خوارزمية التقييم:' : 'Sequential Priority Hierarchy:'}
                    </div>
                    <p><span className="text-emerald-400 font-bold">🟢 P1 (مناسيب الأنبوب):</span> {lang === 'ar' ? 'Start & End Invert Elevation.' : 'Start & End Pipe Invert Levels.'}</p>
                    <p><span className="text-amber-400 font-bold">🟡 P2 (ربط المناهل):</span> {lang === 'ar' ? 'Upstream → Downstream Manholes.' : 'Upstream to Downstream connected manholes.'}</p>
                    <p><span className="text-cyan-400 font-bold">🔵 P3 (النموذج الرقمي DEM):</span> {lang === 'ar' ? 'Terrain Digital Elevation Model.' : 'Fallback terrain digital elevation.'}</p>
                  </div>

                  {/* Live Metrics */}
                  {flowAnalysis && (
                    <div className="mt-2 pt-2 border-t border-cyan-500/30 grid grid-cols-2 gap-1.5 text-[10px] bg-slate-900/90 p-2 rounded-xl border border-white/10">
                      <div>
                        <span className="text-slate-400 block">{lang === 'ar' ? 'إجمالي الأنابيب:' : 'Total Pipes:'}</span>
                        <strong className="text-white font-mono text-xs">{flowAnalysis.totalPipes}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{lang === 'ar' ? 'محددة بـ DEM:' : 'DEM Calculated:'}</span>
                        <strong className="text-cyan-300 font-mono text-xs">{flowAnalysis.statsByPriority.priority3_dem}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{lang === 'ar' ? 'أنابيب تم عكسها:' : 'Reversed Pipes:'}</span>
                        <strong className="text-amber-300 font-mono text-xs">{flowAnalysis.reversedPipesCount}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{lang === 'ar' ? 'نقاط المصب (Outfalls):' : 'Outfall Sink Nodes:'}</span>
                        <strong className="text-rose-400 font-mono text-xs">{flowAnalysis.outfallNodes.length}</strong>
                      </div>
                    </div>
                  )}

                  {/* Visual Legend */}
                  <div className="pt-2 border-t border-white/10 space-y-1.5 text-[10px] text-slate-300">
                    <div className="font-bold text-slate-200 text-[10.5px]">
                      {lang === 'ar' ? 'دليل ألوان خطوط التدفق حسب الطريقة:' : 'Flow Line Colors by Priority Method:'}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <div className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-1 rounded-lg">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm shadow-emerald-500/50" />
                        <span className="text-[9.5px] font-bold text-emerald-300">{lang === 'ar' ? 'P1 مناسيب' : 'P1 Inverts'}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-950/60 border border-amber-500/30 px-1.5 py-1 rounded-lg">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm shadow-amber-500/50" />
                        <span className="text-[9.5px] font-bold text-amber-300">{lang === 'ar' ? 'P2 مناهل' : 'P2 Manholes'}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-1 rounded-lg">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block shadow-sm shadow-cyan-400/50" />
                        <span className="text-[9.5px] font-bold text-cyan-300">{lang === 'ar' ? 'P3 DEM' : 'P3 DEM'}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm shadow-rose-500/50" />
                        <span className="font-semibold text-rose-300">{lang === 'ar' ? 'أسهم حمراء (ثابتة للاتجاه)' : 'Fixed Red Arrows'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white inline-block animate-ping" />
                        <span className="text-slate-300">{lang === 'ar' ? 'حركة نَبْض الأنابيب' : 'Pulsing Flow Line'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button 
                onClick={zoomToDataExtent}
                disabled={points.length === 0}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t.zoomToData}
            >
                <Maximize className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button 
                onClick={exportMapToSVG}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={lang === 'ar' ? 'تصدير كـ SVG (متجهات)' : 'Export as SVG (Vector)'}
            >
                <Download className="w-5 h-5 sm:w-6 sm:h-6" />
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
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setShowPolygons(!showPolygons)}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9.5px] font-black uppercase flex items-center justify-center gap-1.5 ${showPolygons ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <Square className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'مضلعات' : 'Polygons'}
                            </button>
                            <button 
                                onClick={() => setShowLines(!showLines)}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9.5px] font-black uppercase flex items-center justify-center gap-1.5 ${showLines ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <Navigation2 className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'خطوط' : 'Lines'}
                            </button>
                            <button 
                                onClick={() => setShowPoints(!showPoints)}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9.5px] font-black uppercase flex items-center justify-center gap-1.5 ${showPoints ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <MapPin className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'نقاط' : 'Points'}
                            </button>
                            <button 
                                onClick={() => setShowOutfalls(!showOutfalls)}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9.5px] font-black uppercase flex items-center justify-center gap-1.5 ${showOutfalls ? "bg-cyan-600 text-white border-cyan-600 shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}`}
                            >
                                <Waves className="w-3.5 h-3.5" />
                                {lang === 'ar' ? 'المصبات' : 'Outfalls'}
                            </button>
                        </div>
                    </div>

                    {/* Hydraulic Layer Coloring Settings */}
                    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-black uppercase text-slate-400">{lang === 'ar' ? 'تلوين الشبكة الهيدروليكية' : 'Hydraulic Coloring'}</h4>
                            <span className="text-[9px] font-mono text-cyan-600 font-bold uppercase">{activeColorMode}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button 
                                onClick={() => handleColorModeChange('velocity')}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9px] font-black flex items-center justify-center gap-1.5 ${activeColorMode === 'velocity' ? "bg-cyan-500 text-white border-cyan-500 shadow-md" : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-white"}`}
                            >
                                <Gauge className="w-3 h-3" />
                                {lang === 'ar' ? 'سرعة التدفق' : 'Velocity'}
                            </button>
                            <button 
                                onClick={() => handleColorModeChange('priority')}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9px] font-black flex items-center justify-center gap-1.5 ${activeColorMode === 'priority' ? "bg-cyan-500 text-white border-cyan-500 shadow-md" : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-white"}`}
                            >
                                <Compass className="w-3 h-3" />
                                {lang === 'ar' ? 'الأولوية (DEM)' : 'Priority'}
                            </button>
                            <button 
                                onClick={() => handleColorModeChange('diameter')}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9px] font-black flex items-center justify-center gap-1.5 ${activeColorMode === 'diameter' ? "bg-cyan-500 text-white border-cyan-500 shadow-md" : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-white"}`}
                            >
                                <Ruler className="w-3 h-3" />
                                {lang === 'ar' ? 'أقطار الأنابيب' : 'Diameter'}
                            </button>
                            <button 
                                onClick={() => handleColorModeChange('default')}
                                className={`py-2 px-2 rounded-xl transition-all border text-[9px] font-black flex items-center justify-center gap-1.5 ${activeColorMode === 'default' ? "bg-slate-800 text-white border-slate-800 shadow-md" : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-white"}`}
                            >
                                <LayersIcon className="w-3 h-3" />
                                {lang === 'ar' ? 'ألوان الملف الأصلية' : 'Original Colors'}
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
