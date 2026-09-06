import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Building2, 
  Download, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  Table, 
  Eye, 
  Check, 
  RefreshCw, 
  X, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  FileSpreadsheet,
  Compass,
  ArrowDown,
  Navigation,
  Landmark,
  Layers
} from 'lucide-react';
import { GeoPoint, ParsedFile } from '../types';
import { getReverseGeocode } from '../services/geometryService';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { 
  return twMerge(clsx(inputs)); 
}

export interface ExcelStreetDistrictEnricherProps {
  activeFile: ParsedFile | null;
  setActiveFile: React.Dispatch<React.SetStateAction<ParsedFile | null>>;
  globalPoints: GeoPoint[];
  setGlobalPoints: React.Dispatch<React.SetStateAction<GeoPoint[]>>;
  selectedHeaders: string[];
  setSelectedHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  lang: 'ar' | 'en';
  geocodingMode: 'accurate' | 'fast';
  setGeocodingMode?: (mode: 'accurate' | 'fast') => void;
  governorateMappingCol?: string;
  setGovernorateMappingCol?: (col: string) => void;
  cityMappingCol?: string;
  setCityMappingCol?: (col: string) => void;
  streetMappingCol: string;
  setStreetMappingCol: (col: string) => void;
  districtMappingCol: string;
  setDistrictMappingCol: (col: string) => void;
  onSuccessNotification?: (msg: string) => void;
}

