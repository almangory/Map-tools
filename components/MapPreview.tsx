
import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { Search as SearchIcon, Loader2, MousePointerClick, Square, Trash2, CheckCircle2, Layers as LayersIcon, Map as MapIcon, Eye, EyeOff, Globe, Maximize, Navigation2 } from 'lucide-react';
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

const MapPreview: React.FC<MapPreviewProps> = ({ points, lang, dataId, isSelectionMode, onPolygonComplete, focusedColor, overlapResults, globalBaseMap }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.LayerGroup | null>(null);
  const drawLayerGroup = useRef<L.LayerGroup | null>(null);
  const currentDrawGroup = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
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
  const [showDataOverlay, setShowDataOverlay] = useState(true);

  const t = translations[lang];

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
    if (points.length === 0) {
      lastDataIdRef.current = null;
      return;
    }

    points.forEach(pt => {
      if (isValidLatLng(pt.y, pt.x)) {
        const isOverlap = overlapResults?.some(o => !o.isIntersection && (String(o.id1) === String(pt.id) || String(o.id2) === String(pt.id)));
        const isIntersectionLine = overlapResults?.some(o => o.isIntersection && (String(o.id1) === String(pt.id) || String(o.id2) === String(pt.id)));
        
        const featColor = isOverlap ? '#000000' : (pt.color || '#dcb13c').toLowerCase();
        
        if (focusedColor && featColor !== focusedColor.toLowerCase() && !isOverlap && !isIntersectionLine) return;

        let marker;
        if (pt.type === 'Polygon' && pt.path && Array.isArray(pt.path)) {
          const latLngs = pt.path
            .filter(p => isValidLatLng(p.y, p.x))
            .map(p => [p.y, p.x] as [number, number]);
          
          if (latLngs.length >= 3) {
            marker = L.polygon(latLngs, { 
              color: isOverlap ? '#000000' : '#ffffff', weight: isOverlap ? 4 : 2, fillColor: isOverlap ? '#9c27b0' : featColor, fillOpacity: isOverlap ? 0.7 : 0.5
            });
            
            // Add label for polygons (important for Splitter mode)
            if (pt.layer === 'Split Polygons' || pt.layer === 'Split Boundaries') {
              const center = marker.getBounds().getCenter();
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
          const latLngs = pt.path
            .filter(p => isValidLatLng(p.y, p.x))
            .map(p => [p.y, p.x] as [number, number]);
          
          if (latLngs.length >= 2) {
            marker = L.polyline(latLngs, { 
                color: isOverlap ? '#000000' : featColor, weight: (isOverlap || isIntersectionLine) ? 8 : 4, opacity: (isOverlap || isIntersectionLine) ? 1 : 0.8
            });
          }
        } else {
          if (pt.iconUrl) {
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
          let popupContent = `<div class="p-3 min-w-[220px] font-sans" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
            <div class="font-black text-primary border-b border-slate-100 pb-2 mb-2 text-[13px]">${pt.id}</div>`;
          
          if (pt.street || pt.district) {
            popupContent += `<div class="space-y-1.5 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
              ${pt.street ? `<div class="text-[10px] leading-tight"><span class="text-slate-400 block font-bold uppercase mb-0.5">${lang === 'ar' ? 'الشارع' : 'Street'}</span> <span class="font-black text-slate-800">${pt.street}</span></div>` : ''}
              ${pt.district ? `<div class="text-[10px] leading-tight"><span class="text-slate-400 block font-bold uppercase mb-0.5">${lang === 'ar' ? 'الحي' : 'District'}</span> <span class="font-black text-slate-800">${pt.district}</span></div>` : ''}
            </div>`;
          }
          
          popupContent += `<div class="flex items-center justify-between text-[9px] text-slate-400 font-bold border-t border-slate-50 pt-2 mt-1">
            <span>LAT: ${pt.y.toFixed(6)}</span>
            <span>LON: ${pt.x.toFixed(6)}</span>
          </div></div>`;

          marker.bindPopup(popupContent);
          layerGroup.current?.addLayer(marker);
        }
      }
    });

    // Add intersection points explicitly
    if (overlapResults) {
      overlapResults.forEach(o => {
        if (o.isIntersection && o.intersectionPoint && isValidLatLng(o.intersectionPoint.y, o.intersectionPoint.x)) {
           L.circleMarker([o.intersectionPoint.y, o.intersectionPoint.x], { radius: 8, fillColor: '#9c27b0', color: '#ffffff', weight: 3, fillOpacity: 1 }).addTo(layerGroup.current!).bindPopup(`
             <div class="p-2 font-sans" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
               <div class="font-black text-purple-700 mb-1 text-[12px]">${lang === 'ar' ? 'نقطة تداخل' : 'Intersection Point'}</div>
               <div class="text-[10px] text-slate-500">${o.id1} × ${o.id2}</div>
             </div>
           `);
        }
      });
    }

    // Auto-zoom logic: Triggered when dataId changes or when new points arrive for the first time
    if (dataId && dataId !== lastDataIdRef.current) {
        zoomToDataExtent();
        lastDataIdRef.current = dataId;
    }
  }, [points, lang, focusedColor, isDrawing, dataId, zoomToDataExtent, overlapResults]);

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
        <div ref={mapContainer} className="w-full h-full z-0" />
        
        {/* Layer & Control Menu */}
        <div className={cn(
            "absolute top-6 z-[600] flex flex-col gap-3 transition-all",
            lang === 'ar' ? 'right-6' : 'left-6'
        )}>
            <button 
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                className={cn(
                    "w-12 h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95",
                    showLayerMenu && "ring-2 ring-accent border-accent/50"
                )}
            >
                <LayersIcon className="w-6 h-6" />
            </button>

            <button 
                onClick={zoomToDataExtent}
                disabled={points.length === 0}
                className="w-12 h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t.zoomToData}
            >
                <Maximize className="w-6 h-6" />
            </button>
            
            {showLayerMenu && (
                <div className={cn(
                    "absolute top-0 bg-white/98 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-7 w-72 border border-white/40 animate-in fade-in zoom-in duration-200 origin-top",
                    lang === 'ar' ? 'right-16' : 'left-16'
                )}>
                    <div className="flex items-center gap-2 mb-5">
                        <MapIcon className="w-4 h-4 text-accent" />
                        <h4 className="text-[11px] font-black uppercase text-primary tracking-[0.2em]">{t.baseMaps}</h4>
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
                </div>
            )}
        </div>

        {/* Cursor Coordinates Tracker */}
        {cursorCoords && (
            <div className={cn(
                "absolute bottom-6 z-[600] px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-slate-200 text-[10px] font-black text-slate-600 flex gap-4 animate-in fade-in duration-300",
                lang === 'ar' ? 'left-6' : 'right-6'
            )}>
                <div className="flex items-center gap-1.5"><Navigation2 className="w-3 h-3 text-accent" /><span>LAT: {cursorCoords.lat.toFixed(6)}</span></div>
                <div className="w-px h-3 bg-slate-300" />
                <div className="flex items-center gap-1.5"><span>LON: {cursorCoords.lng.toFixed(6)}</span></div>
            </div>
        )}

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-4 w-[90%] max-w-md pointer-events-none">
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
