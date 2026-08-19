
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { 
  Search as SearchIcon, Loader2, MousePointerClick, Square, Trash2, 
  CheckCircle2, Layers as LayersIcon, Map as MapIcon, Eye, EyeOff, 
  Globe, Maximize, Download, Navigation2, MapPin, RotateCcw, Info, 
  X, Sparkles, Compass, Mountain, Activity, ArrowDownRight, Waves, 
  FileSpreadsheet, ChevronDown, ChevronUp, Gauge, Droplet, Ruler,
  PenTool, Undo2, Check, Target, Route, Milestone, Copy, SlidersHorizontal,
  Building2, Home, Flag
} from 'lucide-react';
import { cn, escapeHtml, sanitizeImageUrl } from '../utils';
import { 
  GeoPoint, BaseMapType, HydraulicNetworkSummary, 
  HydraulicColorMode, AsphaltCalculationParams, PipeHydraulicData,
  OutfallTarget, OutfallSummaryInfo, OutfallFurthestPipeInfo,
  AsphaltPolygonCalculation
} from '../types';
import { translations, Language } from '../translations';
import { parseCoordinatesFromText } from '../services/crs';
import { NetworkFlowAnalysis } from '../services/flowDirectionService';
import { calculatePathLength } from '../services/kmlService';
import { 
  StreetSearchResult, searchProjectStreets, searchGlobalStreets,
  StreetSearchFilters, COUNTRY_PRESETS, CountryPreset
} from '../services/streetSearchService';
import { 
  analyzeNetworkHydraulics, exportHydraulicFlowExcel, 
  DEFAULT_ASPHALT_PARAMS, DEFAULT_MANNING_N 
} from '../services/hydraulicService';
import { 
  calculateAsphaltPolygonBOQ, 
  calculateGeodesicPolygonArea, 
  calculatePolygonPerimeter 
} from '../services/asphaltCalculationService';
import { AsphaltPolygonCalculatorModal } from './AsphaltPolygonCalculatorModal';
import { OUTFALL_PALETTE } from '../services/gravitySewerEngine';


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

  // Main Map Direct Line Drawing Props
  isLineDrawingMode?: boolean;
  activeLineVertices?: { x: number; y: number }[];
  activeLineColor?: string;
  activeLineWidth?: number;
  activeLineName?: string;
  activeLineLayer?: string;
  onAddLineVertex?: (pt: { x: number; y: number }) => void;
  onUndoLineVertex?: () => void;
  onFinishLine?: () => void;
  onCancelLineDraw?: () => void;
  isPickingCoordinate?: 'start' | 'end' | null;
  onPickMapCoordinate?: (coord: { x: number; y: number }) => void;
  onOrientNetworkTowardsOutfall?: (targetOutfallCoord?: { x: number; y: number; z?: number }) => void;
  outfallTargets?: OutfallTarget[];
  onAddOutfallTarget?: (target: OutfallTarget) => void;
  onRemoveOutfallTarget?: (id: string) => void;
  onClearOutfallTargets?: () => void;
  onOrientNetworkTowardsMultiOutfalls?: (targets?: OutfallTarget[]) => void;
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
  manningN = DEFAULT_MANNING_N,
  isLineDrawingMode = false,
  activeLineVertices = [],
  activeLineColor = '#3b82f6',
  activeLineWidth = 4,
  activeLineName = 'LINE_1',
  activeLineLayer = 'شبكة المياه',
  onAddLineVertex,
  onUndoLineVertex,
  onFinishLine,
  onCancelLineDraw,
  isPickingCoordinate = null,
  onPickMapCoordinate,
  onOrientNetworkTowardsOutfall,
  outfallTargets = [],
  onAddOutfallTarget,
  onRemoveOutfallTarget,
  onClearOutfallTargets,
  onOrientNetworkTowardsMultiOutfalls
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
  const lineDrawLayerGroup = useRef<L.LayerGroup | null>(null);
  const asphaltLayerGroup = useRef<L.LayerGroup | null>(null);
  const asphaltDrawLayerGroup = useRef<L.LayerGroup | null>(null);
  const searchHighlightGroup = useRef<L.LayerGroup | null>(null);
  const hoverMarkerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const issueMarkersMap = useRef<Map<string | number, L.Marker | L.CircleMarker | L.Polyline>>(new Map());
  
  const isDrawingRef = useRef(false);
  const polygonCoordsRef = useRef<L.LatLng[]>([]);
  const lastDataIdRef = useRef<string | null>(null);

  // Asphalt Polygon BOQ Calculation States & Refs
  const [asphaltCalc, setAsphaltCalc] = useState<AsphaltPolygonCalculation | null>(null);
  const [showAsphaltModal, setShowAsphaltModal] = useState<boolean>(false);
  const [isAsphaltDrawing, setIsAsphaltDrawing] = useState<boolean>(false);
  const [asphaltDrawingCoords, setAsphaltDrawingCoords] = useState<{ x: number; y: number }[]>([]);
  const [isAsphaltPolygonVisible, setIsAsphaltPolygonVisible] = useState<boolean>(true);

  const isAsphaltDrawingRef = useRef(false);
  const asphaltDrawingCoordsRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    isAsphaltDrawingRef.current = isAsphaltDrawing;
    asphaltDrawingCoordsRef.current = asphaltDrawingCoords;
  }, [isAsphaltDrawing, asphaltDrawingCoords]);

  // Synchronization refs for direct map line drawing & picking
  const isLineDrawingModeRef = useRef(false);
  const activeLineVerticesRef = useRef<{ x: number; y: number }[]>([]);
  const onAddLineVertexRef = useRef(onAddLineVertex);
  const onFinishLineRef = useRef(onFinishLine);
  const isPickingCoordinateRef = useRef(isPickingCoordinate);
  const onPickMapCoordinateRef = useRef(onPickMapCoordinate);
  const onOrientNetworkTowardsOutfallRef = useRef(onOrientNetworkTowardsOutfall);
  const onAddOutfallTargetRef = useRef(onAddOutfallTarget);
  const onRemoveOutfallTargetRef = useRef(onRemoveOutfallTarget);
  const onClearOutfallTargetsRef = useRef(onClearOutfallTargets);
  const onOrientNetworkTowardsMultiOutfallsRef = useRef(onOrientNetworkTowardsMultiOutfalls);
  const outfallTargetsRef = useRef<OutfallTarget[]>([]);
  const isPickingOutfallTargetRef = useRef(false);

  const [isPickingOutfallTarget, setIsPickingOutfallTarget] = useState(false);

  useEffect(() => {
    isLineDrawingModeRef.current = !!isLineDrawingMode;
    activeLineVerticesRef.current = activeLineVertices || [];
    onAddLineVertexRef.current = onAddLineVertex;
    onFinishLineRef.current = onFinishLine;
    isPickingCoordinateRef.current = isPickingCoordinate;
    onPickMapCoordinateRef.current = onPickMapCoordinate;
    onOrientNetworkTowardsOutfallRef.current = onOrientNetworkTowardsOutfall;
    onAddOutfallTargetRef.current = onAddOutfallTarget;
    onRemoveOutfallTargetRef.current = onRemoveOutfallTarget;
    onClearOutfallTargetsRef.current = onClearOutfallTargets;
    onOrientNetworkTowardsMultiOutfallsRef.current = onOrientNetworkTowardsMultiOutfalls;
    outfallTargetsRef.current = outfallTargets || [];
    isPickingOutfallTargetRef.current = isPickingOutfallTarget;
  }, [
    isLineDrawingMode, activeLineVertices, onAddLineVertex, onFinishLine, 
    isPickingCoordinate, onPickMapCoordinate, onOrientNetworkTowardsOutfall, 
    onAddOutfallTarget, onRemoveOutfallTarget, onClearOutfallTargets, onOrientNetworkTowardsMultiOutfalls, 
    outfallTargets, isPickingOutfallTarget
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StreetSearchResult[]>([]);
  const [showSearchResultsDropdown, setShowSearchResultsDropdown] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<StreetSearchResult | null>(null);
  const [searchActiveTab, setSearchActiveTab] = useState<'all' | 'project' | 'global'>('all');
  const [searchFilters, setSearchFilters] = useState<StreetSearchFilters>({
    countryCode: 'sa',
    countryName: 'المملكة العربية السعودية',
    city: '',
    district: ''
  });
  const [showSearchFiltersModal, setShowSearchFiltersModal] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const filterModalRef = useRef<HTMLDivElement>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);
  const layerToggleBtnRef = useRef<HTMLButtonElement>(null);
  const flowInfoOverlayRef = useRef<HTMLDivElement>(null);
  const flowInfoBtnRef = useRef<HTMLButtonElement>(null);

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

  // Global window bridge for popup buttons
  useEffect(() => {
    (window as any).__orientTowardsOutfall = (x: number, y: number) => {
      if (onOrientNetworkTowardsOutfallRef.current) {
        onOrientNetworkTowardsOutfallRef.current({ x, y });
      }
    };
    (window as any).__removeOutfallTarget = (id: string) => {
      mapInstance.current?.closePopup();
      if (onRemoveOutfallTargetRef.current) {
        onRemoveOutfallTargetRef.current(id);
      }
    };
    (window as any).__clearAllOutfalls = () => {
      mapInstance.current?.closePopup();
      if (onClearOutfallTargetsRef.current) {
        onClearOutfallTargetsRef.current();
      }
    };
    (window as any).__copySearchCoords = (lat: number, lng: number) => {
      navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    };
    (window as any).__clearSearchHighlight = () => {
      mapInstance.current?.closePopup();
      searchHighlightGroup.current?.clearLayers();
      setSelectedSearchResult(null);
    };
    (window as any).__focusFurthestPipe = (pipeX: number, pipeY: number, outfallX?: number, outfallY?: number) => {
      if (!mapInstance.current) return;
      if (outfallX !== undefined && outfallY !== undefined && isValidLatLng(outfallY, outfallX) && isValidLatLng(pipeY, pipeX)) {
        const bounds = L.latLngBounds([
          [outfallY, outfallX],
          [pipeY, pipeX]
        ]);
        mapInstance.current.fitBounds(bounds, { padding: [100, 100], maxZoom: 17, animate: true });
      } else if (isValidLatLng(pipeY, pipeX)) {
        mapInstance.current.flyTo([pipeY, pipeX], 18, { animate: true, duration: 1.2 });
      }
    };
    return () => {
      delete (window as any).__orientTowardsOutfall;
      delete (window as any).__removeOutfallTarget;
      delete (window as any).__clearAllOutfalls;
      delete (window as any).__focusFurthestPipe;
    };
  }, []);

  const activeHydraulicSummary = useMemo(() => {
    if (propHydraulicSummary) return propHydraulicSummary;
    return analyzeNetworkHydraulics(points, flowAnalysis, manningN, asphaltParams);
  }, [points, flowAnalysis, manningN, asphaltParams, propHydraulicSummary]);

  const activeLineLengthMeters = useMemo(() => {
    if (!activeLineVertices || activeLineVertices.length < 2) return 0;
    return calculatePathLength(activeLineVertices);
  }, [activeLineVertices]);
  
  const [showPolygons, setShowPolygons] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [showOutfalls, setShowOutfalls] = useState(true);
  const [showDataOverlay, setShowDataOverlay] = useState(true);
  const [dismissedDistanceAlert, setDismissedDistanceAlert] = useState(false);

  // Compute outfalls that exceed hydraulic design standards
  const exceededOutfalls = useMemo(() => {
    const list: Array<{ id: string; name: string; distanceMeters: number; outfallX: number; outfallY: number; furthestPoint: { x: number; y: number } }> = [];
    
    if (outfallTargets && outfallTargets.length > 0) {
      outfallTargets.forEach(t => {
        if ((t.isDistanceExceeded || t.furthestPipe?.exceedsStandard) && t.furthestPipe && t.furthestPipe.furthestPoint) {
          list.push({
            id: t.id,
            name: t.name || t.id,
            distanceMeters: t.furthestPipe.distanceMeters,
            outfallX: t.x,
            outfallY: t.y,
            furthestPoint: t.furthestPipe.furthestPoint
          });
        }
      });
    } else if (flowAnalysis?.outfallNodes && (!outfallTargets || outfallTargets.length === 0)) {
      flowAnalysis.outfallNodes.forEach(n => {
        // Skip stale target outfalls when targets have been cleared
        if ((n as any).isTarget || (n as any).isExplicitTarget || n.id?.startsWith('OUTFALL_') || n.id?.startsWith('target-')) return;
        const nodeFurthest = (n as any).furthestPipe as OutfallFurthestPipeInfo | undefined;
        if (((n as any).isDistanceExceeded || nodeFurthest?.exceedsStandard) && nodeFurthest && nodeFurthest.furthestPoint) {
          if (!list.some(item => item.id === n.id)) {
            list.push({
              id: n.id,
              name: (n as any).name || n.id,
              distanceMeters: nodeFurthest.distanceMeters,
              outfallX: n.x,
              outfallY: n.y,
              furthestPoint: nodeFurthest.furthestPoint
            });
          }
        }
      });
    }

    return list;
  }, [outfallTargets, flowAnalysis]);

  const displayOutfalls = useMemo(() => {
    if (outfallTargets && outfallTargets.length > 0) {
      return outfallTargets.map((of, idx) => ({
        id: of.id || `target-${idx}`,
        name: of.name || (lang === 'ar' ? `مصب ${idx + 1}` : `Outfall ${idx + 1}`),
        x: of.x,
        y: of.y,
        color: of.color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length],
        furthestPipe: of.furthestPipe,
        isDistanceExceeded: !!(of.isDistanceExceeded || of.furthestPipe?.exceedsStandard),
        isTarget: true
      }));
    }
    if (flowAnalysis?.outfallNodes && flowAnalysis.outfallNodes.length > 0) {
      return flowAnalysis.outfallNodes.map((node, idx) => ({
        id: node.id,
        name: (node as any).name || node.labelAr || (lang === 'ar' ? `مصب رئيسي (${node.id})` : `Main Outfall (${node.id})`),
        x: node.x,
        y: node.y,
        color: (node as any).color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length],
        furthestPipe: (node as any).furthestPipe,
        isDistanceExceeded: !!((node as any).isDistanceExceeded || (node as any).furthestPipe?.exceedsStandard),
        isTarget: false
      }));
    }
    return [];
  }, [outfallTargets, flowAnalysis?.outfallNodes, lang]);

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
    satellite: { url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', name: (t as any).layerSatellite || 'Google Satellite', icon: <Globe className="w-5 h-5" /> },
    esriSatellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', name: (t as any).layerEsriSatellite || 'Esri High-Res', icon: <Globe className="w-5 h-5 text-cyan-400" /> },
    streets: { url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', name: (t as any).layerStreets || 'Google Streets', icon: <MapIcon className="w-5 h-5" /> },
    cartoVoyager: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', name: (t as any).layerCartoVoyager || 'Carto Voyager', icon: <MapIcon className="w-5 h-5 text-emerald-400" /> },
    darkMatrix: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', name: (t as any).layerDarkMatrix || 'CAD Dark Matrix', icon: <Square className="w-5 h-5 text-purple-400" /> },
    terrain: { url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', name: (t as any).layerTerrain || 'Google Terrain', icon: <Mountain className="w-5 h-5 text-amber-400" /> },
    esriTopo: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', name: (t as any).layerEsriTopo || 'Esri Topo', icon: <Mountain className="w-5 h-5 text-teal-400" /> },
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', name: (t as any).layerOSM || 'OpenStreetMap', icon: <Globe className="w-5 h-5 opacity-50" /> }
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
    lineDrawLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    asphaltLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    asphaltDrawLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    searchHighlightGroup.current = L.layerGroup().addTo(mapInstance.current);

    // Add scale bar
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(mapInstance.current);

    mapInstance.current.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
      // Close open floating overlay panels or search dropdowns on map click
      setShowLayerMenu(false);
      setShowFlowInfoOverlay(false);
      setShowSearchResultsDropdown(false);
      setShowSearchFiltersModal(false);

      // 0. Check if drawing asphalt polygon interactively
      if (isAsphaltDrawingRef.current) {
        const newCoord = { x: e.latlng.lng, y: e.latlng.lat };
        setAsphaltDrawingCoords(prev => {
          const updated = [...prev, newCoord];
          asphaltDrawingCoordsRef.current = updated;
          return updated;
        });
        return;
      }

      // 1. Check if picking outfall target on map
      if (isPickingOutfallTargetRef.current) {
        setIsPickingOutfallTarget(false);
        const nextIndex = outfallTargetsRef.current.length + 1;
        const assignedColor = OUTFALL_PALETTE[(nextIndex - 1) % OUTFALL_PALETTE.length];
        const newOutfall: OutfallTarget = {
          id: `OUTFALL_${Date.now()}`,
          name: lang === 'ar' ? `مصب ${nextIndex}` : `Outfall ${nextIndex}`,
          x: e.latlng.lng,
          y: e.latlng.lat,
          color: assignedColor
        };

        if (onAddOutfallTargetRef.current) {
          onAddOutfallTargetRef.current(newOutfall);
        } else if (onOrientNetworkTowardsOutfallRef.current) {
          onOrientNetworkTowardsOutfallRef.current({ x: e.latlng.lng, y: e.latlng.lat });
        }
        return;
      }

      // 2. Check if picking a coordinate manually
      if (isPickingCoordinateRef.current) {
        if (onPickMapCoordinateRef.current) {
          onPickMapCoordinateRef.current({ x: e.latlng.lng, y: e.latlng.lat });
        }
        return;
      }

      // 3. Check if drawing a line interactively on main map
      if (isLineDrawingModeRef.current) {
        if (onAddLineVertexRef.current) {
          onAddLineVertexRef.current({ x: e.latlng.lng, y: e.latlng.lat });
        }
        return;
      }

      // 4. Polygon selection mode
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

    mapInstance.current.on('dblclick', (e: L.LeafletMouseEvent) => {
      if (isLineDrawingModeRef.current && activeLineVerticesRef.current.length >= 2) {
        L.DomEvent.stopPropagation(e);
        if (onFinishLineRef.current) {
          onFinishLineRef.current();
        }
      }
    });

    L.control.zoom({ position: lang === 'ar' ? 'topleft' : 'topright' }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update cursor style when in line drawing or coordinate picking mode
  useEffect(() => {
    if (!mapContainer.current) return;
    if (isLineDrawingMode || isPickingCoordinate || isAsphaltDrawing) {
      mapContainer.current.style.cursor = 'crosshair';
    } else if (isDrawing) {
      mapContainer.current.style.cursor = 'crosshair';
    } else {
      mapContainer.current.style.cursor = '';
    }
  }, [isLineDrawingMode, isPickingCoordinate, isDrawing, isAsphaltDrawing]);

  // Asphalt live calculation values during interactive drawing
  const liveAsphaltAreaM2 = useMemo(() => {
    if (asphaltDrawingCoords.length < 3) return 0;
    return calculateGeodesicPolygonArea(asphaltDrawingCoords);
  }, [asphaltDrawingCoords]);

  const liveAsphaltPerimeterM = useMemo(() => {
    if (asphaltDrawingCoords.length < 2) return 0;
    return calculatePolygonPerimeter(asphaltDrawingCoords);
  }, [asphaltDrawingCoords]);

  // Asphalt Drawing Action Handlers
  const handleStartAsphaltDrawing = useCallback(() => {
    setIsAsphaltDrawing(true);
    setAsphaltDrawingCoords([]);
    asphaltDrawingCoordsRef.current = [];
  }, []);

  const handleUndoAsphaltVertex = useCallback(() => {
    setAsphaltDrawingCoords(prev => {
      const next = prev.slice(0, -1);
      asphaltDrawingCoordsRef.current = next;
      return next;
    });
  }, []);

  const handleCancelAsphaltDrawing = useCallback(() => {
    setIsAsphaltDrawing(false);
    setAsphaltDrawingCoords([]);
    asphaltDrawingCoordsRef.current = [];
    if (asphaltDrawLayerGroup.current) {
      asphaltDrawLayerGroup.current.clearLayers();
    }
  }, []);

  const handleFinishAsphaltDrawing = useCallback(() => {
    if (asphaltDrawingCoords.length < 3) return;
    const calc = calculateAsphaltPolygonBOQ(
      asphaltDrawingCoords,
      {
        name: lang === 'ar' ? `مضلع أسفلت ${new Date().toLocaleTimeString('ar-SA')}` : `Asphalt Polygon ${new Date().toLocaleTimeString()}`,
        source: 'draw'
      },
      points
    );
    setAsphaltCalc(calc);
    setIsAsphaltDrawing(false);
    setAsphaltDrawingCoords([]);
    asphaltDrawingCoordsRef.current = [];
    if (asphaltDrawLayerGroup.current) {
      asphaltDrawLayerGroup.current.clearLayers();
    }
    setShowAsphaltModal(true);
  }, [asphaltDrawingCoords, points, lang]);

  const handleZoomToAsphaltPolygon = useCallback(() => {
    if (!mapInstance.current || !asphaltCalc?.polygon || asphaltCalc.polygon.length === 0) return;
    const bounds = L.latLngBounds([]);
    asphaltCalc.polygon.forEach(p => {
      if (isValidLatLng(p.y, p.x)) {
        bounds.extend([p.y, p.x]);
      }
    });
    if (bounds.isValid()) {
      mapInstance.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 17, animate: true });
    }
  }, [asphaltCalc]);

  // Render live asphalt polygon drawing preview on map
  useEffect(() => {
    if (!mapInstance.current || !asphaltDrawLayerGroup.current) return;
    asphaltDrawLayerGroup.current.clearLayers();

    if (!isAsphaltDrawing || asphaltDrawingCoords.length === 0) return;

    const latLngs = asphaltDrawingCoords.map(c => [c.y, c.x] as [number, number]);

    // If >= 3 points, draw polygon fill preview
    if (latLngs.length >= 3) {
      const poly = L.polygon(latLngs, {
        color: '#f59e0b',
        weight: 2.5,
        dashArray: '5, 8',
        fillColor: '#d97706',
        fillOpacity: 0.3
      });
      asphaltDrawLayerGroup.current.addLayer(poly);
    } else if (latLngs.length === 2) {
      const line = L.polyline(latLngs, {
        color: '#f59e0b',
        weight: 3,
        dashArray: '5, 8'
      });
      asphaltDrawLayerGroup.current.addLayer(line);
    }

    // Numbered vertex pins & edge dimensions during drawing
    asphaltDrawingCoords.forEach((v, idx) => {
      const isStart = idx === 0;
      const isLatest = idx === asphaltDrawingCoords.length - 1;
      const vertexColor = isStart ? '#10b981' : isLatest ? '#f59e0b' : '#0284c7';

      const icon = L.divIcon({
        className: 'custom-asphalt-vertex-pin',
        html: `
          <div style="
            width: 24px;
            height: 24px;
            background-color: ${vertexColor};
            color: #ffffff;
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 900;
            box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            transform: translate(-50%, -50%);
            font-family: monospace;
          ">
            ${idx + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([v.y, v.x], { icon, interactive: false });
      asphaltDrawLayerGroup.current?.addLayer(marker);

      // Edge length between sequential vertices
      if (idx > 0 && mapInstance.current) {
        const prev = asphaltDrawingCoords[idx - 1];
        const distM = mapInstance.current.distance([prev.y, prev.x], [v.y, v.x]);
        const midLat = (prev.y + v.y) / 2;
        const midLng = (prev.x + v.x) / 2;
        const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(2)} ${lang === 'ar' ? 'كم' : 'km'}` : `${distM.toFixed(1)} ${lang === 'ar' ? 'م' : 'm'}`;

        const edgeIcon = L.divIcon({
          className: 'asphalt-edge-badge',
          html: `
            <div style="
              background: rgba(15, 23, 42, 0.92);
              border: 1px solid #f59e0b;
              border-radius: 8px;
              padding: 2px 7px;
              color: #fef08a;
              font-family: monospace;
              font-size: 10.5px;
              font-weight: 800;
              box-shadow: 0 2px 8px rgba(0,0,0,0.5);
              transform: translate(-50%, -50%);
              pointer-events: none;
              white-space: nowrap;
            ">
              ${distLabel}
            </div>
          `,
          iconAnchor: [0, 0]
        });
        const edgeMarker = L.marker([midLat, midLng], { icon: edgeIcon, interactive: false });
        asphaltDrawLayerGroup.current?.addLayer(edgeMarker);
      }
    });

    // Rubberband line to cursor
    if (cursorCoords && latLngs.length >= 1) {
      const lastPt = latLngs[latLngs.length - 1];
      const rubberBand = L.polyline([lastPt, [cursorCoords.lat, cursorCoords.lng]], {
        color: '#f59e0b',
        weight: 2.5,
        dashArray: '4, 6',
        opacity: 0.9
      });
      asphaltDrawLayerGroup.current.addLayer(rubberBand);

      // If >= 2 points, also rubberband back to first point to visualize closing polygon
      if (latLngs.length >= 2) {
        const closingBand = L.polyline([[cursorCoords.lat, cursorCoords.lng], latLngs[0]], {
          color: '#10b981',
          weight: 2,
          dashArray: '3, 5',
          opacity: 0.7
        });
        asphaltDrawLayerGroup.current.addLayer(closingBand);
      }
    }
  }, [isAsphaltDrawing, asphaltDrawingCoords, cursorCoords, lang]);

  // Render completed persistent Asphalt Polygon on map with central summary badge and edge dimensions
  useEffect(() => {
    if (!mapInstance.current || !asphaltLayerGroup.current) return;
    asphaltLayerGroup.current.clearLayers();

    if (!asphaltCalc || !asphaltCalc.polygon || asphaltCalc.polygon.length < 3 || !isAsphaltPolygonVisible) {
      return;
    }

    const validPoints = asphaltCalc.polygon.filter(p => isValidLatLng(p.y, p.x));
    const latLngs = validPoints.map(p => [p.y, p.x] as [number, number]);

    if (latLngs.length < 3) return;

    const poly = L.polygon(latLngs, {
      color: '#f59e0b',
      weight: 3.5,
      dashArray: '6, 6',
      fillColor: '#d97706',
      fillOpacity: 0.35,
      className: 'cursor-pointer hover:fill-opacity-50 transition-all'
    });

    poly.on('click', () => {
      setShowAsphaltModal(true);
    });

    asphaltLayerGroup.current.addLayer(poly);

    // Edge Dimension Badges on each side of the polygon
    const n = latLngs.length;
    for (let i = 0; i < n; i++) {
      const p1 = latLngs[i];
      const p2 = latLngs[(i + 1) % n];
      const midLat = (p1[0] + p2[0]) / 2;
      const midLng = (p1[1] + p2[1]) / 2;
      const distM = mapInstance.current.distance(p1, p2);
      const distLabel = distM >= 1000 
        ? `${(distM / 1000).toFixed(2)} ${lang === 'ar' ? 'كم' : 'km'}` 
        : `${distM.toFixed(1)} ${lang === 'ar' ? 'م' : 'm'}`;

      const edgeIcon = L.divIcon({
        className: 'asphalt-edge-badge',
        html: `
          <div style="
            background: rgba(15, 23, 42, 0.94);
            border: 1px solid rgba(245, 158, 11, 0.85);
            border-radius: 7px;
            padding: 2px 7px;
            color: #fef08a;
            font-family: monospace, system-ui;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 3px 8px rgba(0,0,0,0.6);
            transform: translate(-50%, -50%);
            pointer-events: none;
            white-space: nowrap;
            letter-spacing: -0.2px;
          ">
            ${distLabel}
          </div>
        `,
        iconAnchor: [0, 0]
      });

      const edgeMarker = L.marker([midLat, midLng], { icon: edgeIcon, interactive: false });
      asphaltLayerGroup.current.addLayer(edgeMarker);
    }

    // Central summary card with rich GIS data and clear anti-cramping layout
    const center = poly.getBounds().getCenter();
    const isAr = lang === 'ar';
    const summaryIcon = L.divIcon({
      className: 'asphalt-summary-badge',
      html: `
        <div style="
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.97) 0%, rgba(30, 41, 59, 0.95) 100%);
          border: 2px solid #f59e0b;
          border-radius: 18px;
          padding: 10px 14px;
          color: #ffffff;
          font-family: 'Cairo', system-ui, -apple-system, sans-serif;
          box-shadow: 0 14px 35px rgba(0,0,0,0.65), 0 0 20px rgba(245, 158, 11, 0.3);
          cursor: pointer;
          transform: translate(-50%, -50%);
          pointer-events: auto;
          min-width: 230px;
          max-width: 320px;
          width: max-content;
          direction: ${isAr ? 'rtl' : 'ltr'};
          user-select: none;
          text-align: right;
        ">
          <!-- Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 6px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 16px;">🚜</span>
              <span style="font-size: 13px; font-weight: 900; color: #fde047; white-space: nowrap;">${asphaltCalc.name}</span>
            </div>
            <span style="background: rgba(245, 158, 11, 0.25); border: 1px solid rgba(245, 158, 11, 0.6); color: #fbbf24; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; white-space: nowrap;">
              ${isAr ? '🔍 التفاصيل والحصر' : '🔍 Details'}
            </span>
          </div>

          <!-- Metrics 2x2 Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; font-size: 11px;">
            <!-- Area -->
            <div style="display: flex; flex-direction: column;">
              <span style="color: #94a3b8; font-size: 10px; font-weight: 600;">${isAr ? 'المساحة السطحية:' : 'Surface Area:'}</span>
              <span style="color: #38bdf8; font-weight: 900; font-family: monospace; font-size: 13.5px; white-space: nowrap;">
                ${asphaltCalc.areaM2.toLocaleString('en-US', { maximumFractionDigits: 1 })} <span style="font-size: 10px; color: #7dd3fc;">${isAr ? 'م²' : 'm²'}</span>
              </span>
            </div>

            <!-- Asphalt Weight -->
            <div style="display: flex; flex-direction: column;">
              <span style="color: #94a3b8; font-size: 10px; font-weight: 600;">${isAr ? 'وزن الأسفلت:' : 'Asphalt Weight:'}</span>
              <span style="color: #fb923c; font-weight: 900; font-family: monospace; font-size: 13.5px; white-space: nowrap;">
                ${asphaltCalc.weightTons.toLocaleString('en-US', { maximumFractionDigits: 1 })} <span style="font-size: 10px; color: #fdba74;">${isAr ? 'طن' : 'Tons'}</span>
              </span>
            </div>

            <!-- Perimeter -->
            <div style="display: flex; flex-direction: column;">
              <span style="color: #94a3b8; font-size: 10px; font-weight: 600;">${isAr ? 'المحيط الإجمالي:' : 'Perimeter:'}</span>
              <span style="color: #f1f5f9; font-weight: 800; font-family: monospace; font-size: 12px; white-space: nowrap;">
                ${asphaltCalc.perimeterM.toFixed(1)} <span style="font-size: 10px; color: #cbd5e1;">${isAr ? 'م' : 'm'}</span>
              </span>
            </div>

            <!-- Thickness -->
            <div style="display: flex; flex-direction: column;">
              <span style="color: #94a3b8; font-size: 10px; font-weight: 600;">${isAr ? 'سماكة الطبقة:' : 'Thickness:'}</span>
              <span style="color: #e2e8f0; font-weight: 800; font-family: monospace; font-size: 12px; white-space: nowrap;">
                ${asphaltCalc.thicknessCm} <span style="font-size: 10px; color: #cbd5e1;">${isAr ? 'سم' : 'cm'}</span>
              </span>
            </div>
          </div>

          <!-- Intersected network indicator if any -->
          ${asphaltCalc.intersectedPipesCount > 0 ? `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #7dd3fc;">
              <span>💧 ${isAr ? 'تقاطع شبكات الأنابيب:' : 'Pipes Intersected:'}</span>
              <strong style="font-family: monospace; font-size: 11px; color: #38bdf8;">${asphaltCalc.intersectedPipesCount} ${isAr ? 'خطوط' : 'lines'}</strong>
            </div>
          ` : ''}
        </div>
      `,
      iconAnchor: [0, 0]
    });

    const marker = L.marker(center, { icon: summaryIcon });
    marker.on('click', () => {
      setShowAsphaltModal(true);
    });
    asphaltLayerGroup.current.addLayer(marker);

    // Numbered vertex points on corners
    latLngs.forEach((coord, idx) => {
      const dotIcon = L.divIcon({
        className: 'custom-asphalt-vertex-pin',
        html: `
          <div style="
            width: 18px;
            height: 18px;
            background-color: #f59e0b;
            color: #0f172a;
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9.5px;
            font-weight: 900;
            box-shadow: 0 3px 8px rgba(0,0,0,0.5);
            transform: translate(-50%, -50%);
            font-family: monospace;
          ">
            ${idx + 1}
          </div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const dotMarker = L.marker(coord, { icon: dotIcon, interactive: false });
      asphaltLayerGroup.current?.addLayer(dotMarker);
    });
  }, [asphaltCalc, isAsphaltPolygonVisible, lang]);

  // Render active line segments, numbered vertices, and rubber-band guide on main map
  useEffect(() => {
    if (!mapInstance.current || !lineDrawLayerGroup.current) return;
    lineDrawLayerGroup.current.clearLayers();

    if (!activeLineVertices || activeLineVertices.length === 0) return;

    const latLngs = activeLineVertices.map(v => [v.y, v.x] as [number, number]);

    // Draw solid line for confirmed points
    if (latLngs.length >= 2) {
      const line = L.polyline(latLngs, {
        color: activeLineColor || '#3b82f6',
        weight: activeLineWidth || 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });
      lineDrawLayerGroup.current.addLayer(line);
    }

    // Numbered circular pins for each vertex
    activeLineVertices.forEach((v, idx) => {
      const isStart = idx === 0;
      const isLatest = idx === activeLineVertices.length - 1;
      const vertexColor = isStart ? '#10b981' : isLatest ? '#f59e0b' : (activeLineColor || '#3b82f6');

      const icon = L.divIcon({
        className: 'custom-vertex-pin',
        html: `
          <div style="
            width: 24px;
            height: 24px;
            background-color: ${vertexColor};
            color: #ffffff;
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 900;
            box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            transform: translate(-50%, -50%);
          ">
            ${idx + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([v.y, v.x], { icon, interactive: false });
      lineDrawLayerGroup.current?.addLayer(marker);
    });

    // Rubber-band dashed line connecting last vertex to cursor
    if (isLineDrawingMode && cursorCoords && latLngs.length >= 1) {
      const lastPt = latLngs[latLngs.length - 1];
      const rubberBand = L.polyline([lastPt, [cursorCoords.lat, cursorCoords.lng]], {
        color: activeLineColor || '#3b82f6',
        weight: Math.max(2, (activeLineWidth || 4) - 1),
        dashArray: '6, 6',
        opacity: 0.85
      });
      lineDrawLayerGroup.current.addLayer(rubberBand);
    }
  }, [activeLineVertices, isLineDrawingMode, activeLineColor, activeLineWidth, cursorCoords]);

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
        
        const safeId = escapeHtml(pt.id);
        const safeIssueReason = escapeHtml(issueReasonText);
        const safeStreet = escapeHtml(pt.street);
        const safeDistrict = escapeHtml(pt.district);

        let popupContent = `<div class="p-3 min-w-[240px] font-sans" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
          <div class="font-bold text-primary border-b border-slate-200 pb-2 mb-2 text-[13px] flex items-center justify-between">
            <span>${safeId}</span>
            ${hasIssue && issueReasonText ? `<span class="bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">⚠️ ${lang === 'ar' ? 'عنصر به ملاحظة' : 'Issue Found'}</span>` : ''}
          </div>`;
        if (hasIssue && issueReasonText) {
          popupContent += `<div class="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[11px] font-medium space-y-1 shadow-sm">
            <div class="flex items-center gap-1.5 font-bold text-red-800 border-b border-red-200/60 pb-1 mb-1">
              <span>⚠️</span>
              <span>${lang === 'ar' ? 'نوع الملاحظة / التدقيق:' : 'Audit Issue Type:'}</span>
            </div>
            <p class="text-[11px] leading-relaxed text-red-950 font-black">
              ${safeIssueReason}
            </p>
          </div>`;
        }
        
        if (pt.street || pt.district) {
          popupContent += `<div class="space-y-1.5 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
            ${pt.street ? `<div class="text-[10px] leading-tight"><span class="text-slate-500 block font-bold uppercase mb-0.5">${lang === 'ar' ? 'الشارع' : 'Street'}</span> <span class="font-bold text-slate-800">${safeStreet}</span></div>` : ''}
            ${pt.district ? `<div class="text-[10px] leading-tight"><span class="text-slate-500 block font-bold uppercase mb-0.5">${lang === 'ar' ? 'الحي' : 'District'}</span> <span class="font-bold text-slate-800">${safeDistrict}</span></div>` : ''}
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
                  html: `<span>${escapeHtml(pt.id)}</span>`,
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
              const statusColor = pipeHyd.sewerStatus === 'Lift Station Needed' ? '#ef4444' : (pipeHyd.sewerStatus === 'Drop Manhole' ? '#f59e0b' : '#10b981');
              const statusBg = pipeHyd.sewerStatus === 'Lift Station Needed' ? 'bg-red-500/20 text-red-300 border-red-500/40' : (pipeHyd.sewerStatus === 'Drop Manhole' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40');

              popupContent += `<div class="mb-3 p-3 rounded-2xl bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900 text-[11px] font-medium space-y-2 shadow-xl border border-cyan-500/40 text-white">
                <div class="flex items-center justify-between border-b border-cyan-500/20 pb-1.5 font-bold">
                  <span class="text-cyan-300 flex items-center gap-1">🌊 ${lang === 'ar' ? 'شبكة الانحدار والهيدروليكا (Manning):' : 'Gravity Sewer & Hydraulics:'}</span>
                  <span class="text-[9.5px] px-2 py-0.5 rounded-full font-bold shadow border ${statusBg}">
                    ${lang === 'ar' ? (pipeHyd.sewerStatus === 'Lift Station Needed' ? '🚨 محطة رفع مطلوبة' : (pipeHyd.sewerStatus === 'Drop Manhole' ? '⚠️ منهول هدار' : '✅ انحدار طبيعي')) : (pipeHyd.sewerStatus || 'Normal Gravity')}
                  </span>
                </div>

                ${pipeHyd.glStart !== undefined ? `
                <div class="p-2 rounded-xl bg-slate-950/60 border border-cyan-500/20 space-y-1">
                  <div class="text-[9.5px] font-bold text-cyan-300 flex items-center justify-between">
                    <span>${lang === 'ar' ? 'مناسيب الأرض والقاع (GL / IL):' : 'Ground & Invert Levels:'}</span>
                    <span class="text-white/60 font-mono">${pipeHyd.upstreamNode} ➔ ${pipeHyd.downstreamNode}</span>
                  </div>
                  <div class="grid grid-cols-2 gap-1 text-[9.5px] font-mono">
                    <div class="bg-white/5 px-2 py-1 rounded"><span class="text-slate-400">GL Start:</span> <b class="text-amber-300">${pipeHyd.glStart.toFixed(2)}m</b></div>
                    <div class="bg-white/5 px-2 py-1 rounded"><span class="text-slate-400">GL End:</span> <b class="text-amber-300">${pipeHyd.glEnd?.toFixed(2)}m</b></div>
                    <div class="bg-white/5 px-2 py-1 rounded"><span class="text-slate-400">IL Start:</span> <b class="text-emerald-300">${pipeHyd.ilStart?.toFixed(2)}m</b></div>
                    <div class="bg-white/5 px-2 py-1 rounded"><span class="text-slate-400">IL End:</span> <b class="text-emerald-300">${pipeHyd.ilEnd?.toFixed(2)}m</b></div>
                    <div class="bg-white/5 px-2 py-1 rounded col-span-2 flex justify-between"><span class="text-slate-400">${lang === 'ar' ? 'عمق الحفر:' : 'Depth:'}</span> <b class="text-cyan-300">${pipeHyd.depthStart?.toFixed(2)}m ➔ ${pipeHyd.depthEnd?.toFixed(2)}m</b></div>
                  </div>
                </div>` : ''}
                
                <div class="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'السرعة V:' : 'Velocity:'}</span> <b style="color:${pipeHyd.velocityColor}" class="font-mono">${pipeHyd.velocity.toFixed(2)} m/s</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'القطر D:' : 'Diameter:'}</span> <b class="text-white font-mono">${pipeHyd.diameterMm} mm</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'الميل S:' : 'Slope:'}</span> <b class="text-white font-mono">${pipeHyd.slopePercent.toFixed(2)}%</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5"><span class="text-white/60">${lang === 'ar' ? 'التصريف Q:' : 'Max Q:'}</span> <b class="text-blue-300 font-mono">${pipeHyd.maxCapacityLs.toFixed(1)} L/s</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5 col-span-2"><span class="text-white/60">${lang === 'ar' ? 'التصريف 75%:' : 'Design Q75%:'}</span> <b class="text-emerald-300 font-mono">${pipeHyd.designCapacity75Ls.toFixed(1)} L/s</b></div>
                  <div class="bg-black/30 p-1.5 rounded-lg border border-white/5 col-span-2"><span class="text-white/60">${lang === 'ar' ? 'الاتجاه:' : 'Direction:'}</span> <b class="text-cyan-200 font-mono">${pipeHyd.flowDirectionTextAr}</b></div>
                  ${pipeHyd.sewerStatusReasonAr ? `<div class="bg-black/30 p-1.5 rounded-lg border border-white/5 col-span-2 text-[9px] text-amber-200">${pipeHyd.sewerStatusReasonAr}</div>` : ''}
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

            if (activeColorMode === 'catchment') {
              const catchmentColor = (pipeHyd as any)?.catchmentColor || (pt.attributes && (pt.attributes['Catchment_Color'] || pt.attributes['لون_الحوض']));
              flowLineColor = catchmentColor || featColor || '#06b6d4';
              flowAnimClass = isFlowActive ? 'flow-anim-optimal' : undefined;
            } else if (activeColorMode === 'velocity') {
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
          } else if (pt.iconUrl && sanitizeImageUrl(pt.iconUrl)) {
            const safeUrl = sanitizeImageUrl(pt.iconUrl)!;
            const customIcon = L.divIcon({
              className: 'bg-transparent border-0',
              html: `<div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                       <img src="${safeUrl}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                       ${pt.color ? `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background-color:${escapeHtml(pt.color)}; mix-blend-mode: multiply; -webkit-mask-image: url('${safeUrl}'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('${safeUrl}'); mask-size: contain; mask-repeat: no-repeat; mask-position: center; pointer-events: none;"></div>` : ''}
                       <div style="display:none; width:14px; height:14px; background-color:${escapeHtml(featColor || '#3b82f6')}; border:2px solid ${isOverlap ? '#000000' : '#fff'}; border-radius:50%;"></div>
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
    if (showFlowDirection && showOutfalls) {
      // Collect all outfalls (both explicitly provided targets and detected outfall nodes)
      const combinedOutfallsMap = new Map<string, {
        id: string;
        name: string;
        x: number;
        y: number;
        z?: number;
        elevation?: number;
        inflowCount?: number;
        totalInflowCapacityLs?: number;
        color?: string;
        isTarget?: boolean;
        furthestPipe?: OutfallFurthestPipeInfo;
        isDistanceExceeded?: boolean;
      }>();

      // 1. Add explicitly configured outfall targets
      if (outfallTargets && outfallTargets.length > 0) {
        outfallTargets.forEach((t, idx) => {
          if (!isValidLatLng(t.y, t.x)) return;
          combinedOutfallsMap.set(t.id || `target-${idx}`, {
            id: t.id || `target-${idx}`,
            name: t.name || (lang === 'ar' ? `مصب ${idx + 1}` : `Outfall ${idx + 1}`),
            x: t.x,
            y: t.y,
            z: t.z,
            color: t.color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length],
            isTarget: true,
            furthestPipe: t.furthestPipe,
            isDistanceExceeded: t.isDistanceExceeded || t.furthestPipe?.exceedsStandard
          });
        });
      } else if (flowAnalysis?.outfallNodes && (!outfallTargets || outfallTargets.length === 0)) {
        // 2. Add or merge engine detected outfalls (only natural network sinks if no custom targets or cleared)
        flowAnalysis.outfallNodes.forEach((node, idx) => {
          if (!isValidLatLng(node.y, node.x)) return;
          // Skip if this was an explicit custom target that has been cleared
          if ((node as any).isTarget || (node as any).isExplicitTarget || node.id?.startsWith('OUTFALL_') || node.id?.startsWith('target-')) return;
          const key = node.id || `outfall-${idx}`;
          const existing = combinedOutfallsMap.get(key);
          const nodeFurthest = (node as any).furthestPipe as OutfallFurthestPipeInfo | undefined;
          const nodeExceeded = (node as any).isDistanceExceeded || nodeFurthest?.exceedsStandard;

          if (existing) {
            existing.inflowCount = node.inflowCount ?? existing.inflowCount;
            existing.elevation = node.elevation ?? existing.elevation;
            if (nodeFurthest) existing.furthestPipe = nodeFurthest;
            if (nodeExceeded !== undefined) existing.isDistanceExceeded = nodeExceeded;
          } else {
            combinedOutfallsMap.set(key, {
              id: node.id,
              name: (node as any).name || (lang === 'ar' ? `مصب رئيسي (${node.id})` : `Main Outfall (${node.id})`),
              x: node.x,
              y: node.y,
              elevation: node.elevation,
              inflowCount: node.inflowCount,
              color: (node as any).color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length],
              isTarget: false,
              furthestPipe: nodeFurthest,
              isDistanceExceeded: nodeExceeded
            });
          }
        });
      }

      combinedOutfallsMap.forEach(outfall => {
        if (!isValidLatLng(outfall.y, outfall.x)) return;

        const outfallColor = outfall.color || '#ef4444';
        const furthest = outfall.furthestPipe;
        const exceedsDistance = !!(outfall.isDistanceExceeded || furthest?.exceedsStandard);

        // Render critical distance ray vector line if furthest pipe exists
        if (furthest && furthest.furthestPoint && isValidLatLng(furthest.furthestPoint.y, furthest.furthestPoint.x)) {
          const rayLatLngs: [number, number][] = [
            [outfall.y, outfall.x],
            [furthest.furthestPoint.y, furthest.furthestPoint.x]
          ];

          const rayColor = exceedsDistance ? '#ef4444' : '#f59e0b';
          const rayWeight = exceedsDistance ? 3 : 1.5;

          // Dashed vector ray line
          L.polyline(rayLatLngs, {
            color: rayColor,
            weight: rayWeight,
            dashArray: exceedsDistance ? '8, 8' : '4, 8',
            opacity: exceedsDistance ? 0.95 : 0.5,
          }).addTo(layerGroup.current!);

          // Center distance badge on ray
          const midLat = (outfall.y + furthest.furthestPoint.y) / 2;
          const midLng = (outfall.x + furthest.furthestPoint.x) / 2;
          const distLabel = furthest.distanceMeters >= 1000 
            ? `${(furthest.distanceMeters / 1000).toFixed(2)} كم`
            : `${furthest.distanceMeters.toFixed(0)} م`;

          const rayBadgeIcon = L.divIcon({
            className: 'bg-transparent border-0',
            html: `
              <div style="transform: translate(-50%, -50%);" class="pointer-events-auto cursor-pointer">
                <div class="px-2.5 py-1 rounded-full shadow-2xl font-black text-[10px] flex items-center gap-1.5 border whitespace-nowrap transition-transform hover:scale-110 active:scale-95 ${
                  exceedsDistance 
                    ? 'bg-red-950/95 text-rose-200 border-red-500/80 shadow-red-900/60' 
                    : 'bg-slate-900/90 text-amber-300 border-amber-500/50 shadow-black/80'
                }">
                  <span>${exceedsDistance ? '🚨' : '📏'}</span>
                  <span>${lang === 'ar' ? 'أبعد خط:' : 'Furthest Pipe:'} <b>${distLabel}</b></span>
                  ${exceedsDistance ? `<span class="bg-red-600 text-white text-[8.5px] px-1.5 py-0.2 rounded-full font-sans font-bold">${lang === 'ar' ? 'يتجاوز 1500م' : '> 1500m'}</span>` : ''}
                </div>
              </div>
            `,
            iconSize: [120, 24],
            iconAnchor: [60, 12]
          });

          const rayBadgeMarker = L.marker([midLat, midLng], { icon: rayBadgeIcon, zIndexOffset: 12000 }).addTo(layerGroup.current!);
          rayBadgeMarker.on('click', () => {
            (window as any).__focusFurthestPipe?.(furthest.furthestPoint.x, furthest.furthestPoint.y, outfall.x, outfall.y);
          });

          // Endpoint pin marker on the furthest pipe if exceeded
          if (exceedsDistance) {
            const endPinIcon = L.divIcon({
              className: 'bg-transparent border-0',
              html: `
                <div style="position:relative; width:26px; height:26px; display:flex; align-items:center; justify-content:center; transform:translate(-50%, -50%);">
                  <div style="position:absolute; width:100%; height:100%; background:#ef444444; border:2px solid #ef4444; border-radius:50%; animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
                  <div style="position:relative; width:20px; height:20px; background:#ef4444; border:2px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:10px; font-weight:900; box-shadow:0 0 10px #ef4444;">
                    ⚠️
                  </div>
                </div>
              `,
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            });
            const endMarker = L.marker([furthest.furthestPoint.y, furthest.furthestPoint.x], { icon: endPinIcon, zIndexOffset: 14000 }).addTo(layerGroup.current!);
            endMarker.bindTooltip(
              `<div class="p-1 font-bold text-[10px] text-red-300 bg-red-950/90 rounded border border-red-500/40">${lang === 'ar' ? `أبعد نقطة موجهة للمصب (${distLabel})` : `Furthest Point to Outfall (${distLabel})`}</div>`,
              { sticky: true, direction: 'top' }
            );
          }
        }

        const outfallHtml = `
          <div style="position:relative; width:38px; height:38px; display:flex; align-items:center; justify-content:center;">
            <div style="position:absolute; width:100%; height:100%; border:2.5px dashed ${exceedsDistance ? '#ef4444' : outfallColor}; border-radius:50%; animation: spin 6s linear infinite; opacity:0.9;"></div>
            <div style="position:absolute; width:30px; height:30px; background-color:${exceedsDistance ? '#ef444433' : outfallColor + '33'}; border:2px solid ${exceedsDistance ? '#ef4444' : outfallColor}; border-radius:50%; animation: ping 2.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="position:relative; width:26px; height:26px; background:${outfallColor}; border:2.5px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:13px; box-shadow:0 0 16px ${exceedsDistance ? '#ef4444ee' : outfallColor + 'ee'}; font-weight:bold;">
              🌊
            </div>
            ${exceedsDistance ? `
              <div style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; background:#dc2626; border:2px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:10px; font-weight:900; box-shadow:0 2px 8px rgba(0,0,0,0.6); animation: bounce 1.5s infinite;">
                ⚠️
              </div>
            ` : ''}
          </div>
        `;

        const outfallIcon = L.divIcon({
          className: 'bg-transparent border-0',
          html: outfallHtml,
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        });

        const furthestDistStr = furthest 
          ? (furthest.distanceMeters >= 1000 ? `${(furthest.distanceMeters / 1000).toFixed(2)} كم` : `${furthest.distanceMeters.toFixed(0)} م`)
          : undefined;

        let warningBlockHtml = '';
        if (furthest) {
          if (exceedsDistance) {
            warningBlockHtml = `
              <div class="my-2 p-2.5 rounded-xl bg-gradient-to-br from-red-950/95 to-slate-950 border border-red-500/60 text-rose-200 text-[10px] space-y-1.5 shadow-lg">
                <div class="flex items-center justify-between font-black text-rose-300 border-b border-red-500/30 pb-1">
                  <span class="flex items-center gap-1">
                    <span>⚠️</span>
                    <span>${lang === 'ar' ? 'تنبيه المعايير الهيدروليكية المعتمدة' : 'Hydraulic Standard Exceeded'}</span>
                  </span>
                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-red-600 text-white font-mono font-bold">${lang === 'ar' ? 'مسافة مفرطة' : 'Excessive Run'}</span>
                </div>
                <div class="text-[9.5px] leading-relaxed text-slate-200">
                  ${lang === 'ar' 
                    ? `المسافة بين هذا المصب وأبعد خط موجه إليه (<b>${furthestDistStr}</b>) تتجاوز الحد الأقصى المعتمد للشبكات الانحدارية (<b>1,500 م</b>).`
                    : `Distance to furthest pipe (<b>${furthestDistStr}</b>) exceeds recommended gravity limit (<b>1,500 m</b>).`}
                </div>
                <div class="text-[9px] text-amber-300 font-semibold bg-amber-950/40 p-1.5 rounded-lg border border-amber-500/30">
                  💡 ${lang === 'ar' ? 'يُوصى بنقل المصب أو إضافة مصب وسيط أو محطة رفع لتجنب أعماق الحفر الزائدة (>6م).' : 'Recommended to add intermediate outfall or lift station to avoid deep trenches (>6m).'}
                </div>
                <button
                  type="button"
                  onclick="window.__focusFurthestPipe && window.__focusFurthestPipe(${furthest.furthestPoint.x}, ${furthest.furthestPoint.y}, ${outfall.x}, ${outfall.y})"
                  class="w-full py-1 px-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[9.5px] transition-all cursor-pointer flex items-center justify-center gap-1 mt-1 shadow"
                >
                  <span>🔍</span>
                  <span>${lang === 'ar' ? 'تكبير ومطابقة أبعد خط والمسار الحرج' : 'Focus Furthest Pipe & Critical Span'}</span>
                </button>
              </div>
            `;
          } else {
            warningBlockHtml = `
              <div class="my-1.5 p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-[10px] flex items-center justify-between">
                <span class="flex items-center gap-1 font-bold text-emerald-300">
                  <span>✅</span>
                  <span>${lang === 'ar' ? 'أبعد خط موجه:' : 'Furthest Pipe:'}</span>
                </span>
                <span class="font-mono font-bold text-emerald-100">${furthestDistStr} (${lang === 'ar' ? 'ضمن المعايير ≤ 1.5 كم' : 'Compliant ≤ 1.5km'})</span>
              </div>
            `;
          }
        }

        const outfallMarker = L.marker([outfall.y, outfall.x], { icon: outfallIcon, zIndexOffset: 15000 });
        outfallMarker.bindPopup(`
          <div class="p-3.5 bg-[#081e2b] text-white rounded-2xl font-sans min-w-[250px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
            <div class="flex items-center justify-between border-b border-cyan-500/30 pb-2 mb-2">
              <div class="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                <span class="text-base" style="color:${outfallColor}">🌊</span>
                <span>${outfall.name}</span>
              </div>
              <span class="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold" style="background:${outfallColor}33; color:${outfallColor}; border:1px solid ${outfallColor}66;">
                ${outfall.id}
              </span>
            </div>
            <div class="text-[11px] space-y-1.5 text-slate-200">
              <div class="flex items-center justify-between">
                <b>${lang === 'ar' ? 'الموقع الجغرافي:' : 'Location'}:</b>
                <span class="font-mono text-cyan-200 text-[10px] dir-ltr">${outfall.y.toFixed(5)}, ${outfall.x.toFixed(5)}</span>
              </div>
              ${outfall.inflowCount !== undefined ? `
              <div class="flex items-center justify-between">
                <b>${lang === 'ar' ? 'عدد الأنابيب المصبة:' : 'Connected Pipes'}:</b>
                <span class="font-bold text-cyan-300 font-mono">${outfall.inflowCount} ${lang === 'ar' ? 'خط' : 'pipes'}</span>
              </div>` : ''}
              ${outfall.elevation !== undefined ? `
              <div class="flex items-center justify-between">
                <b>${lang === 'ar' ? 'منسوب الأرض (GL):' : 'Ground Level (GL)'}:</b>
                <span class="font-bold text-emerald-400 font-mono">${outfall.elevation.toFixed(2)} م</span>
              </div>` : ''}

              ${warningBlockHtml}

              <div class="pt-2 border-t border-white/10 flex flex-col gap-1.5 mt-2">
                <button
                  type="button"
                  onclick="window.__orientTowardsOutfall && window.__orientTowardsOutfall(${outfall.x}, ${outfall.y})"
                  class="w-full py-1.5 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black rounded-xl text-[10.5px] transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🌊</span>
                  <span>${lang === 'ar' ? 'توجيه الشبكة نحو هذا المصب' : 'Orient Network to this Outfall'}</span>
                </button>
                <button
                  type="button"
                  onclick="window.__removeOutfallTarget && window.__removeOutfallTarget('${outfall.id}')"
                  class="w-full py-1.5 px-3 bg-red-950/80 hover:bg-red-900 text-rose-200 border border-red-500/40 rounded-xl text-[10px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  <span>🗑️</span>
                  <span>${lang === 'ar' ? 'حذف هذا المصب' : 'Remove This Outfall'}</span>
                </button>
                <button
                  type="button"
                  onclick="window.__clearAllOutfalls && window.__clearAllOutfalls()"
                  class="w-full py-1 px-3 bg-slate-900/90 hover:bg-slate-800 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-[9.5px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🧹</span>
                  <span>${lang === 'ar' ? 'حذف جميع المصبات التلقائية' : 'Clear All Auto Outfalls'}</span>
                </button>
              </div>
            </div>
          </div>
        `);
        outfallMarker.addTo(layerGroup.current!);
      });
    }

    // Render Lift Station and Drop Manhole Alerts when Flow / Gravity is active
    if (showFlowDirection && activeHydraulicSummary) {
      // Lift Station Nodes
      if (activeHydraulicSummary.liftStationNodes) {
        activeHydraulicSummary.liftStationNodes.forEach(ls => {
          if (!isValidLatLng(ls.y, ls.x)) return;
          const lsIcon = L.divIcon({
            className: 'bg-transparent border-0',
            html: `
              <div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                <div style="position:absolute; width:100%; height:100%; background-color:#ef4444; border-radius:50%; opacity:0.5; animation: ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
                <div style="position:relative; width:24px; height:24px; background:linear-gradient(135deg, #dc2626, #991b1b); border:2px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:11px; box-shadow:0 3px 10px rgba(220,38,38,0.8);">
                  ⚡
                </div>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          const lsMarker = L.marker([ls.y, ls.x], { icon: lsIcon, zIndexOffset: 16000 });
          lsMarker.bindPopup(`
            <div class="p-3 bg-[#1e1014] text-white rounded-2xl font-sans min-w-[220px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
              <div class="flex items-center gap-2 text-rose-400 font-bold border-b border-rose-500/30 pb-2 mb-2 text-xs">
                <span>🚨</span>
                <span>${lang === 'ar' ? 'مقترح محطة رفع (Lift Station)' : 'Lift Station Required'}</span>
              </div>
              <div class="text-[11px] space-y-1.5 text-slate-200">
                <div class="text-rose-200 bg-rose-950/60 p-2 rounded-xl border border-rose-500/30">${ls.reasonAr}</div>
                <div><b>${lang === 'ar' ? 'العمق المحسوب:' : 'Depth Required:'}</b> <span class="font-bold text-amber-300 font-mono">${ls.requiredDepth.toFixed(2)} م</span></div>
                <div><b>${lang === 'ar' ? 'معرف الخط:' : 'Pipe ID:'}</b> <span class="font-bold text-white font-mono">${ls.pipeId}</span></div>
                <div class="text-[10px] text-rose-400/80 dir-ltr font-mono">${ls.y.toFixed(6)}, ${ls.x.toFixed(6)}</div>
              </div>
            </div>
          `);
          lsMarker.addTo(layerGroup.current!);
        });
      }

      // Drop Manholes Nodes
      if (activeHydraulicSummary.dropManholeNodes) {
        activeHydraulicSummary.dropManholeNodes.forEach(dm => {
          if (!isValidLatLng(dm.y, dm.x)) return;
          const dmIcon = L.divIcon({
            className: 'bg-transparent border-0',
            html: `
              <div style="position:relative; width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
                <div style="position:relative; width:22px; height:22px; background:linear-gradient(135deg, #f59e0b, #b45309); border:2px solid #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:10px; box-shadow:0 2px 8px rgba(245,158,11,0.7);">
                  🪜
                </div>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          const dmMarker = L.marker([dm.y, dm.x], { icon: dmIcon, zIndexOffset: 14000 });
          dmMarker.bindPopup(`
            <div class="p-3 bg-[#1e1a0e] text-white rounded-2xl font-sans min-w-[200px]" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
              <div class="flex items-center gap-2 text-amber-400 font-bold border-b border-amber-500/30 pb-2 mb-2 text-xs">
                <span>🪜</span>
                <span>${lang === 'ar' ? 'منهول هدار (Drop Manhole)' : 'Drop Manhole'}</span>
              </div>
              <div class="text-[11px] space-y-1 text-slate-200">
                <div><b>${lang === 'ar' ? 'مقدار الهبوط (الهدار):' : 'Drop Height:'}</b> <span class="font-bold text-amber-300 font-mono">${dm.dropMeters.toFixed(2)} م</span></div>
                <div><b>${lang === 'ar' ? 'معرف الخط:' : 'Pipe ID:'}</b> <span class="font-bold text-white font-mono">${dm.pipeId}</span></div>
                <div class="text-[10px] text-amber-400/80 dir-ltr font-mono">${dm.y.toFixed(6)}, ${dm.x.toFixed(6)}</div>
              </div>
            </div>
          `);
          dmMarker.addTo(layerGroup.current!);
        });
      }
    }

    // Auto-zoom logic: Triggered when dataId changes or when new points arrive for the first time
    if (dataId && dataId !== lastDataIdRef.current) {
        zoomToDataExtent();
        lastDataIdRef.current = dataId;
    }
  }, [points, lang, focusedColor, isDrawing, dataId, zoomToDataExtent, overlapResults, showPolygons, showLines, showPoints, showOutfalls, showIssuesOnly, selectedProfilePoints, showFlowDirection, flowAnalysis, activeColorMode, activeHydraulicSummary, outfallTargets]);

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

  // Close open layer menu, flow info overlay, search results dropdown, and filter modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (layerMenuRef.current && !layerMenuRef.current.contains(target) && !layerToggleBtnRef.current?.contains(target)) {
        setShowLayerMenu(false);
      }
      if (flowInfoOverlayRef.current && !flowInfoOverlayRef.current.contains(target) && !flowInfoBtnRef.current?.contains(target)) {
        setShowFlowInfoOverlay(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setShowSearchResultsDropdown(false);
      }
      if (filterModalRef.current && !filterModalRef.current.contains(target) && !(target as HTMLElement).closest?.('.filter-toggle-btn')) {
        setShowSearchFiltersModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Street & Location Search Execution
  const performStreetSearch = useCallback(async (
    query: string, 
    tab: 'all' | 'project' | 'global',
    filtersOverride?: StreetSearchFilters
  ) => {
    const activeFilters = filtersOverride || searchFilters;
    const trimmed = query.trim();
    const hasActiveFilter = !!(activeFilters.countryCode || activeFilters.city || activeFilters.district);

    if (!trimmed && !hasActiveFilter) {
      setSearchResults([]);
      setShowSearchResultsDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      let projectMatches: StreetSearchResult[] = [];
      let globalMatches: StreetSearchResult[] = [];

      // 1. Search local project dataset (streets, lines, points)
      if (tab === 'all' || tab === 'project') {
        projectMatches = searchProjectStreets(points, trimmed, lang, activeFilters, 10);
      }

      // 2. Search global OpenStreetMap geocoder across all map types with classification filters
      if (tab === 'all' || tab === 'global') {
        let center: { lat: number; lng: number } | undefined = undefined;
        if (mapInstance.current) {
          const mapCenter = mapInstance.current.getCenter();
          center = { lat: mapCenter.lat, lng: mapCenter.lng };
        }
        globalMatches = await searchGlobalStreets(trimmed, lang, center, activeFilters, 10);
      }

      let combined: StreetSearchResult[] = [];
      if (tab === 'project') {
        combined = projectMatches;
      } else if (tab === 'global') {
        combined = globalMatches;
      } else {
        combined = [...projectMatches, ...globalMatches];
      }

      setSearchResults(combined);
      setShowSearchResultsDropdown(combined.length > 0);
    } catch (err) {
      console.warn('Error during street search:', err);
    } finally {
      setIsSearching(false);
    }
  }, [points, lang, searchFilters]);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (!value.trim() && !searchFilters.city && !searchFilters.district) {
      setSearchResults([]);
      setShowSearchResultsDropdown(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      performStreetSearch(value, searchActiveTab);
    }, 280);
  };

  const handleSearchTabChange = (newTab: 'all' | 'project' | 'global') => {
    setSearchActiveTab(newTab);
    if (searchQuery.trim() || searchFilters.city || searchFilters.district) {
      performStreetSearch(searchQuery, newTab);
    }
  };

  const handleApplyFilterUpdate = (newFilters: Partial<StreetSearchFilters>) => {
    const updated: StreetSearchFilters = { ...searchFilters, ...newFilters };
    setSearchFilters(updated);
    performStreetSearch(searchQuery, searchActiveTab, updated);
  };

  const handleClearSingleFilter = (key: keyof StreetSearchFilters) => {
    const updated = { ...searchFilters };
    if (key === 'countryCode') {
      updated.countryCode = '';
      updated.countryName = '';
      updated.city = '';
      updated.district = '';
    } else if (key === 'city') {
      updated.city = '';
      updated.district = '';
    } else if (key === 'district') {
      updated.district = '';
    }
    setSearchFilters(updated);
    performStreetSearch(searchQuery, searchActiveTab, updated);
  };

  const handleResetFilters = () => {
    const emptyFilters: StreetSearchFilters = {
      countryCode: '',
      countryName: '',
      city: '',
      district: ''
    };
    setSearchFilters(emptyFilters);
    performStreetSearch(searchQuery, searchActiveTab, emptyFilters);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (searchQuery.trim()) {
      performStreetSearch(searchQuery, searchActiveTab);
      // If there's already a top result, select it on Enter
      if (searchResults.length > 0) {
        handleSelectSearchResult(searchResults[0]);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResultsDropdown(false);
    setSelectedSearchResult(null);
    if (searchHighlightGroup.current) {
      searchHighlightGroup.current.clearLayers();
    }
    mapInstance.current?.closePopup();
  };

  const handleSelectSearchResult = (item: StreetSearchResult) => {
    if (!mapInstance.current) return;
    
    setSelectedSearchResult(item);
    setShowSearchResultsDropdown(false);
    if (searchHighlightGroup.current) {
      searchHighlightGroup.current.clearLayers();
    }

    const { lat, lng, bbox, path, name, secondaryText, badge, badgeColor } = item;

    // A) If result has a full vector path (CAD / GIS LineString)
    if (path && path.length > 0) {
      const validLatLngs = path.filter(p => isValidLatLng(p.y, p.x)).map(p => [p.y, p.x] as [number, number]);
      if (validLatLngs.length >= 2) {
        // Outer glowing outline
        L.polyline(validLatLngs, {
          color: '#ffffff',
          weight: 9,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(searchHighlightGroup.current!);

        // Inner vibrant animated dashed line
        L.polyline(validLatLngs, {
          color: badgeColor || '#06b6d4',
          weight: 5,
          opacity: 1,
          dashArray: '8, 8',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(searchHighlightGroup.current!);

        const bounds = L.latLngBounds(validLatLngs);
        mapInstance.current.fitBounds(bounds, { padding: [100, 100], maxZoom: 18, animate: true });
      }
    } else if (bbox && bbox.length >= 4 && isValidLatLng(bbox[0], bbox[2]) && isValidLatLng(bbox[1], bbox[3])) {
      // B) If result has a bounding box (Global Street / District)
      mapInstance.current.fitBounds([[bbox[0], bbox[2]], [bbox[1], bbox[3]]], {
        padding: [90, 90],
        maxZoom: 18,
        animate: true
      });
    } else if (isValidLatLng(lat, lng)) {
      // C) Point / Coordinates flight
      mapInstance.current.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
    }

    // Add animated Pulsing Street Marker on Map
    if (isValidLatLng(lat, lng)) {
      const streetMarkerIcon = L.divIcon({
        className: 'bg-transparent border-0',
        html: `
          <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center;">
            <div style="position:absolute; width:100%; height:100%; background-color:${badgeColor || '#06b6d4'}; border-radius:50%; opacity:0.45; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="position:relative; width:34px; height:34px; background:linear-gradient(135deg, #091e2b, #030d14); border:2.5px solid ${badgeColor || '#06b6d4'}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:16px; box-shadow:0 6px 18px rgba(0,0,0,0.8);">
              🛣️
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const highlightMarker = L.marker([lat, lng], { icon: streetMarkerIcon, zIndexOffset: 25000 });
      
      const popupHtml = `
        <div class="p-3.5 bg-[#081e2b] text-white rounded-2xl font-sans min-w-[260px] shadow-2xl border border-cyan-500/40" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
          <div class="flex items-center justify-between border-b border-cyan-500/30 pb-2 mb-2">
            <div class="flex items-center gap-2 text-cyan-300 font-bold text-xs">
              <span class="text-base">🛣️</span>
              <span class="truncate max-w-[170px]">${escapeHtml(name)}</span>
            </div>
            <span class="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold" style="background:${badgeColor || '#06b6d4'}33; color:${badgeColor || '#06b6d4'}; border:1px solid ${badgeColor || '#06b6d4'}66;">
              ${escapeHtml(badge)}
            </span>
          </div>

          <div class="text-[11px] space-y-1.5 text-slate-200">
            ${secondaryText ? `
              <div class="text-[10px] text-slate-300 bg-slate-900/80 p-2 rounded-xl border border-white/10">
                ${escapeHtml(secondaryText)}
              </div>
            ` : ''}

            <div class="flex items-center justify-between pt-1">
              <b class="text-slate-400">${lang === 'ar' ? 'الإحداثيات:' : 'Coords'}:</b>
              <span class="font-mono text-cyan-200 text-[10px] dir-ltr">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
            </div>

            ${item.lengthM ? `
              <div class="flex items-center justify-between">
                <b class="text-slate-400">${lang === 'ar' ? 'الطول الإجمالي:' : 'Total Length'}:</b>
                <span class="font-bold text-emerald-400 font-mono">
                  ${item.lengthM >= 1000 ? `${(item.lengthM / 1000).toFixed(2)} كم` : `${item.lengthM.toFixed(1)} م`}
                </span>
              </div>
            ` : ''}

            <div class="pt-2 border-t border-white/10 flex gap-1.5 mt-2">
              <button
                type="button"
                onclick="window.__copySearchCoords && window.__copySearchCoords(${lat}, ${lng})"
                class="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-[10px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
              >
                <span>📋</span>
                <span>${lang === 'ar' ? 'نسخ الإحداثيات' : 'Copy Coords'}</span>
              </button>
              <button
                type="button"
                onclick="window.__clearSearchHighlight && window.__clearSearchHighlight()"
                class="py-1.5 px-3 bg-red-950/80 hover:bg-red-900 text-rose-200 border border-red-500/40 rounded-xl text-[10px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
              >
                <span>✕</span>
                <span>${lang === 'ar' ? 'إزالة' : 'Clear'}</span>
              </button>
            </div>
          </div>
        </div>
      `;

      highlightMarker.bindPopup(popupHtml, { offset: [0, -10] });
      highlightMarker.addTo(searchHighlightGroup.current!);
      setTimeout(() => {
        highlightMarker.openPopup();
      }, 300);
    }
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

        {/* Visual Alert Banner for Outfall Hydraulic Distance Standard Exceeded */}
        {showFlowDirection && exceededOutfalls.length > 0 && !dismissedDistanceAlert && (
          <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-[650] max-w-[94vw] sm:max-w-xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-3 bg-gradient-to-r from-red-950/95 via-slate-950/95 to-red-950/95 backdrop-blur-2xl border-2 border-red-500/80 rounded-2xl shadow-2xl shadow-red-950/80 text-white text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 border-b border-red-500/30 pb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-red-600/30 border border-red-500 flex items-center justify-center text-red-300 text-base animate-pulse">
                    ⚠️
                  </div>
                  <div>
                    <h5 className="font-black text-rose-200 text-xs flex items-center gap-1.5">
                      <span>{lang === 'ar' ? 'تنبيه معايير التصميم الهيدروليكي للمصبات' : 'Hydraulic Outfall Distance Alert'}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600 text-white font-mono font-bold">
                        {exceededOutfalls.length} {lang === 'ar' ? 'مصب متأثر' : 'outfalls affected'}
                      </span>
                    </h5>
                    <p className="text-[10px] text-slate-300 leading-tight">
                      {lang === 'ar' 
                        ? 'المسافة بين المصب وأبعد خط موجه إليه تتجاوز المعايير الهيدروليكية المعتمدة (الحد النموذجي 1,500 م).'
                        : 'Distance from outfall to furthest connected pipe exceeds standard gravity threshold (1,500 m).'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedDistanceAlert(true)}
                  className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-all"
                  title={lang === 'ar' ? 'إغلاق التنبيه' : 'Dismiss Alert'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  {exceededOutfalls.map((item, i) => (
                    <button
                      key={item.id || i}
                      type="button"
                      onClick={() => (window as any).__focusFurthestPipe?.(item.furthestPoint.x, item.furthestPoint.y, item.outfallX, item.outfallY)}
                      className="px-2 py-1 rounded-lg bg-red-950/80 hover:bg-red-900/90 border border-red-500/50 text-rose-200 font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                    >
                      <span>🌊 {item.name}:</span>
                      <span className="text-amber-300 font-mono">
                        {item.distanceMeters >= 1000 ? `${(item.distanceMeters / 1000).toFixed(2)} كم` : `${item.distanceMeters.toFixed(0)} م`}
                      </span>
                      <span className="text-cyan-300 text-[9px] underline">({lang === 'ar' ? 'تكبير المسار' : 'Focus'})</span>
                    </button>
                  ))}
                </div>
                <div className="text-[9.5px] text-amber-300 font-medium">
                  💡 {lang === 'ar' ? 'يُوصى بإضافة مصب إضافي لتفادي أعماق حفر كبيرة.' : 'Consider adding an outfall or lift station.'}
                </div>
              </div>
            </div>
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
                    <div className="grid grid-cols-5 gap-1">
                      <button
                        type="button"
                        onClick={() => handleColorModeChange('catchment')}
                        className={cn(
                          "py-1 px-1 rounded-xl text-[8.5px] font-extrabold transition-all border flex items-center justify-center gap-1",
                          activeColorMode === 'catchment'
                            ? "bg-cyan-500 text-white border-cyan-300 shadow-md shadow-cyan-500/20"
                            : "bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800"
                        )}
                        title={lang === 'ar' ? 'تلوين الأنابيب حسب أحواض المصبات' : 'Color by Outfall Catchment'}
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{lang === 'ar' ? 'الأحواض' : 'Catchments'}</span>
                      </button>
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

                  {/* Catchment Legend */}
                  {activeColorMode === 'catchment' && (
                    <div className="space-y-1 pt-1 border-t border-white/10 text-[10px]">
                      <div className="text-[9px] font-bold text-cyan-300 pb-0.5">
                        {lang === 'ar' ? 'أحواض تجميع المصبات (Outfall Basins):' : 'Catchment Basins:'}
                      </div>
                      {((outfallTargets && outfallTargets.length > 0) ? outfallTargets : (flowAnalysis?.outfallNodes || [])).map((ofNode: any, idx: number) => {
                        const cColor = ofNode.color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length];
                        return (
                          <div key={ofNode.id || idx} className="flex items-center justify-between p-1.5 rounded-xl bg-slate-900/90 border border-white/10">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full inline-block shadow-sm" style={{ backgroundColor: cColor }} />
                              <span className="font-bold text-white text-[9.5px]">{ofNode.name || ofNode.id}</span>
                            </div>
                            {ofNode.inflowCount !== undefined && (
                              <span className="font-mono font-bold text-cyan-300 text-[9.5px]">
                                {ofNode.inflowCount} {lang === 'ar' ? 'خط' : 'pipes'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

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

                  {/* Network Outfall Orientation Quick Actions & Multi-Outfall Manager */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                      <span className="flex items-center gap-1">
                        <span>🌊</span>
                        <span>{lang === 'ar' ? 'توزيع المصبات والأحواض' : 'Multi-Outfall Distribution'}</span>
                      </span>
                      {displayOutfalls.length > 0 && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                          {displayOutfalls.length} {lang === 'ar' ? 'مصب' : 'outfalls'}
                        </span>
                      )}
                    </div>

                    {/* Action 1: Distribute / Orient towards multiple outfalls */}
                    {onOrientNetworkTowardsMultiOutfalls ? (
                      <button
                        type="button"
                        onClick={() => onOrientNetworkTowardsMultiOutfalls(outfallTargets)}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-black text-[10.5px] transition-all shadow-md shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <span className="text-xs">🌊</span>
                        <span>
                          {outfallTargets && outfallTargets.length > 1
                            ? (lang === 'ar' ? `توزيع الجريان على (${outfallTargets.length}) مصبات` : `Distribute Flow to (${outfallTargets.length}) Outfalls`)
                            : (lang === 'ar' ? 'توجيه الشبكة نحو المصب تلقائياً' : 'Auto-Orient Flow to Outfall')}
                        </span>
                      </button>
                    ) : (
                      onOrientNetworkTowardsOutfall && (
                        <button
                          type="button"
                          onClick={() => onOrientNetworkTowardsOutfall()}
                          className="w-full py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-[10.5px] transition-all shadow-md shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          <span className="text-xs">🌊</span>
                          <span>{lang === 'ar' ? 'توجيه الشبكة نحو المصب تلقائياً' : 'Auto-Orient Flow to Outfall'}</span>
                        </button>
                      )
                    )}

                    {/* Action 2: Add Outfall by clicking map */}
                    <button
                      type="button"
                      onClick={() => setIsPickingOutfallTarget(!isPickingOutfallTarget)}
                      className={cn(
                        "w-full py-1.5 px-2.5 rounded-xl font-bold text-[10px] transition-all border flex items-center justify-center gap-1.5 active:scale-95",
                        isPickingOutfallTarget
                          ? "bg-red-500 text-white border-red-300 shadow-lg shadow-red-500/30 animate-pulse"
                          : "bg-slate-900/90 text-slate-300 border-white/10 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <span>🎯</span>
                      <span>
                        {isPickingOutfallTarget 
                          ? (lang === 'ar' ? 'انقر على الخريطة لتحديد مكان المصب...' : 'Click map to place outfall...') 
                          : (lang === 'ar' ? '+ تحديد مصب جديد بالنقر على الخريطة' : '+ Pick New Outfall on Map')}
                      </span>
                    </button>

                    {/* Action 3: Delete All Outfalls Button when outfalls exist */}
                    {displayOutfalls.length > 0 && onClearOutfallTargets && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearOutfallTargets();
                        }}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 hover:border-red-500/70 text-rose-200 font-bold text-[10px] transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>{lang === 'ar' ? 'حذف جميع المصبات التلقائية' : 'Clear All Auto Outfalls'}</span>
                      </button>
                    )}

                    {/* Outfall List with Badges, Hydraulic Distance Alerts and Delete Actions */}
                    {displayOutfalls.length > 0 && (
                      <div className="space-y-1.5 pt-1 max-h-44 overflow-y-auto custom-scrollbar">
                        {displayOutfalls.map((of, idx) => {
                          const ofColor = of.color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length];
                          const fur = of.furthestPipe;
                          const isExceeded = !!(of.isDistanceExceeded || fur?.exceedsStandard);
                          const furDistStr = fur ? (fur.distanceMeters >= 1000 ? `${(fur.distanceMeters / 1000).toFixed(2)} كم` : `${fur.distanceMeters.toFixed(0)} م`) : null;

                          return (
                            <div
                              key={of.id}
                              className={cn(
                                "p-1.5 rounded-xl border text-[9.5px] transition-all",
                                isExceeded 
                                  ? "bg-red-950/70 border-red-500/40 shadow-sm shadow-red-900/30" 
                                  : "bg-slate-950/80 border-white/10"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ofColor }} />
                                  <span className="font-bold text-slate-200 truncate">{of.name || `مصب ${idx + 1}`}</span>
                                  <span className="text-[8.5px] font-mono text-cyan-400 dir-ltr opacity-75">
                                    ({of.y.toFixed(3)}, {of.x.toFixed(3)})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {onRemoveOutfallTarget && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveOutfallTarget(of.id);
                                      }}
                                      className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                                      title={lang === 'ar' ? 'حذف هذا المصب' : 'Remove this outfall'}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Distance standard status chip */}
                              {furDistStr && (
                                <div className="mt-1 flex items-center justify-between gap-1 pt-1 border-t border-white/5 text-[8.5px]">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1",
                                    isExceeded 
                                      ? "bg-red-600/30 text-rose-300 border border-red-500/40" 
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  )}>
                                    <span>{isExceeded ? '⚠️' : '✅'}</span>
                                    <span>{lang === 'ar' ? 'أبعد خط:' : 'Furthest:'} {furDistStr}</span>
                                    {isExceeded && <span className="text-[7.5px] bg-red-600 text-white px-1 rounded">{lang === 'ar' ? 'تجاوز' : '>1.5km'}</span>}
                                  </span>

                                  {fur.furthestPoint && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        (window as any).__focusFurthestPipe?.(fur.furthestPoint.x, fur.furthestPoint.y, of.x, of.y);
                                      }}
                                      className="text-cyan-300 hover:text-cyan-100 underline text-[8.5px] cursor-pointer"
                                    >
                                      {lang === 'ar' ? 'عرض المسار' : 'View Ray'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                ref={layerToggleBtnRef}
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
                  ref={flowInfoBtnRef}
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
              <div 
                ref={flowInfoOverlayRef}
                className={cn(
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

            {/* Asphalt Polygon BOQ Button */}
            <button 
                type="button"
                onClick={() => setShowAsphaltModal(true)}
                className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl shadow-xl flex items-center justify-center transition-all border active:scale-95 relative",
                    asphaltCalc
                      ? "bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 shadow-amber-500/30 font-black" 
                      : "bg-white/95 backdrop-blur-md text-amber-700 hover:bg-white border-white/20 hover:text-amber-600"
                )}
                title={lang === 'ar' ? 'حاسبة كميات الأسفلت بالمضلع (رسم / إرفاق مضلع)' : 'Asphalt Polygon BOQ Calculator (Draw / Upload)'}
            >
                <span className="text-lg">🏗️</span>
                {asphaltCalc && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow">
                    ✓
                  </span>
                )}
            </button>

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
                <div 
                    ref={layerMenuRef}
                    className={cn(
                    "absolute top-0 bg-white/98 backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl p-4 sm:p-7 w-64 sm:w-72 border border-white/40 animate-in fade-in zoom-in duration-200 origin-top max-h-[75vh] overflow-y-auto custom-scrollbar",
                    lang === 'ar' ? 'right-12 sm:right-16' : 'left-12 sm:left-16'
                )}>
                    <div className="flex items-center justify-between mb-4 sm:mb-5 pb-2 border-b border-slate-100 dark:border-white/10">
                        <div className="flex items-center gap-2">
                            <MapIcon className="w-4 h-4 text-accent" />
                            <h4 className="text-[10px] sm:text-[11px] font-black uppercase text-primary tracking-[0.2em]">{t.baseMaps}</h4>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowLayerMenu(false)}
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-all active:scale-90"
                            title={lang === 'ar' ? 'إغلاق الإطار' : 'Close Panel'}
                        >
                            <X className="w-4 h-4" />
                        </button>
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
             
              {/* Interactive Street & Multi-Map Search Bar with Classification & Filters */}
              <div ref={searchContainerRef} className="relative w-full pointer-events-auto">
                
                {/* Active Classification Filter Badges (Country / City / District) */}
                {(searchFilters.countryCode || searchFilters.city || searchFilters.district) && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1 text-[10px] font-bold" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                    <span className="text-white/70 text-[9px] select-none flex items-center gap-1">
                      <span>🎯</span>
                      <span>{lang === 'ar' ? 'نطاق البحث:' : 'Scope:'}</span>
                    </span>

                    {/* Country Badge */}
                    {searchFilters.countryCode && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-md">
                        <span>{COUNTRY_PRESETS.find(c => c.code === searchFilters.countryCode)?.flag || '🌐'}</span>
                        <span>{lang === 'ar' ? (COUNTRY_PRESETS.find(c => c.code === searchFilters.countryCode)?.nameAr || searchFilters.countryName) : (COUNTRY_PRESETS.find(c => c.code === searchFilters.countryCode)?.nameEn || searchFilters.countryName)}</span>
                        <button 
                          type="button" 
                          onClick={() => handleClearSingleFilter('countryCode')}
                          className="hover:text-white ml-1 text-[11px]"
                          title={lang === 'ar' ? 'إزالة تصنيف الدولة' : 'Remove country'}
                        >✕</button>
                      </span>
                    )}

                    {/* City Badge */}
                    {searchFilters.city && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 backdrop-blur-md">
                        <Building2 className="w-3 h-3 text-blue-300" />
                        <span>{searchFilters.city}</span>
                        <button 
                          type="button" 
                          onClick={() => handleClearSingleFilter('city')}
                          className="hover:text-white ml-1 text-[11px]"
                          title={lang === 'ar' ? 'إزالة تصنيف المدينة' : 'Remove city'}
                        >✕</button>
                      </span>
                    )}

                    {/* District Badge */}
                    {searchFilters.district && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 backdrop-blur-md">
                        <Home className="w-3 h-3 text-amber-300" />
                        <span>{searchFilters.district}</span>
                        <button 
                          type="button" 
                          onClick={() => handleClearSingleFilter('district')}
                          className="hover:text-white ml-1 text-[11px]"
                          title={lang === 'ar' ? 'إزالة تصنيف الحي' : 'Remove district'}
                        >✕</button>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="px-2 py-0.5 rounded-full bg-red-500/20 text-rose-300 hover:bg-red-500/30 border border-red-500/30 transition-all text-[9px]"
                      title={lang === 'ar' ? 'إعادة ضبط كل التصنيفات' : 'Reset all filters'}
                    >
                      {lang === 'ar' ? 'مسح الفلاتر ✕' : 'Clear All ✕'}
                    </button>
                  </div>
                )}

                <form 
                  onSubmit={handleSearchSubmit} 
                  className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center p-1.5 sm:p-2 border border-slate-200/80 dark:border-white/10 w-full ring-1 ring-black/5"
                >
                  <button 
                    type="submit" 
                    className="p-3 sm:p-3.5 bg-gradient-to-tr from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl shadow-lg transition-all shrink-0 active:scale-90 flex items-center justify-center"
                    title={lang === 'ar' ? 'بحث في جميع أنواع الخرائط والشوارع' : 'Search Streets Across All Map Types'}
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 flex items-center min-w-0 px-2 sm:px-3">
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => handleSearchInputChange(e.target.value)}
                      onFocus={() => {
                        if (searchResults.length > 0) setShowSearchResultsDropdown(true);
                      }}
                      placeholder={(t as any).searchPlaceholder || 'بحث باسم الشارع، الموقع، المعرف، أو الإحداثيات...'} 
                      className="outline-none text-[12px] sm:text-[13px] w-full bg-transparent text-slate-900 dark:text-white font-bold placeholder:text-slate-400 placeholder:font-medium" 
                      dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    />
                  </div>

                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl transition-all mr-1"
                      title={lang === 'ar' ? 'مسح نص البحث' : 'Clear search text'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {/* Filter & Classification Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setShowSearchFiltersModal(prev => !prev)}
                    className={cn(
                      "filter-toggle-btn flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[11px] font-black transition-all shadow-sm select-none shrink-0",
                      showSearchFiltersModal || (searchFilters.city || searchFilters.district || (searchFilters.countryCode && searchFilters.countryCode !== 'sa'))
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-white/10"
                    )}
                    title={lang === 'ar' ? 'تصنيف الدولة والمدينة والأحياء' : 'Country, City & District Filters'}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {searchFilters.city 
                        ? `${searchFilters.city}` 
                        : (searchFilters.countryCode ? (COUNTRY_PRESETS.find(c => c.code === searchFilters.countryCode)?.flag || '🌍') : (lang === 'ar' ? 'تصنيف' : 'Filter'))}
                    </span>
                    {(searchFilters.city || searchFilters.district) && (
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    )}
                  </button>
                </form>

                {/* ======================================================== */}
                {/* ADVANCED CLASSIFICATION & FILTERS POPOVER MODAL */}
                {/* ======================================================== */}
                {showSearchFiltersModal && (
                  <div 
                    ref={filterModalRef}
                    className="absolute bottom-full mb-3 left-0 right-0 max-h-[30rem] overflow-y-auto bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 rounded-3xl shadow-2xl p-4 sm:p-5 space-y-4 z-[950] animate-in fade-in slide-in-from-bottom-3 custom-scrollbar text-white"
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md">
                          <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-black text-white">
                            {(t as any).searchFilterTitle || 'تصنيف وفلترة بحث الشوارع'}
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            {lang === 'ar' ? 'حدد الدولة والمدينة والحي لتوسيع ودقة البحث' : 'Select country, city & district for precise search'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowSearchFiltersModal(false)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Section 1: Country Classification (الدولة) */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-300">
                        <Flag className="w-3.5 h-3.5" />
                        <span>{(t as any).filterCountry || 'الدولة'}</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyFilterUpdate({ countryCode: '', countryName: '', city: '', district: '' })}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[10.5px] font-bold transition-all flex items-center gap-1.5 border",
                            !searchFilters.countryCode 
                              ? "bg-cyan-500 text-white border-cyan-400 shadow-md font-black" 
                              : "bg-slate-900/80 text-slate-300 border-white/10 hover:border-cyan-500/40 hover:bg-slate-800"
                          )}
                        >
                          <span>🌐</span>
                          <span>{(t as any).allCountries || 'جميع الدول (بحث عالمي)'}</span>
                        </button>

                        {COUNTRY_PRESETS.map((country) => (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => handleApplyFilterUpdate({ 
                              countryCode: country.code, 
                              countryName: lang === 'ar' ? country.nameAr : country.nameEn,
                              city: '',
                              district: ''
                            })}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-[10.5px] font-bold transition-all flex items-center gap-1.5 border",
                              searchFilters.countryCode === country.code 
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-md font-black" 
                                : "bg-slate-900/80 text-slate-300 border-white/10 hover:border-emerald-500/40 hover:bg-slate-800"
                            )}
                          >
                            <span>{country.flag}</span>
                            <span>{lang === 'ar' ? country.nameAr.replace('المملكة العربية ', '').replace('جمهورية ', '').replace('دولة ', '') : country.nameEn}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Section 2: City Classification (المدينة) */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-blue-300">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{(t as any).filterCity || 'المدينة'}</span>
                      </label>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={searchFilters.city || ''}
                          onChange={(e) => handleApplyFilterUpdate({ city: e.target.value, district: '' })}
                          placeholder={(t as any).selectCity || 'اختر أو اكتب المدينة...'}
                          className="w-full bg-slate-900 border border-white/10 rounded-2xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 font-bold outline-none focus:border-blue-500 transition-all"
                        />
                        {searchFilters.city && (
                          <button
                            type="button"
                            onClick={() => handleClearSingleFilter('city')}
                            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* City Quick Select Chips */}
                      {(() => {
                        const selectedCountryPreset = COUNTRY_PRESETS.find(c => c.code === (searchFilters.countryCode || 'sa'));
                        const cityList = selectedCountryPreset ? selectedCountryPreset.cities : COUNTRY_PRESETS[0].cities;
                        return (
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-1">
                            {cityList.map((city) => (
                              <button
                                key={city.nameAr}
                                type="button"
                                onClick={() => handleApplyFilterUpdate({ 
                                  city: lang === 'ar' ? city.nameAr : city.nameEn,
                                  district: ''
                                })}
                                className={cn(
                                  "px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all border",
                                  searchFilters.city === city.nameAr || searchFilters.city === city.nameEn
                                    ? "bg-blue-600 text-white border-blue-400 shadow-sm font-black"
                                    : "bg-slate-900/60 text-slate-300 border-white/10 hover:border-blue-400/40 hover:bg-slate-800"
                                )}
                              >
                                {lang === 'ar' ? city.nameAr : city.nameEn}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Section 3: District / Neighborhood Classification (الحي / المنطقة) */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                        <Home className="w-3.5 h-3.5" />
                        <span>{(t as any).filterDistrict || 'الحي / المنطقة'}</span>
                      </label>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={searchFilters.district || ''}
                          onChange={(e) => handleApplyFilterUpdate({ district: e.target.value })}
                          placeholder={(t as any).typeDistrict || 'اكتب اسم الحي (مثال: حي النرجس، حي الروضة)...'}
                          className="w-full bg-slate-900 border border-white/10 rounded-2xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 font-bold outline-none focus:border-amber-500 transition-all"
                        />
                        {searchFilters.district && (
                          <button
                            type="button"
                            onClick={() => handleClearSingleFilter('district')}
                            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* District Quick Select Chips for selected city */}
                      {(() => {
                        const selectedCountryPreset = COUNTRY_PRESETS.find(c => c.code === (searchFilters.countryCode || 'sa')) || COUNTRY_PRESETS[0];
                        const matchedCity = selectedCountryPreset.cities.find(
                          c => c.nameAr === searchFilters.city || c.nameEn === searchFilters.city || searchFilters.city?.includes(c.nameAr)
                        ) || selectedCountryPreset.cities[0];

                        const districtList = matchedCity?.popularDistricts || [];
                        if (districtList.length === 0) return null;

                        return (
                          <div className="space-y-1">
                            <span className="text-[9.5px] text-slate-400 font-medium">
                              {lang === 'ar' ? `أحياء شهيرة في ${matchedCity.nameAr}:` : `Popular districts in ${matchedCity.nameEn}:`}
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-1">
                              {districtList.map((district) => (
                                <button
                                  key={district}
                                  type="button"
                                  onClick={() => handleApplyFilterUpdate({ district })}
                                  className={cn(
                                    "px-2.5 py-1 rounded-xl text-[9.5px] font-bold transition-all border",
                                    searchFilters.district === district
                                      ? "bg-amber-600 text-white border-amber-400 shadow-sm font-black"
                                      : "bg-slate-900/60 text-slate-300 border-white/10 hover:border-amber-400/40 hover:bg-slate-800"
                                  )}
                                >
                                  {district}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Modal Footer Controls */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{(t as any).clearFilters || 'إعادة ضبط'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSearchFiltersModal(false);
                          performStreetSearch(searchQuery, searchActiveTab);
                        }}
                        className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-black shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>{(t as any).applyFilters || 'تطبيق وتوسيع البحث'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Autocomplete / Search Results Popover Dropdown */}
                {showSearchResultsDropdown && searchResults.length > 0 && (
                  <div 
                    className="absolute bottom-full mb-2 sm:mb-3 left-0 right-0 max-h-80 sm:max-h-96 overflow-y-auto bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 rounded-3xl shadow-2xl p-2.5 space-y-2 z-[900] animate-in fade-in slide-in-from-bottom-2 custom-scrollbar text-white"
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  >
                    {/* Header Tabs: [ All | Project Streets | Global Maps ] */}
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div className="flex items-center gap-1 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => handleSearchTabChange('all')}
                          className={cn(
                            "px-2.5 py-1 rounded-xl transition-all",
                            searchActiveTab === 'all' 
                              ? "bg-cyan-500 text-white font-black shadow-sm" 
                              : "text-slate-400 hover:text-white hover:bg-white/10"
                          )}
                        >
                          {(t as any).searchStreetsTabAll || 'الكل'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSearchTabChange('project')}
                          className={cn(
                            "px-2.5 py-1 rounded-xl transition-all flex items-center gap-1",
                            searchActiveTab === 'project' 
                              ? "bg-cyan-500 text-white font-black shadow-sm" 
                              : "text-slate-400 hover:text-white hover:bg-white/10"
                          )}
                        >
                          <span>📁</span>
                          <span>{(t as any).searchStreetsTabProject || 'شوارع المخطط'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSearchTabChange('global')}
                          className={cn(
                            "px-2.5 py-1 rounded-xl transition-all flex items-center gap-1",
                            searchActiveTab === 'global' 
                              ? "bg-cyan-500 text-white font-black shadow-sm" 
                              : "text-slate-400 hover:text-white hover:bg-white/10"
                          )}
                        >
                          <span>🌍</span>
                          <span>{(t as any).searchStreetsTabGlobal || 'خرائط العالم'}</span>
                        </button>
                      </div>

                      <span className="text-[9.5px] font-mono text-cyan-300 font-bold px-2 py-0.5 rounded-full bg-cyan-500/20">
                        {searchResults.length} {lang === 'ar' ? 'نتيجة' : 'results'}
                      </span>
                    </div>

                    {/* Results Items List */}
                    <div className="space-y-1.5">
                      {searchResults.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleSelectSearchResult(item)}
                          className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-cyan-950/80 border border-white/10 hover:border-cyan-500/50 cursor-pointer transition-all flex items-center justify-between gap-3 group active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div 
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 transition-all group-hover:scale-110 shadow-sm"
                              style={{ backgroundColor: `${item.badgeColor || '#06b6d4'}22`, border: `1px solid ${item.badgeColor || '#06b6d4'}55` }}
                            >
                              {item.type === 'project_street' ? '📐' : item.type === 'coordinate' ? '🎯' : '🛣️'}
                            </div>

                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-xs truncate group-hover:text-cyan-300 transition-colors">
                                  {item.name}
                                </span>
                                <span 
                                  className="text-[8.5px] px-1.5 py-0.5 rounded-md font-bold truncate flex-shrink-0"
                                  style={{ backgroundColor: `${item.badgeColor || '#06b6d4'}26`, color: item.badgeColor || '#06b6d4' }}
                                >
                                  {item.badge}
                                </span>
                              </div>

                              <span className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                                {item.secondaryText}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[9px] font-mono font-bold text-slate-500 group-hover:text-cyan-400 transition-colors">
                              {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                            </span>
                            <div className="w-6 h-6 rounded-lg bg-white/5 group-hover:bg-cyan-500 group-hover:text-white flex items-center justify-center text-slate-400 transition-all text-xs">
                              ↗
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
        </div>

        {isDrawing && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-[500] bg-primary/95 text-white px-8 py-5 rounded-[2rem] text-xs font-black shadow-2xl flex items-center border border-white/20 animate-bounce backdrop-blur-md">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center me-3">
                    <MousePointerClick className="w-4 h-4 text-accent" />
                </div>
                {t.drawInstruction}
            </div>
        )}

        {/* ======================================================== */}
        {/* INTERACTIVE DIRECT LINE DRAWING FLOATING ON-MAP HUD */}
        {/* ======================================================== */}
        {isLineDrawingMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[800] bg-[#071c27]/95 backdrop-blur-md border-2 border-accent/60 text-white px-4 sm:px-6 py-3 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-wrap items-center justify-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-3 max-w-[95%]">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
              <div className="flex flex-col">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-accent" />
                  <span>{lang === 'ar' ? `رسم مباشر: ${activeLineName || 'خط جديد'}` : `Drawing: ${activeLineName || 'New Line'}`}</span>
                </span>
                {activeLineLayer && (
                  <span className="text-[10px] text-white/60 font-medium">
                    {lang === 'ar' ? `الطبقة: ${activeLineLayer}` : `Layer: ${activeLineLayer}`}
                  </span>
                )}
              </div>
            </div>

            <div className="h-6 w-px bg-white/20 hidden sm:block" />

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="bg-accent/20 text-accent font-black px-2.5 py-1 rounded-xl border border-accent/30 text-[11px]">
                {activeLineVertices?.length || 0} {lang === 'ar' ? 'نقاط' : 'pts'}
              </span>
              {activeLineLengthMeters > 0 && (
                <span className="bg-emerald-500/20 text-emerald-300 font-black px-2.5 py-1 rounded-xl border border-emerald-500/30 text-[11px]">
                  {activeLineLengthMeters >= 1000 
                    ? `${(activeLineLengthMeters / 1000).toFixed(2)} ${lang === 'ar' ? 'كم' : 'km'}` 
                    : `${activeLineLengthMeters.toFixed(1)} ${lang === 'ar' ? 'م' : 'm'}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onUndoLineVertex}
                disabled={!activeLineVertices || activeLineVertices.length === 0}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1 disabled:opacity-40 transition-all active:scale-95"
                title={lang === 'ar' ? 'تراجع عن آخر نقطة' : 'Undo Last Point'}
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{lang === 'ar' ? 'تراجع' : 'Undo'}</span>
              </button>

              <button
                type="button"
                onClick={onCancelLineDraw}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs rounded-xl flex items-center gap-1 transition-all active:scale-95"
                title={lang === 'ar' ? 'إلغاء الرسم' : 'Cancel Draw'}
              >
                <X className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</span>
              </button>

              <button
                type="button"
                onClick={onFinishLine}
                disabled={!activeLineVertices || activeLineVertices.length < 2}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-lg flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                <Check className="w-4 h-4" />
                <span>{lang === 'ar' ? 'إنهاء وحفظ' : 'Finish & Save'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MANUAL COORDINATE PICKING BANNER */}
        {/* ======================================================== */}
        {isPickingCoordinate && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[800] bg-accent text-primary px-6 py-3 rounded-2xl shadow-2xl font-black text-xs sm:text-sm flex items-center gap-2.5 border-2 border-primary animate-pulse">
            <Target className="w-5 h-5 animate-spin" />
            <span>
              {isPickingCoordinate === 'start' 
                ? (lang === 'ar' ? '🎯 انقر على الخريطة لتحديد نقطة البداية (Start Point)' : '🎯 Click on map to pick START point')
                : (lang === 'ar' ? '🎯 انقر على الخريطة لتحديد نقطة النهاية (End Point)' : '🎯 Click on map to pick END point')}
            </span>
          </div>
        )}

        {/* ======================================================== */}
        {/* INTERACTIVE ASPHALT POLYGON DRAWING ON-MAP FLOATING HUD */}
        {/* ======================================================== */}
        {isAsphaltDrawing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[800] bg-slate-950/95 backdrop-blur-md border-2 border-amber-500/70 text-white px-4 sm:px-6 py-3 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-wrap items-center justify-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-3 max-w-[95%]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              <div className="flex flex-col">
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <span className="text-sm">🏗️</span>
                  <span>{lang === 'ar' ? 'رسم مضلع الأسفلت المباشر' : 'Drawing Asphalt Polygon'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {lang === 'ar' ? 'انقر على الخريطة لإضافة رؤوس المضلع' : 'Click on map to place polygon vertices'}
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-white/20 hidden sm:block" />

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="bg-amber-500/20 text-amber-300 font-black px-2.5 py-1 rounded-xl border border-amber-500/30 text-[11px]">
                {asphaltDrawingCoords.length} {lang === 'ar' ? 'رؤوس' : 'vertices'}
              </span>
              {liveAsphaltAreaM2 > 0 && (
                <span className="bg-emerald-500/20 text-emerald-300 font-black px-2.5 py-1 rounded-xl border border-emerald-500/30 text-[11px]">
                  {liveAsphaltAreaM2.toLocaleString('en-US', { maximumFractionDigits: 1 })} {lang === 'ar' ? 'م² مساحة' : 'm² Area'}
                </span>
              )}
              {liveAsphaltPerimeterM > 0 && (
                <span className="bg-cyan-500/20 text-cyan-300 font-black px-2.5 py-1 rounded-xl border border-cyan-500/30 text-[11px] hidden md:inline">
                  {liveAsphaltPerimeterM.toFixed(1)} {lang === 'ar' ? 'م محيط' : 'm Perimeter'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={handleUndoAsphaltVertex}
                disabled={asphaltDrawingCoords.length === 0}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1 disabled:opacity-40 transition-all active:scale-95 cursor-pointer"
                title={lang === 'ar' ? 'تراجع عن آخر نقطة' : 'Undo Last Vertex'}
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{lang === 'ar' ? 'تراجع' : 'Undo'}</span>
              </button>

              <button
                type="button"
                onClick={handleCancelAsphaltDrawing}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs rounded-xl flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                title={lang === 'ar' ? 'إلغاء الرسم' : 'Cancel Draw'}
              >
                <X className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</span>
              </button>

              <button
                type="button"
                onClick={handleFinishAsphaltDrawing}
                disabled={asphaltDrawingCoords.length < 3}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <Check className="w-4 h-4 font-black" />
                <span>{lang === 'ar' ? 'إنهاء واحتساب الكميات' : 'Finish & Calculate'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ASPHALT POLYGON CALCULATOR MODAL */}
        {/* ======================================================== */}
        <AsphaltPolygonCalculatorModal
          isOpen={showAsphaltModal}
          onClose={() => setShowAsphaltModal(false)}
          lang={lang}
          networkPoints={points}
          currentCalculation={asphaltCalc}
          onUpdateCalculation={(calc) => {
            setAsphaltCalc(calc);
          }}
          onApplyCalculation={(calc) => {
            setAsphaltCalc(calc);
          }}
          isDrawingMode={isAsphaltDrawing}
          onStartDrawing={() => {
            setShowAsphaltModal(false);
            handleStartAsphaltDrawing();
          }}
          onStartDrawMode={() => {
            setShowAsphaltModal(false);
            handleStartAsphaltDrawing();
          }}
          onCancelDrawing={handleCancelAsphaltDrawing}
          onFinishDrawing={handleFinishAsphaltDrawing}
          drawingVerticesCount={asphaltDrawingCoords.length}
          isPolygonVisible={isAsphaltPolygonVisible}
          onTogglePolygonVisibility={() => setIsAsphaltPolygonVisible(prev => !prev)}
          onZoomToPolygon={handleZoomToAsphaltPolygon}
        />
    </div>
  );
};

export default MapPreview;