export const ExcelStreetDistrictEnricher: React.FC<ExcelStreetDistrictEnricherProps> = ({
  activeFile,
  setActiveFile,
  globalPoints,
  setGlobalPoints,
  selectedHeaders,
  setSelectedHeaders,
  lang,
  geocodingMode,
  setGeocodingMode,
  governorateMappingCol = '',
  setGovernorateMappingCol,
  cityMappingCol = '',
  setCityMappingCol,
  streetMappingCol,
  setStreetMappingCol,
  districtMappingCol,
  setDistrictMappingCol,
  onSuccessNotification
}) => {
  // Column names defaults
  const defaultGovCol = lang === 'ar' ? 'المحافظة' : 'Governorate';
  const defaultCityCol = lang === 'ar' ? 'المدينة' : 'City';
  const defaultDistrictCol = lang === 'ar' ? 'الحي' : 'District';
  const defaultStreetCol = lang === 'ar' ? 'الشارع' : 'Street';

  // Toggle inclusion of columns (Order: Governorate -> City -> District -> Street)
  const [includeGovernorate, setIncludeGovernorate] = useState<boolean>(true);
  const [includeCity, setIncludeCity] = useState<boolean>(true);
  const [includeDistrict, setIncludeDistrict] = useState<boolean>(true);
  const [includeStreet, setIncludeStreet] = useState<boolean>(true);

  // Column names configuration
  const [govColName, setGovColName] = useState<string>(defaultGovCol);
  const [cityColName, setCityColName] = useState<string>(defaultCityCol);
  const [districtColName, setDistrictColName] = useState<string>(defaultDistrictCol);
  const [streetColName, setStreetColName] = useState<string>(defaultStreetCol);

  // Internal mapping fallback if parent doesn't provide setters
  const [internalGovMap, setInternalGovMap] = useState<string>(governorateMappingCol);
  const [internalCityMap, setInternalCityMap] = useState<string>(cityMappingCol);

  const activeGovMap = governorateMappingCol || internalGovMap;
  const activeCityMap = cityMappingCol || internalCityMap;

  const handleSetGovMap = (val: string) => {
    setInternalGovMap(val);
    if (setGovernorateMappingCol) setGovernorateMappingCol(val);
  };

  const handleSetCityMap = (val: string) => {
    setInternalCityMap(val);
    if (setCityMappingCol) setCityMappingCol(val);
  };

  const [addCoordinates, setAddCoordinates] = useState<boolean>(true);
  const [addMapLink, setAddMapLink] = useState<boolean>(true);

  // Execution state
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [lastResolvedMsg, setLastResolvedMsg] = useState<string>('');
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // Auto-fetch on upload preference
  const [autoFetchPreference, setAutoFetchPreference] = useState<boolean>(() => {
    return localStorage.getItem('geogis_auto_fetch_excel_streets') === 'true';
  });

  const abortControllerRef = useRef<boolean>(false);

  // Check if current points already have address information resolved
  const resolvedPointsCount = globalPoints.filter(p => 
    (p.street && p.street !== 'غير متوفر' && p.street !== 'Unknown') ||
    (p.city && p.city !== 'غير متوفر' && p.city !== 'Unknown')
  ).length;

  useEffect(() => {
    if (resolvedPointsCount > 0 && resolvedPointsCount >= Math.floor(globalPoints.length * 0.7)) {
      setIsCompleted(true);
    }
  }, [resolvedPointsCount, globalPoints.length]);

  const handleToggleAutoFetch = (val: boolean) => {
    setAutoFetchPreference(val);
    localStorage.setItem('geogis_auto_fetch_excel_streets', val ? 'true' : 'false');
  };

  const handleCancel = () => {
    abortControllerRef.current = true;
    setIsFetching(false);
  };

  // Quick Preset Handlers
  const applyPreset = (mode: 'all' | 'city-district-street' | 'gov-district-street' | 'district-street') => {
    if (mode === 'all') {
      setIncludeGovernorate(true);
      setIncludeCity(true);
      setIncludeDistrict(true);
      setIncludeStreet(true);
    } else if (mode === 'city-district-street') {
      setIncludeGovernorate(false);
      setIncludeCity(true);
      setIncludeDistrict(true);
      setIncludeStreet(true);
    } else if (mode === 'gov-district-street') {
      setIncludeGovernorate(true);
      setIncludeCity(false);
      setIncludeDistrict(true);
      setIncludeStreet(true);
    } else if (mode === 'district-street') {
      setIncludeGovernorate(false);
      setIncludeCity(false);
      setIncludeDistrict(true);
      setIncludeStreet(true);
    }
  };

  // Main Fetch and Enrich Process
  const handleFetchAddressHierarchy = async () => {
    if (!activeFile || globalPoints.length === 0) return;

    setIsFetching(true);
    abortControllerRef.current = false;
    setProgressPct(5);
    setLastResolvedMsg('');
    const total = globalPoints.length;
    setTotalCount(total);
    setProcessedCount(0);

    const finalGovCol = govColName.trim() || defaultGovCol;
    const finalCityCol = cityColName.trim() || defaultCityCol;
    const finalDistrictCol = districtColName.trim() || defaultDistrictCol;
    const finalStreetCol = streetColName.trim() || defaultStreetCol;

    const latCol = lang === 'ar' ? 'خط العرض المحول (Y)' : 'Converted Latitude (Y)';
    const lonCol = lang === 'ar' ? 'خط الطول المحول (X)' : 'Converted Longitude (X)';
    const linkCol = lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link';

    const batchSize = geocodingMode === 'accurate' ? 3 : 6;
    const updatedPoints = [...globalPoints];
    let resolvedCount = 0;

    for (let i = 0; i < total; i += batchSize) {
      if (abortControllerRef.current) break;

      const chunk = updatedPoints.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (pt) => {
          let governorate = pt.governorate;
          let city = pt.city;
          let district = pt.district;
          let street = pt.street;

          const isMissing = 
            (!governorate || governorate === 'غير متوفر' || governorate === 'Unknown') ||
            (!city || city === 'غير متوفر' || city === 'Unknown') ||
            (!district || district === 'غير متوفر' || district === 'Unknown') ||
            (!street || street === 'غير متوفر' || street === 'Unknown');

          if (isMissing) {
            try {
              let targetY = pt.y;
              let targetX = pt.x;
              if ((!targetY || !targetX || isNaN(targetY) || isNaN(targetX) || (targetY === 0 && targetX === 0)) && pt.path && pt.path.length > 0) {
                const mid = Math.floor(pt.path.length / 2);
                targetY = pt.path[mid]?.y ?? pt.path[0]?.y;
                targetX = pt.path[mid]?.x ?? pt.path[0]?.x;
              }

              if (targetY && targetX && !isNaN(targetY) && !isNaN(targetX)) {
                const geo = await getReverseGeocode(targetY, targetX, geocodingMode);
                if (geo.governorate && geo.governorate !== 'غير متوفر') {
                  governorate = geo.governorate;
                  pt.governorate = governorate;
                }
                if (geo.city && geo.city !== 'غير متوفر') {
                  city = geo.city;
                  pt.city = city;
                }
                if (geo.district && geo.district !== 'غير متوفر') {
                  district = geo.district;
                  pt.district = district;
                }
                if (geo.street && geo.street !== 'غير متوفر') {
                  street = geo.street;
                  pt.street = street;
                }
              }
            } catch (err) {
              // Graceful fallback
            }
          }

          const safeGov = governorate && governorate !== 'غير متوفر' ? governorate : (lang === 'ar' ? 'غير معروف' : 'Unknown');
          const safeCity = city && city !== 'غير متوفر' ? city : (lang === 'ar' ? 'غير معروف' : 'Unknown');
          const safeDistrict = district && district !== 'غير متوفر' ? district : (lang === 'ar' ? 'غير معروف' : 'Unknown');
          const safeStreet = street && street !== 'غير متوفر' ? street : (lang === 'ar' ? 'غير معروف' : 'Unknown');

          pt.governorate = safeGov;
          pt.city = safeCity;
          pt.district = safeDistrict;
          pt.street = safeStreet;

          pt.attributes = { ...(pt.attributes || {}) };

          if (includeGovernorate) pt.attributes[finalGovCol] = safeGov;
          if (includeCity) pt.attributes[finalCityCol] = safeCity;
          if (includeDistrict) pt.attributes[finalDistrictCol] = safeDistrict;
          if (includeStreet) pt.attributes[finalStreetCol] = safeStreet;

          if (addCoordinates) {
            pt.attributes[latCol] = String(pt.y);
            pt.attributes[lonCol] = String(pt.x);
          }
          if (addMapLink) {
            pt.attributes[linkCol] = `https://www.google.com/maps?q=${pt.y},${pt.x}`;
          }

          // Build live feedback message in logical order: Governorate > City > District > Street
          const parts = [
            safeGov !== 'غير معروف' && safeGov !== 'Unknown' ? safeGov : null,
            safeCity !== 'غير معروف' && safeCity !== 'Unknown' ? safeCity : null,
            safeDistrict !== 'غير معروف' && safeDistrict !== 'Unknown' ? safeDistrict : null,
            safeStreet !== 'غير معروف' && safeStreet !== 'Unknown' ? safeStreet : null
          ].filter(Boolean);

          if (parts.length > 0) {
            resolvedCount++;
            setLastResolvedMsg(parts.join(' ◂ '));
          }
        })
      );

      const currentDone = Math.min(i + batchSize, total);
      setProcessedCount(currentDone);
      setProgressPct(Math.round((currentDone / total) * 100));

      // Yield briefly to keep browser UI reactive
      await new Promise((res) => setTimeout(res, 20));
    }

    // 1. Prepare new headers list with strict hierarchy order:
    // [المحافظة] -> [المدينة] -> [الحي] -> [الشارع] -> [الإحداثيات] -> [الرابط]
    const originalHeaders = activeFile.headers ? [...activeFile.headers] : [];
    const headersToAdd: string[] = [];

    // 1. Governorate column
    if (includeGovernorate) {
      if (activeGovMap && originalHeaders.includes(activeGovMap)) {
        // mapped to existing column
      } else if (!originalHeaders.includes(finalGovCol)) {
        headersToAdd.push(finalGovCol);
      }
    }

    // 2. City column
    if (includeCity) {
      if (activeCityMap && originalHeaders.includes(activeCityMap)) {
        // mapped to existing column
      } else if (!originalHeaders.includes(finalCityCol)) {
        headersToAdd.push(finalCityCol);
      }
    }

    // 3. District column
    if (includeDistrict) {
      if (districtMappingCol && originalHeaders.includes(districtMappingCol)) {
        // mapped to existing column
      } else if (!originalHeaders.includes(finalDistrictCol)) {
        headersToAdd.push(finalDistrictCol);
      }
    }

    // 4. Street column
    if (includeStreet) {
      if (streetMappingCol && originalHeaders.includes(streetMappingCol)) {
        // mapped to existing column
      } else if (!originalHeaders.includes(finalStreetCol)) {
        headersToAdd.push(finalStreetCol);
      }
    }

    // Additional columns (Lat, Lon, Link)
    if (addCoordinates) {
      if (!originalHeaders.includes(latCol)) headersToAdd.push(latCol);
      if (!originalHeaders.includes(lonCol)) headersToAdd.push(lonCol);
    }
    if (addMapLink) {
      if (!originalHeaders.includes(linkCol)) headersToAdd.push(linkCol);
    }

    const newHeaders = [...originalHeaders, ...headersToAdd];

    // 2. Prepare new rows in activeFile.data
    const newRows = activeFile.data.map((row: any[], rowIdx: number) => {
      const pt = updatedPoints[rowIdx];
      const newRow = Array.isArray(row) ? [...row] : [];

      // Ensure length matches original headers
      while (newRow.length < originalHeaders.length) {
        newRow.push('');
      }

      // Handle Governorate
      if (includeGovernorate) {
        const govVal = pt ? pt.governorate || '' : '';
        if (activeGovMap && originalHeaders.includes(activeGovMap)) {
          const idx = originalHeaders.indexOf(activeGovMap);
          if (idx !== -1) newRow[idx] = govVal;
        } else {
          const gIdx = newHeaders.indexOf(finalGovCol);
          if (gIdx !== -1) newRow[gIdx] = govVal;
        }
      }

      // Handle City
      if (includeCity) {
        const cityVal = pt ? pt.city || '' : '';
        if (activeCityMap && originalHeaders.includes(activeCityMap)) {
          const idx = originalHeaders.indexOf(activeCityMap);
          if (idx !== -1) newRow[idx] = cityVal;
        } else {
          const cIdx = newHeaders.indexOf(finalCityCol);
          if (cIdx !== -1) newRow[cIdx] = cityVal;
        }
      }

      // Handle District
      if (includeDistrict) {
        const distVal = pt ? pt.district || '' : '';
        if (districtMappingCol && originalHeaders.includes(districtMappingCol)) {
          const idx = originalHeaders.indexOf(districtMappingCol);
          if (idx !== -1) newRow[idx] = distVal;
        } else {
          const distIdx = newHeaders.indexOf(finalDistrictCol);
          if (distIdx !== -1) newRow[distIdx] = distVal;
        }
      }

      // Handle Street
      if (includeStreet) {
        const stVal = pt ? pt.street || '' : '';
        if (streetMappingCol && originalHeaders.includes(streetMappingCol)) {
          const idx = originalHeaders.indexOf(streetMappingCol);
          if (idx !== -1) newRow[idx] = stVal;
        } else {
          const stIdx = newHeaders.indexOf(finalStreetCol);
          if (stIdx !== -1) newRow[stIdx] = stVal;
        }
      }

      // Handle Lat / Lon
      if (addCoordinates) {
        const latIdx = newHeaders.indexOf(latCol);
        const lonIdx = newHeaders.indexOf(lonCol);
        if (latIdx !== -1) newRow[latIdx] = pt ? pt.y : '';
        if (lonIdx !== -1) newRow[lonIdx] = pt ? pt.x : '';
      }

      // Handle Link
      if (addMapLink) {
        const lIdx = newHeaders.indexOf(linkCol);
        if (lIdx !== -1 && pt) newRow[lIdx] = `https://www.google.com/maps?q=${pt.y},${pt.x}`;
      }

      if (pt) {
        pt.originalRow = newRow;
      }

      return newRow;
    });

    // 3. Update activeFile
    const updatedFile: ParsedFile = {
      ...activeFile,
      headers: newHeaders,
      data: newRows,
      preview: newRows.slice(0, 5)
    };
    setActiveFile(updatedFile);

    // 4. Update globalPoints
    setGlobalPoints(updatedPoints);

    // 5. Update selectedHeaders
    setSelectedHeaders((prev) => Array.from(new Set([...prev, ...newHeaders])));

    setIsFetching(false);
    setIsCompleted(true);
    setProgressPct(100);

    const summaryParts: string[] = [];
    if (includeGovernorate) summaryParts.push(lang === 'ar' ? 'المحافظة' : 'Governorate');
    if (includeCity) summaryParts.push(lang === 'ar' ? 'المدينة' : 'City');
    if (includeDistrict) summaryParts.push(lang === 'ar' ? 'الحي' : 'District');
    if (includeStreet) summaryParts.push(lang === 'ar' ? 'الشارع' : 'Street');

    const successMsg = lang === 'ar'
      ? `تم بنجاح جلب بيانات (${summaryParts.join(' و ')}) لـ (${total}) موقع وإضافتها بالترتيب القياسي في الملف!`
      : `Successfully fetched (${summaryParts.join(', ')}) for (${total}) locations and added columns to file!`;

    if (onSuccessNotification) {
      onSuccessNotification(successMsg);
    }
  };

  useEffect(() => {
    if (autoFetchPreference && !isCompleted && !isFetching && globalPoints.length > 0 && activeFile) {
      const alreadyFetched = globalPoints.filter(p => p.street && p.street !== 'غير متوفر' && p.street !== 'Unknown').length;
      if (alreadyFetched === 0) {
        handleFetchAddressHierarchy();
      }
    }
  }, [activeFile?.filename, autoFetchPreference]);

  // Export updated Excel file directly
  const handleDownloadUpdatedExcel = () => {
    if (!activeFile) return;

    const workbook = XLSX.utils.book_new();
    const headers = activeFile.headers || [];
    const rows = activeFile.data || [];

    const sheetData = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto calculate column widths
    const colWidths = headers.map((h, i) => {
      let maxLen = String(h || '').length;
      for (let r = 0; r < Math.min(rows.length, 50); r++) {
        const cell = rows[r] && rows[r][i] !== undefined ? String(rows[r][i]) : '';
        if (cell.length > maxLen) maxLen = cell.length;
      }
      return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
    });
    worksheet['!cols'] = colWidths;

    const sheetTitle = lang === 'ar' ? 'البيانات مع العناوين المحللة' : 'Data with Address Details';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

    const baseName = (activeFile.filename || 'export').replace(/\.[^/.]+$/, '');
    const outName = `${baseName}_with_address_hierarchy.xlsx`;
    XLSX.writeFile(workbook, outName);
  };

  if (!activeFile || (activeFile.type !== 'excel' && activeFile.type !== 'csv')) {
    return null;
  }

  // List of all new address column names to highlight in preview
  const newColumnKeys = [
    govColName,
    cityColName,
    districtColName,
    streetColName,
    'المحافظة',
    'المدينة',
    'الحي',
    'الشارع',
    'Governorate',
    'City',
    'District',
    'Street',
    lang === 'ar' ? 'خط العرض المحول (Y)' : 'Converted Latitude (Y)',
    lang === 'ar' ? 'خط الطول المحول (X)' : 'Converted Longitude (X)',
    lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link'
  ];

  return (
    <div className="bg-[#0b2d3d]/50 p-6 rounded-[2.5rem] border border-accent/20 shadow-2xl space-y-6 animate-in slide-in-from-bottom duration-400 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-inner">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-black text-sm">
                {lang === 'ar' ? 'جلب بيانات العنوان: المحافظة / المدينة قبل الحي والشارع' : 'Fetch Address: Governorate / City before District & Street'}
              </h3>
              <span className="bg-accent/20 text-accent text-[9px] font-black px-2 py-0.5 rounded-full border border-accent/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {lang === 'ar' ? 'تسلسل جغرافي ذكي' : 'Smart Hierarchy'}
              </span>
            </div>
            <p className="text-[10px] text-white/50 font-bold mt-0.5">
              {lang === 'ar'
                ? 'استخراج بيانات الموقع وترتيب الأعمدة تلقائياً: (المحافظة ◂ المدينة ◂ الحي ◂ الشارع) وتضمينها في الإكسل'
                : 'Extract and arrange columns: (Governorate ◂ City ◂ District ◂ Street) automatically into Excel'}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {lang === 'ar' ? `تم الجلب والتحديث لـ (${resolvedPointsCount || globalPoints.length}) موقع 🎯` : `Enriched (${resolvedPointsCount || globalPoints.length}) items 🎯`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-white/5 text-white/60 border border-white/10">
              <Compass className="w-3.5 h-3.5 text-accent" />
              {lang === 'ar' ? `جاهز للجلب (${globalPoints.length} موقع)` : `Ready to fetch (${globalPoints.length} items)`}
            </span>
          )}
        </div>
      </div>

      {/* Quick Selection Presets */}
      <div className="flex flex-wrap items-center gap-2 bg-black/25 p-2.5 rounded-2xl border border-white/5">
        <span className="text-[10px] font-black text-white/60 px-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-accent" />
          {lang === 'ar' ? 'التسلسل المطلوب:' : 'Hierarchy Preset:'}
        </span>
        <button
          type="button"
          onClick={() => applyPreset('all')}
          className={cn(
            "px-3 py-1.5 rounded-xl text-[10px] font-black transition-all",
            includeGovernorate && includeCity && includeDistrict && includeStreet
              ? "bg-accent text-primary shadow-sm"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          )}
        >
          {lang === 'ar' ? '✨ شامل (المحافظة + المدينة + الحي + الشارع)' : '✨ Full (Gov + City + District + Street)'}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('city-district-street')}
          className={cn(
            "px-3 py-1.5 rounded-xl text-[10px] font-black transition-all",
            !includeGovernorate && includeCity && includeDistrict && includeStreet
              ? "bg-accent text-primary shadow-sm"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          )}
        >
          {lang === 'ar' ? 'المدينة + الحي + الشارع' : 'City + District + Street'}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('gov-district-street')}
          className={cn(
            "px-3 py-1.5 rounded-xl text-[10px] font-black transition-all",
            includeGovernorate && !includeCity && includeDistrict && includeStreet
              ? "bg-accent text-primary shadow-sm"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          )}
        >
          {lang === 'ar' ? 'المحافظة + الحي + الشارع' : 'Gov + District + Street'}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('district-street')}
          className={cn(
            "px-3 py-1.5 rounded-xl text-[10px] font-black transition-all",
            !includeGovernorate && !includeCity && includeDistrict && includeStreet
              ? "bg-accent text-primary shadow-sm"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          )}
        >
          {lang === 'ar' ? 'الحي والشارع فقط' : 'District & Street only'}
        </button>
      </div>

      {/* Main Options: 4 Columns in Exact Order (Governorate -> City -> District -> Street) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Governorate Column */}
        <div className={cn(
          "p-3.5 rounded-2xl border transition-all space-y-2 relative",
          includeGovernorate ? "bg-black/30 border-accent/40" : "bg-black/10 border-white/5 opacity-60"
        )}>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-black text-white">
              <input
                type="checkbox"
                checked={includeGovernorate}
                onChange={(e) => setIncludeGovernorate(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent rounded"
              />
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>{lang === 'ar' ? '1. المحافظة' : '1. Governorate'}</span>
            </label>
            {activeGovMap && (
              <span className="text-[8.5px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                {lang === 'ar' ? 'مربوط' : 'Mapped'}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              disabled={!includeGovernorate}
              value={govColName}
              onChange={(e) => setGovColName(e.target.value)}
              placeholder={defaultGovCol}
              className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2.5 py-1.5 text-[10.5px] font-bold text-white outline-none focus:border-accent disabled:opacity-50"
            />
            {activeFile.headers && activeFile.headers.length > 0 && (
              <select
                disabled={!includeGovernorate}
                value={activeGovMap}
                onChange={(e) => handleSetGovMap(e.target.value)}
                className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2 py-1 text-[9.5px] font-bold text-white/80 outline-none disabled:opacity-50"
              >
                <option value="">{lang === 'ar' ? '+ عمود جديد (المحافظة)' : '+ New Column'}</option>
                {activeFile.headers.map((h, idx) => (
                  <option key={`gov-opt-${h}-${idx}`} value={h}>
                    {lang === 'ar' ? `استبدال: ${h}` : `Replace: ${h}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 2. City Column */}
        <div className={cn(
          "p-3.5 rounded-2xl border transition-all space-y-2 relative",
          includeCity ? "bg-black/30 border-accent/40" : "bg-black/10 border-white/5 opacity-60"
        )}>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-black text-white">
              <input
                type="checkbox"
                checked={includeCity}
                onChange={(e) => setIncludeCity(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent rounded"
              />
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>{lang === 'ar' ? '2. المدينة' : '2. City'}</span>
            </label>
            {activeCityMap && (
              <span className="text-[8.5px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                {lang === 'ar' ? 'مربوط' : 'Mapped'}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              disabled={!includeCity}
              value={cityColName}
              onChange={(e) => setCityColName(e.target.value)}
              placeholder={defaultCityCol}
              className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2.5 py-1.5 text-[10.5px] font-bold text-white outline-none focus:border-accent disabled:opacity-50"
            />
            {activeFile.headers && activeFile.headers.length > 0 && (
              <select
                disabled={!includeCity}
                value={activeCityMap}
                onChange={(e) => handleSetCityMap(e.target.value)}
                className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2 py-1 text-[9.5px] font-bold text-white/80 outline-none disabled:opacity-50"
              >
                <option value="">{lang === 'ar' ? '+ عمود جديد (المدينة)' : '+ New Column'}</option>
                {activeFile.headers.map((h, idx) => (
                  <option key={`city-opt-${h}-${idx}`} value={h}>
                    {lang === 'ar' ? `استبدال: ${h}` : `Replace: ${h}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 3. District Column */}
        <div className={cn(
          "p-3.5 rounded-2xl border transition-all space-y-2 relative",
          includeDistrict ? "bg-black/30 border-accent/40" : "bg-black/10 border-white/5 opacity-60"
        )}>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-black text-white">
              <input
                type="checkbox"
                checked={includeDistrict}
                onChange={(e) => setIncludeDistrict(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent rounded"
              />
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{lang === 'ar' ? '3. الحي' : '3. District'}</span>
            </label>
            {districtMappingCol && (
              <span className="text-[8.5px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                {lang === 'ar' ? 'مربوط' : 'Mapped'}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              disabled={!includeDistrict}
              value={districtColName}
              onChange={(e) => setDistrictColName(e.target.value)}
              placeholder={defaultDistrictCol}
              className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2.5 py-1.5 text-[10.5px] font-bold text-white outline-none focus:border-accent disabled:opacity-50"
            />
            {activeFile.headers && activeFile.headers.length > 0 && (
              <select
                disabled={!includeDistrict}
                value={districtMappingCol}
                onChange={(e) => setDistrictMappingCol(e.target.value)}
                className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2 py-1 text-[9.5px] font-bold text-white/80 outline-none disabled:opacity-50"
              >
                <option value="">{lang === 'ar' ? '+ عمود جديد (الحي)' : '+ New Column'}</option>
                {activeFile.headers.map((h, idx) => (
                  <option key={`dist-opt-${h}-${idx}`} value={h}>
                    {lang === 'ar' ? `استبدال: ${h}` : `Replace: ${h}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 4. Street Column */}
        <div className={cn(
          "p-3.5 rounded-2xl border transition-all space-y-2 relative",
          includeStreet ? "bg-black/30 border-accent/40" : "bg-black/10 border-white/5 opacity-60"
        )}>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-black text-white">
              <input
                type="checkbox"
                checked={includeStreet}
                onChange={(e) => setIncludeStreet(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent rounded"
              />
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span>{lang === 'ar' ? '4. الشارع' : '4. Street'}</span>
            </label>
            {streetMappingCol && (
              <span className="text-[8.5px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                {lang === 'ar' ? 'مربوط' : 'Mapped'}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              disabled={!includeStreet}
              value={streetColName}
              onChange={(e) => setStreetColName(e.target.value)}
              placeholder={defaultStreetCol}
              className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2.5 py-1.5 text-[10.5px] font-bold text-white outline-none focus:border-accent disabled:opacity-50"
            />
            {activeFile.headers && activeFile.headers.length > 0 && (
              <select
                disabled={!includeStreet}
                value={streetMappingCol}
                onChange={(e) => setStreetMappingCol(e.target.value)}
                className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-2 py-1 text-[9.5px] font-bold text-white/80 outline-none disabled:opacity-50"
              >
                <option value="">{lang === 'ar' ? '+ عمود جديد (الشارع)' : '+ New Column'}</option>
                {activeFile.headers.map((h, idx) => (
                  <option key={`st-opt-${h}-${idx}`} value={h}>
                    {lang === 'ar' ? `استبدال: ${h}` : `Replace: ${h}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Toggle Options */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="text-[10px] font-black text-white/50 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <span>{lang === 'ar' ? 'خيارات إضافية (إحداثيات WGS84 ورابط الخريطة ونمط الدقة)' : 'Additional options (Coordinates, Map link & Accuracy)'}</span>
          {showAdvancedSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showAdvancedSettings && (
          <div className="mt-3 p-4 bg-black/30 rounded-2xl border border-white/5 space-y-3 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-[10.5px] font-bold text-white/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addCoordinates}
                  onChange={(e) => setAddCoordinates(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded"
                />
                <span>{lang === 'ar' ? 'إضافة عمودي خط العرض (Lat) وخط الطول (Lon) المحولين' : 'Add Converted Latitude (Y) & Longitude (X)'}</span>
              </label>

              <label className="flex items-center gap-2 text-[10.5px] font-bold text-white/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addMapLink}
                  onChange={(e) => setAddMapLink(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded"
                />
                <span>{lang === 'ar' ? 'إضافة عمود رابط قوقل ماب المباشر (Google Maps Link)' : 'Add direct Google Maps Link column'}</span>
              </label>
            </div>

            <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-white/60">
                  {lang === 'ar' ? 'نمط جلب الخريطة:' : 'Map Fetching Engine:'}
                </span>
                <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setGeocodingMode && setGeocodingMode('accurate')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[9.5px] font-black transition-all",
                      geocodingMode === 'accurate' ? "bg-accent text-primary shadow-sm" : "text-white/40 hover:text-white"
                    )}
                  >
                    {lang === 'ar' ? 'دقيق جداً 🎯' : 'Accurate 🎯'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeocodingMode && setGeocodingMode('fast')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[9.5px] font-black transition-all",
                      geocodingMode === 'fast' ? "bg-accent text-primary shadow-sm" : "text-white/40 hover:text-white"
                    )}
                  >
                    {lang === 'ar' ? 'سريع ⚡' : 'Fast ⚡'}
                  </button>
                </div>
              </div>

              {/* Auto-fetch on upload toggle */}
              <label className="flex items-center gap-2 text-[10px] font-bold text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFetchPreference}
                  onChange={(e) => handleToggleAutoFetch(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent rounded"
                />
                <span>{lang === 'ar' ? 'جلب العناوين تلقائياً عند رفع أي إكسل مستقبلاً' : 'Auto-fetch on future Excel uploads'}</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Progress View when Fetching */}
      {isFetching && (
        <div className="p-4 bg-accent/10 border border-accent/30 rounded-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-black">
            <div className="flex items-center gap-2 text-accent">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {lang === 'ar'
                  ? `جاري التواصل مع الخريطة وجلب المحافظة والمدينة والحي والشارع (${processedCount} من ${totalCount})...`
                  : `Contacting map and fetching address hierarchy (${processedCount} of ${totalCount})...`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white font-mono text-sm">{progressPct}%</span>
              <button
                type="button"
                onClick={handleCancel}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[9px] font-black transition-all"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>

          {/* Progress bar track */}
          <div className="w-full bg-black/40 h-2.5 rounded-full overflow-hidden border border-white/5">
            <div
              className="bg-accent h-full transition-all duration-300 rounded-full relative overflow-hidden"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>

          {lastResolvedMsg && (
            <div className="text-[10px] font-bold text-white/80 truncate flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-accent shrink-0" />
              <span>{lang === 'ar' ? 'الموقع الأخير المستخرج:' : 'Latest resolved:'}</span>
              <span className="text-accent font-semibold">{lastResolvedMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons Bar */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          disabled={isFetching || globalPoints.length === 0 || (!includeGovernorate && !includeCity && !includeDistrict && !includeStreet)}
          onClick={handleFetchAddressHierarchy}
          className={cn(
            "flex-1 min-w-[220px] py-3.5 px-6 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg",
            isFetching
              ? "bg-white/10 text-white/40 cursor-not-allowed"
              : "bg-accent text-primary hover:bg-accent/90 hover:scale-[1.01] active:scale-[0.99]"
          )}
        >
          {isFetching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{lang === 'ar' ? 'جاري جلب البيانات من الخريطة...' : 'Fetching from map...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 fill-current" />
              <span>
                {isCompleted
                  ? (lang === 'ar' ? 'إعادة جلب وتحديث العناوين من الخريطة 🔄' : 'Re-fetch & Update Addresses from Map 🔄')
                  : (lang === 'ar' ? 'جلب بيانات العناوين وتضمين الأعمدة الآن ⚡' : 'Fetch Address Hierarchy & Add Columns Now ⚡')}
              </span>
            </>
          )}
        </button>

        {/* Download Enriched Excel Button */}
        {isCompleted && (
          <button
            type="button"
            onClick={handleDownloadUpdatedExcel}
            className="py-3.5 px-5 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 shadow-md hover:scale-[1.01]"
          >
            <Download className="w-4 h-4" />
            <span>{lang === 'ar' ? 'تحميل ملف Excel المحدث بالأعمدة' : 'Download Updated Excel'}</span>
          </button>
        )}

        {/* Preview Button */}
        {isCompleted && (
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="py-3.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 bg-white/5 text-white/80 hover:bg-white/10 border border-white/10 hover:text-white"
          >
            <Eye className="w-4 h-4" />
            <span>{lang === 'ar' ? 'معاينة الأعمدة المضافة' : 'Preview Added Columns'}</span>
          </button>
        )}
      </div>

      {/* Data Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0b2d3d] border border-accent/30 rounded-[2.5rem] w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                  <Table className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-black text-base">
                    {lang === 'ar' ? 'معاينة جدول البيانات مع أعمدة العناوين (المحافظة • المدينة • الحي • الشارع)' : 'Preview Table with Address Columns'}
                  </h3>
                  <p className="text-[11px] text-white/50 font-bold">
                    {lang === 'ar'
                      ? `تم تحديث (${activeFile.data.length}) صف وإضافة الأعمدة الجديدة باللون الأخضر المميز`
                      : `Updated (${activeFile.data.length}) rows with newly added columns highlighted in emerald`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto p-6 custom-scrollbar">
              <table className="w-full text-right text-[11px] border-collapse" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <thead>
                  <tr className="border-b border-white/10 bg-black/40">
                    <th className="p-3 text-white/40 font-mono text-[10px]">#</th>
                    {(activeFile.headers || []).map((h, hIdx) => {
                      const isNewCol = newColumnKeys.includes(h);

                      return (
                        <th
                          key={`th-${h}-${hIdx}`}
                          className={cn(
                            "p-3 font-black whitespace-nowrap",
                            isNewCol ? "text-emerald-300 bg-emerald-950/40 border-b-2 border-emerald-400" : "text-white/80"
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {isNewCol && <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />}
                            <span>{h}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeFile.data.slice(0, 25).map((row, rIdx) => (
                    <tr key={`row-${rIdx}`} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 text-white/30 font-mono text-[10px]">{rIdx + 1}</td>
                      {(activeFile.headers || []).map((h, cIdx) => {
                        const cellVal = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : '';
                        const isNewCol = newColumnKeys.includes(h);

                        return (
                          <td
                            key={`cell-${rIdx}-${cIdx}`}
                            className={cn(
                              "p-3 whitespace-nowrap font-bold",
                              isNewCol ? "text-emerald-300 bg-emerald-950/20 font-black" : "text-white/70"
                            )}
                          >
                            {cellVal.startsWith('http') ? (
                              <a
                                href={cellVal}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent underline hover:text-white inline-flex items-center gap-1"
                              >
                                {lang === 'ar' ? 'فتح في خرائط جوجل ↗' : 'Open in Google Maps ↗'}
                              </a>
                            ) : (
                              cellVal || '-'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between">
              <span className="text-[10px] text-white/50 font-bold">
                {lang === 'ar' ? `عرض أول 25 صف من أصل (${activeFile.data.length}) صف` : `Showing first 25 of (${activeFile.data.length}) rows`}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadUpdatedExcel}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'تحميل كـ Excel' : 'Download as Excel'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-white/10 hover:bg-white/15 text-white transition-all"
                >
                  {lang === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
