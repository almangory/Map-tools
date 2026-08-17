import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Database, Download, AlertTriangle, AlertOctagon, ArrowRight, ArrowLeft, RefreshCw, Layers, CheckCircle2, CloudDownload, PenTool, FileSpreadsheet, FileText, Target, Zap, Check, ChevronDown, X, Search, Plus, ShieldCheck, FolderArchive, Loader2, Map as MapIcon, AlertCircle } from 'lucide-react';
import { GeoPoint } from '../types';
import { OverlapResult } from '../services/geometryService';
import { downloadKMZ } from '../services/kmlService';
import { downloadDXF } from '../services/dxfExportService';
import { downloadDataPDF } from '../services/pdfExportService';
import { downloadShapefile } from '../services/shapefileExportService';
import { extractAllPointAttributes, parseDescriptionToAttributes, stripHtml, extractNumbersOnly, isNumericTargetField, cleanZoneValue, isZoneField } from '../services/parserService';
import { matchStatusByColor } from '../services/colorUtils';
import { calculatePathLength } from '../services/geometryService';
import { formatProjectIdForExcel } from '../services/storageService';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); };

const STANDARD_COLORS = [
  { name: 'Water', hex: '#01579B' },
  { name: 'Wastewater', hex: '#097138' },
  { name: 'Work in Progress', hex: '#ffea00' },
  { name: 'Remaining Works', hex: '#a52714' },
  { name: 'Cancelled Works', hex: '#F48FB1' }
];

function hexToRgb(hex: string) {
  let cleanHex = String(hex || '').trim().toUpperCase();
  if (cleanHex.startsWith('#')) cleanHex = cleanHex.substring(1);
  if (cleanHex.length === 8) cleanHex = cleanHex.substring(2); // Strip alpha
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function colorDistance(c1: {r: number, g: number, b: number}, c2: {r: number, g: number, b: number}) {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

function getClosestStandardColor(hex?: string) {
  if (!hex) return hex;
  const c1 = hexToRgb(hex);
  if (!c1) return hex;
  
  let minDistance = Infinity;
  let closest = hex;
  
  for (const std of STANDARD_COLORS) {
    const c2 = hexToRgb(std.hex);
    if (c2) {
        const dist = colorDistance(c1, c2);
        if (dist < minDistance) {
            minDistance = dist;
            closest = std.hex;
        }
    }
  }
  return closest;
}

const TEMPLATES = {
  all: {
    name: 'الكل - جميع الطبقات والعناصر (All Layers & Geometries)',
    fields: ["OBJECTID", "ASSETID", "DISTRICT", "STREETNAME", "ASSETSTATUS", "FEATURETYPE", "INNERDIAMETER", "ACTUALLENGTH", "SHAPE_Length", "segment id", "Permit No", "ZONE", "CONTRACTOR", "PROJECTNAME"]
  },
  pipes: {
    name: 'أنابيب / خطوط (Pipes/Lines)',
    fields: ["OBJECTID", "ANCILLARYROLE", "ENABLED", "SERIALNUMBER", "DISTRICT", "STREETNAME", "ASSETSTATUS", "ASSETCONDITION", "STARTXCOORDINATE", "STARTYCOORDINATE", "ENDXCOORDINATE", "ENDYCOORDINATE", "STARTPIPEGROUNDELEVATION", "STARTPIPEELEVATION", "ENDPIPEGROUNDELEVATION", "ENDPIPEELEVATION", "PROXIMITYTONETWORK", "COMMISSIONDATE", "INSTALLDATE", "SURVEYDATE", "FEATURETYPE", "INNERDIAMETER", "OUTERDIAMETER", "MATERIAL", "CONSULTANT", "ACTUALLENGTH", "MANUFACTURE", "REMARKS", "SHAPE_Length", "MaintRoute", "RouteSequence", "LINENO", "segment id", "Permit No", "ZONE", "Drilling type", "Stage", "CONTRACTOR", "PROJECTNAME", "PROJECTID"]
  },
  points: {
    name: 'غرف / ملحقات (Chambers/Fittings)',
    fields: ["OBJECTID", "ANCILLARYROLE", "ENABLED", "ASSETID", "ASSETNAME", "SERIALNUMBER", "DISTRICT", "STREETNAME", "ASSETSTATUS", "ASSETCONDITION", "XCOORDINATE", "YCOORDINATE", "GROUNDELEVATION", "ELEVATION", "PROXIMITYTONETWORK", "COMMISSIONDATE", "INSTALLDATE", "FEATURETYPE", "CHAMBERSHAPE", "DIAMETER", "LENGTH", "WIDTH", "DEPTH", "REMARKS", "segment id", "Permit No", "ZONE", "Drilling type", "Stage", "CONTRACTOR", "PROJECTNAME", "PROJECTID"]
  },
  stations: {
    name: 'محطات الرفع والخزانات (Lift Stations & Tanks)',
    fields: ["إسم المشروع", "إسم المقاول", "رقم التعميد", "نوع المنشأة", "رقم المحطة", "السعة التصميمية للمحطة/الخزان", "عدد الخزانات", "سعة الخزان الواحد", "عدد المضخات", "طول خط الطرد", "قطر خط الطرد", "فرق المنسوب", "Water Hammer System", "Scada System", "Electric Switchboards", "موقف الاعمال المدنية", "نسبة الإنجاز الاعمال المدنية", "موقف الاعمال الميكانيكية والكهربائية", "نسبة الإنجاز الاعمال الميكانيكية والكهربائية", "التاريخ المتوقع للانتهاء من الاعمال وتسليم المحطة", "حالة اعتماد الامن الصناعي", "حالة اعتماد السلامة", "الدراسة الهيدروليكية", "إيصال التيار الكهربائي"]
  },
  polygons: {
    name: 'تنظيم النطاقات (Polygons)',
    fields: ["اسم المشروع", "اسم المقاول", "اسم مقاول الباطن", "اسم الاستشاري", "المالك", "حالة المشروع", "تصنيف المشروع", "تصنيف اداري", "البرنامج", "تاريخ البداية", "تاريخ النهاية", "تاريخ النهاية المعدل", "الازبلت", "الاستلام الابتدائي", "الاستلام النهائي", "عدد الاستلامات الجزئي", "تاريخ آخر جزء مسلم", "تاريخ الاستلام الجزئي"]
  },
  violations: {
    name: 'تنسيق التعديات (Violations)',
    fields: ["رقم بلاغ التعدي", "وصف التعدي", "أثر التعدي", "تاريخ التعدي", "رقم الرخصة", "تاريخ البلاغ", "الجهة المالكة", "الجهة المتعدية", "المقاول", "خط الطول", "خط العرض", "حالة البلاغ", "المدينة", "الحي", "الشارع", "تعليق المركز", "سجل المحادثات", "الجهه", "أسم المشروع"]
  },
  boundaries: {
    name: 'حدود ومساحة العقار (Property Boundaries)',
    fields: ["الاتجاه", "الحدود حسب الطبيعة", "الطول (حسب الطبيعة)", "الحدود حسب الصك", "الطول (حسب الصك)", "الحدود حسب المخطط", "الطول (حسب المخطط)"]
  },
  grids: {
    name: 'شبكيات (Grids)',
    fields: ["اسم المشروع", "اسم المقاول", "الحي", "حالة الشبكية", "اسم الشارع", "نوع الشبكية", "اسم الشبكية التعاقدي", "وصف الاعمال", "مدة العزل بالساعة", "تاريخ بدأ التنفيذ حسب البرنامج الزمني", "تاريخ البدأ بعد التنسيق مع الجهات", "التاريخ المتوقع للانتهاء", "طول الشبكية", "اعمق نقطة للشبكية", "عرض الشبكية", "الادارة الاشرافية", "الملاحظات"]
  },
  stowage_sites: {
    name: 'مواقع التشوين (Stowage Sites)',
    fields: ["اسم المشروع", "اسم المقاول", "PO", "نوع المشروع", "البرنامج", "تصنيف مواد التشوين", "هل يوجد سكن عمال", "اسم امين المستودع", "رقم تواصل", "هل تم التخصيص", "ملاحظات"]
  }
};

interface Props {
  points: GeoPoint[];
  headers?: string[];
  lang: 'ar' | 'en';
  fetchStreets?: (points: GeoPoint[], headers: string[], callback?: (pts: GeoPoint[]) => void | Promise<void>, forceFetch?: boolean) => Promise<GeoPoint[]>;
  overlapResults?: import('../services/geometryService').OverlapResult[] | null;
  geocodingMode?: 'accurate' | 'fast';
  onVerifyMissingAttributes?: () => void;
  onVerifyDataSyntaxErrors?: () => void;
  onVerifyPermitSegment?: () => void;
  onVerifyPermitNo?: () => void;
  onVerifyYellowMissing?: () => void;
  onVerifySbc?: () => void;
  setGeocodingMode?: (mode: 'accurate' | 'fast') => void;
  runWithLoading?: (msg: string, task: () => void | Promise<void>) => Promise<void>;
  setGlobalLoading?: (val: boolean) => void;
  setGlobalStatus?: (msg: string) => void;
  setGlobalProgress?: (pct: number | null) => void;
}

interface MultiSourceFieldSelectProps {
  selectedFields: string[];
  onChange: (fields: string[]) => void;
  sourceAttributes: Array<{ name: string; sample?: string }>;
  lang: 'ar' | 'en';
}

export const MultiSourceFieldSelect: React.FC<MultiSourceFieldSelectProps> = ({
  selectedFields,
  onChange,
  sourceAttributes,
  lang
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 360 });

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = Math.min(Math.max(rect.width, 360), window.innerWidth - 20);
      
      let left = rect.right - dropdownWidth;
      if (left < 10) left = 10;
      if (left + dropdownWidth > window.innerWidth - 10) {
        left = window.innerWidth - dropdownWidth - 10;
      }

      let top = rect.bottom + 6;
      if (top + 380 > window.innerHeight && rect.top > 380) {
        top = rect.top - 380 - 6;
      }

      setCoords({ top, left, width: dropdownWidth });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
    }
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen]);

  const specialOptions = [
    { value: 'الشارع (مسترجع)', label: lang === 'ar' ? '🗺️ ربط اسم الشارع تلقائياً من الخريطة' : '🗺️ Auto Street Name from Map' },
    { value: 'الحي (مسترجع)', label: lang === 'ar' ? '🏘️ ربط اسم الحي تلقائياً من الخريطة' : '🏘️ Auto District Name from Map' },
    { value: '__MAP_LENGTH__', label: lang === 'ar' ? '📏 حساب طول العنصر تلقائياً من الخريطة (متر)' : '📏 Auto Map Length from Map (m)' }
  ];

  const filteredAttributes = useMemo(() => {
    if (!search.trim()) return sourceAttributes;
    const q = search.toLowerCase().trim();
    return sourceAttributes.filter(attr => attr.name.toLowerCase().includes(q) || (attr.sample && attr.sample.toLowerCase().includes(q)));
  }, [sourceAttributes, search]);

  const toggleField = (fieldValue: string) => {
    if (selectedFields.includes(fieldValue)) {
      onChange(selectedFields.filter(f => f !== fieldValue));
    } else {
      onChange([...selectedFields, fieldValue]);
    }
  };

  const removeField = (fieldValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedFields.filter(f => f !== fieldValue));
  };

  return (
    <div ref={triggerRef} className="w-full">
      <div 
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setTimeout(updateCoords, 0);
        }}
        className="w-full min-h-[38px] bg-[#0e3f53] border border-white/10 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 cursor-pointer hover:border-accent/50 transition-all text-[10px] font-bold text-white shadow-inner"
      >
        {selectedFields.length === 0 ? (
          <span className="text-white/40 flex items-center justify-between w-full">
            <span>{lang === 'ar' ? '-- بدون ربط (اضغط لاختيار بيانات متعددة) --' : '-- Unmapped (Click to select multiple) --'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1 w-full justify-between">
            <div className="flex flex-wrap items-center gap-1 max-w-[85%]">
              {selectedFields.map((sf, sfIdx) => {
                const spec = specialOptions.find(o => o.value === sf);
                const displayLabel = spec ? spec.label : sf;
                return (
                  <span 
                    key={`sf-${sf}-${sfIdx}`} 
                    className="inline-flex items-center gap-1 bg-accent/20 text-accent border border-accent/40 px-2 py-0.5 rounded-md font-black text-[10px] shadow-sm"
                  >
                    <span className="truncate max-w-[110px]">{displayLabel}</span>
                    <button 
                      type="button" 
                      onClick={(e) => removeField(sf, e)} 
                      className="hover:bg-accent/30 rounded p-0.5 text-accent hover:text-white transition-colors"
                      title={lang === 'ar' ? 'إزالة' : 'Remove'}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-1 shrink-0 text-accent">
              <span className="text-[9px] bg-accent/30 px-1.5 py-0.5 rounded-full font-black">{selectedFields.length}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        )}
      </div>

      {isOpen && createPortal(
        <div 
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 999999
          }}
          className="bg-[#092533] border border-accent/60 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-3 text-white max-h-[380px] flex flex-col gap-2.5 backdrop-blur-2xl"
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-white/40 pointer-events-none" />
            <input 
              type="text"
              placeholder={lang === 'ar' ? 'ابحث في البيانات لتحديد عدة حقول...' : 'Filter source fields...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-lg pr-8 pl-3 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-accent placeholder-white/40"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar max-h-[260px]">
            {!search && (
              <div className="space-y-1 mb-2 pb-2 border-b border-white/10">
                <div className="text-[10px] font-black text-accent/90 px-1 mb-1">
                  {lang === 'ar' ? 'خيارات واسترجاع الخريطة:' : 'Map Auto Options:'}
                </div>
                {specialOptions.map(opt => {
                  const isChecked = selectedFields.includes(opt.value);
                  return (
                    <div 
                      key={opt.value}
                      onClick={() => toggleField(opt.value)}
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all",
                        isChecked ? "bg-accent/20 border border-accent/40 text-accent" : "hover:bg-white/10 text-white/90"
                      )}
                    >
                      <div className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0", isChecked ? "bg-accent text-primary border-accent" : "border-white/30")}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3px]" />}
                      </div>
                      <span className="leading-tight">{opt.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-[10px] font-black text-accent/90 px-1 mb-1">
              {lang === 'ar' ? 'حقول وبيانات الملف المصدر:' : 'Dataset Source Fields:'}
            </div>
            {filteredAttributes.length === 0 ? (
              <div className="text-[11px] text-white/40 p-3 text-center">
                {lang === 'ar' ? 'لا توجد نتائج' : 'No fields found'}
              </div>
            ) : (
              filteredAttributes.map((attr, attrIdx) => {
                const isChecked = selectedFields.includes(attr.name);
                return (
                  <div 
                    key={`filtered-attr-${attr.name}-${attrIdx}`}
                    onClick={() => toggleField(attr.name)}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all gap-2",
                      isChecked ? "bg-accent/20 border border-accent/40 text-accent" : "hover:bg-white/10 text-white/90"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn("w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-all", isChecked ? "bg-accent text-primary border-accent" : "border-white/30")}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3px]" />}
                      </div>
                      <span className="truncate">{attr.name}</span>
                    </div>
                    {attr.sample && (
                      <span className="text-[10px] text-white/40 font-normal truncate max-w-[140px] shrink-0 dir-ltr text-left">
                        {lang === 'ar' ? `(مثال: ${attr.sample})` : `(e.g. ${attr.sample})`}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[9px]">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="text-white/40 hover:text-red-400 font-bold transition-colors"
            >
              {lang === 'ar' ? 'مسح الكل' : 'Clear All'}
            </button>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              className="bg-accent text-primary font-black px-2.5 py-1 rounded-md hover:brightness-110 transition-all"
            >
              {lang === 'ar' ? 'تم 🗸' : 'Done 🗸'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const ProcessingModal = ({ lang }: { lang: 'ar' | 'en' }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate non-linear progress for UX
    const interval = setInterval(() => {
      setProgress(p => {
        if (p < 45) return p + 3;
        if (p < 75) return p + 1.5;
        if (p < 90) return p + 0.5;
        if (p < 98) return p + 0.1;
        return p;
      });
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999999 }}>
      <div className="bg-white border border-slate-200 rounded-[2rem] p-8 max-w-md w-full shadow-2xl relative overflow-hidden flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
        <h3 className="text-2xl font-black text-[#0b2d3d] mb-8">
          {lang === 'ar' ? 'جاري جلب البيانات المعالجة' : 'Fetching Processed Data'}
        </h3>
        
        {/* Animated Graphic */}
        <div className="relative w-32 h-32 mb-8">
          {/* Concentric Circles */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border-4 border-[#38bdf8]/20" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-[6px] border-[#38bdf8] border-r-transparent border-t-transparent animate-[spin_3s_linear_infinite]" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-16 h-16 rounded-full border-[6px] border-[#fca311] border-l-transparent border-b-transparent animate-[spin_2s_linear_infinite_reverse]" />
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-6 h-6 bg-slate-100 rounded-full" />
          </div>

          {/* Floating elements */}
          <div className="absolute -top-2 -left-4 bg-white border border-slate-100 p-2 rounded-lg shadow-lg animate-bounce" style={{ animationDelay: '0ms' }}>
            <MapIcon className="w-5 h-5 text-[#38bdf8]" />
          </div>
          <div className="absolute -top-6 right-8 bg-white border border-slate-100 p-2 rounded-lg shadow-lg animate-bounce" style={{ animationDelay: '200ms' }}>
             <FolderArchive className="w-5 h-5 text-slate-600" />
          </div>
          <div className="absolute top-8 -right-6 bg-white border border-slate-100 p-2 rounded-lg shadow-lg animate-bounce" style={{ animationDelay: '400ms' }}>
            <FileText className="w-5 h-5 text-[#fca311]" />
          </div>
        </div>

        <p className="text-slate-600 mb-6 font-bold text-sm leading-relaxed whitespace-pre-line">
          {lang === 'ar' 
            ? 'جاري تحميل البيانات المكانية من المصادر...\nيرجى الانتظار، لا تغلق التطبيق.' 
            : 'Downloading spatial data from sources...\nPlease wait, do not close the application.'}
        </p>
        
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-3 shadow-inner relative">
          <div 
            className="h-full bg-gradient-to-r from-[#fca311] to-[#fb8500] transition-all duration-300 ease-out rounded-full relative"
            style={{ width: `${Math.floor(progress)}%` }}
          >
             <div className="absolute inset-0 bg-white/20 w-full h-full animate-[pulse_1s_infinite]" />
          </div>
        </div>
        <div className="text-lg font-black text-[#0b2d3d]">
           {Math.floor(progress)}%
        </div>
      </div>
    </div>,
    document.body
  );
};

export const DataFormatter = ({ points, headers, lang, fetchStreets, overlapResults, geocodingMode, setGeocodingMode, onVerifyMissingAttributes, onVerifyDataSyntaxErrors, onVerifyPermitSegment, onVerifyPermitNo, onVerifyYellowMissing, onVerifySbc, runWithLoading, setGlobalLoading, setGlobalStatus, setGlobalProgress }: DataFormatterProps) => {
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const isExecutingRef = useRef(false);
  const [localGeocodingMode, setLocalGeocodingMode] = useState<'accurate' | 'fast'>('accurate');
  const currentGeocodingMode = geocodingMode || localGeocodingMode;
  const [targetTemplate, setTargetTemplate] = useState<'all' | 'pipes' | 'points' | 'stations' | 'polygons' | 'boundaries' | 'violations' | 'grids' | 'stowage_sites'>('all');
  const [networkType, setNetworkType] = useState<'water' | 'wastewater'>('water');
  const [keepFolders, setKeepFolders] = useState(true);
  const [retainUnmapped, setRetainUnmapped] = useState(false);
  const [optimizeForMyMaps, setOptimizeForMyMaps] = useState(false);
  const [keepOriginalDescription, setKeepOriginalDescription] = useState(false);
  const [removeImagesOnly, setRemoveImagesOnly] = useState(false);
  const [autoFetchStreets, setAutoFetchStreets] = useState(false);
  const [standardizeColors, setStandardizeColors] = useState(false);
  const [standardizePolygonColors, setStandardizePolygonColors] = useState(false);
  const [keepOriginalGridStyle, setKeepOriginalGridStyle] = useState(false);
  const [nameSourceField, setNameSourceField] = useState<string>('');
  
  // Collect all unique attributes from current points
  const sourceAttributes = useMemo(() => {
    const attrMap = new Map<string, string>();

    // 1. Add all active file headers if provided
    if (headers && Array.isArray(headers)) {
      headers.forEach(h => {
        if (h && typeof h === 'string' && h.trim()) {
          attrMap.set(h.trim(), '');
        }
      });
    }

    // 2. Collect attributes & sample values from points
    points.forEach(p => {
      if (p.attributes && Object.keys(p.attributes).length > 0) {
        Object.entries(p.attributes).forEach(([k, v]) => {
          const cleanK = String(k || '').trim();
          if (!cleanK) return;
          const valStr = String(v ?? '').trim();
          if (!attrMap.has(cleanK) || attrMap.get(cleanK) === '') {
            attrMap.set(cleanK, valStr.substring(0, 30));
          }
        });
      }

      if (p.description) {
        const descAttrs = parseDescriptionToAttributes(p.description, {});
        Object.entries(descAttrs).forEach(([k, v]) => {
          const cleanK = String(k || '').trim();
          if (!cleanK) return;
          const valStr = String(v ?? '').trim();
          if (!attrMap.has(cleanK) || attrMap.get(cleanK) === '') {
            attrMap.set(cleanK, valStr.substring(0, 30));
          }
        });
      }

      if (p.originalRow && headers) {
        headers.forEach((h, i) => {
          const cleanK = String(h || '').trim();
          if (!cleanK) return;
          const v = p.originalRow![i];
          const valStr = String(v ?? '').trim();
          if (!attrMap.has(cleanK) || attrMap.get(cleanK) === '') {
            attrMap.set(cleanK, valStr.substring(0, 30));
          }
        });
      }

      if (p.street && !attrMap.has('الشارع (مسترجع)')) attrMap.set('الشارع (مسترجع)', p.street.substring(0, 30));
      if (p.district && !attrMap.has('الحي (مسترجع)')) attrMap.set('الحي (مسترجع)', p.district.substring(0, 30));
    });

    return Array.from(attrMap.entries()).map(([name, sample]) => ({ name, sample }));
  }, [points, headers]);

  const [mapping, setMapping] = useState<Record<string, { sourceField?: string; sourceFields?: string[]; defaultValue?: string }>>({});

  // Auto-map matching source attributes to target template fields
  useEffect(() => {
    if (sourceAttributes.length === 0) return;

    setMapping(prev => {
      const newMap = { ...prev };
      let changed = false;

      const findAllMatchingSources = (aliases: string[]) => {
        return sourceAttributes.filter(sa => {
          const lower = sa.name.toLowerCase().replace(/[\s_#-]/g, '');
          return aliases.some(a => {
            const cleanA = a.toLowerCase().replace(/[\s_#-]/g, '');
            return lower === cleanA || lower.includes(cleanA) || cleanA.includes(lower);
          });
        }).map(sa => sa.name);
      };

      TEMPLATES[targetTemplate].fields.forEach(field => {
        const hasExisting = (newMap[field]?.sourceFields && newMap[field].sourceFields!.length > 0) || newMap[field]?.sourceField;
        if (!hasExisting) {
          let matchedList: string[] = [];

          if (field === 'INNERDIAMETER') {
            matchedList = findAllMatchingSources([
              'innerdiameter', 'inner_diameter', 'inner diameter', 'القطر الداخلي', 'القطر_الداخلي', 'قطر_داخلي', 'قطر داخلي', 'قطر_الخط', 'قطر الخط', 'قطر_الانبوب', 'قطر الانبوب', 'القطر', 'قطر', 'diameter', 'size'
            ]);
          } else if (field === 'OUTERDIAMETER') {
            matchedList = findAllMatchingSources([
              'outerdiameter', 'outer_diameter', 'outer diameter', 'القطر الخارجي', 'القطر_الخارجي', 'قطر_خارجي', 'قطر خارجي'
            ]);
          } else if (field === 'SHAPE_Length' || field === 'ACTUALLENGTH') {
            matchedList = findAllMatchingSources([
              'shape_length', 'shapelength', 'shape length', 'actuallength', 'actual_length', 'actual length', 'طول_الخط', 'طول الخط', 'طول_العنصر', 'الاطوال', 'length'
            ]);
            if (matchedList.length === 0) {
              matchedList = ['__MAP_LENGTH__'];
            }
          } else if (field === 'DIAMETER') {
            matchedList = findAllMatchingSources([
              'diameter', 'قطر_الخط', 'قطر الخط', 'قطر_الانبوب', 'قطر الانبوب', 'القطر', 'قطر', 'قطر_الشبكة', 'size', 'innerdiameter'
            ]);
          } else if (field === 'MATERIAL') {
            matchedList = findAllMatchingSources(['material', 'مادة', 'مادة_الخط', 'مادة الخط', 'نوع_الانبوب', 'نوع الانبوب']);
          } else if (field === 'PROJECTNAME' || field === 'PROJECTID' || field === 'اسم المشروع') {
            if (field.includes('ID') || field.includes('رقم')) {
              matchedList = findAllMatchingSources(['projectid', 'project_id', 'رقم_المشروع', 'رقم المشروع', 'fid']);
            } else {
              matchedList = findAllMatchingSources(['projectname', 'project_name', 'اسم_المشروع', 'اسم المشروع']);
            }
          } else if (field === 'Drilling type') {
            matchedList = findAllMatchingSources(['drilling type', 'drilling_type', 'نوع_الحفر', 'نوع الحفر']);
          } else if (field === 'ZONE') {
            matchedList = findAllMatchingSources(['zone_nu', 'zone', 'منطقة', 'النطاق', 'رقم_المنطقة']);
          } else if (field === 'Permit No') {
            matchedList = findAllMatchingSources(['permit no', 'permit_no', 'permit', 'رقم_الترخيص', 'رقم_الرخصة', 'رقم الرخصة']);
          } else if (field === 'segment id' || field === 'SEGMENT ID' || field.toLowerCase().includes('segment')) {
            matchedList = findAllMatchingSources([
              'segmentid', 'segment_id', 'segment id', 'segment', 'segmentno', 'segment_no', 'segment no',
              'segid', 'seg_id', 'seg id', 'seg', 'رقم الشريحة', 'كود الشريحة', 'معرف الشريحة', 'شريحة', 'شريحه', 'قطاع'
            ]);
          } else if (field === 'STREETNAME' || field === 'Street' || field === 'STREET_NAME' || field === 'اسم الشارع' || field === 'الشارع') {
            matchedList = findAllMatchingSources(['streetname', 'street', 'الشارع', 'اسم_الشارع', 'اسم الشارع', 'الشارع (مسترجع)']);
            if (matchedList.length === 0) {
              matchedList = ['الشارع (مسترجع)'];
            }
          } else if (field === 'DISTRICT' || field === 'District' || field === 'الحي' || field === 'اسم الحي') {
            matchedList = findAllMatchingSources(['district', 'الحي', 'اسم_الحي', 'اسم الحي', 'الحي (مسترجع)']);
            if (matchedList.length === 0) {
              matchedList = ['الحي (مسترجع)'];
            }
          } else if (field === 'CONTRACTOR') {
            matchedList = findAllMatchingSources(['contractor', 'المقاول', 'اسم_المقاول']);
          } else if (field === 'CONSULTANT') {
            matchedList = findAllMatchingSources(['consultant', 'الاستشاري', 'اسم_الاستشاري']);
          }

          if (matchedList.length > 0) {
            newMap[field] = {
              ...newMap[field],
              sourceField: matchedList[0],
              sourceFields: matchedList
            };
            changed = true;
          }
        }
      });

      return changed ? newMap : prev;
    });
  }, [sourceAttributes, targetTemplate]);

  // Auto-set nameSourceField for polygons template if not set
  useEffect(() => {
    if (targetTemplate === 'polygons' && !nameSourceField) {
      const findMatchingSource = (aliases: string[]) => {
        return sourceAttributes.find(sa => {
          const lower = sa.name.toLowerCase().replace(/[\s_#-]/g, '');
          return aliases.some(a => {
            const cleanA = a.toLowerCase().replace(/[\s_#-]/g, '');
            return lower === cleanA || lower.includes(cleanA) || cleanA.includes(lower);
          });
        })?.name;
      };

      const matchedZone = findMatchingSource(['zone_nu', 'zone', 'منطقة', 'النطاق', 'رقم_المنطقة', 'ZONE']);
      if (matchedZone) {
        setNameSourceField(matchedZone);
      } else {
        setNameSourceField('ZONE');
      }
    }
  }, [targetTemplate, sourceAttributes]);

  const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({
    all: [...TEMPLATES.all.fields],
    pipes: [...TEMPLATES.pipes.fields],
    points: [...TEMPLATES.points.fields],
    stations: [...TEMPLATES.stations.fields],
    polygons: [...TEMPLATES.polygons.fields],
    violations: [...TEMPLATES.violations.fields],
    boundaries: [...TEMPLATES.boundaries.fields],
    grids: [...TEMPLATES.grids.fields],
    stowage_sites: [...TEMPLATES.stowage_sites.fields]
  });

  
  const getProcessedPoints = (overridePoints?: GeoPoint[]) => {
    const pts = overridePoints || points;
    const currentSelected = selectedFields[targetTemplate] ?? TEMPLATES[targetTemplate].fields;
    let templateFields = TEMPLATES[targetTemplate].fields.filter(f => currentSelected.includes(f));
    
    const unselectedTemplateFields = new Set(
      TEMPLATES[targetTemplate].fields.filter(f => !templateFields.includes(f))
    );

    const isLengthTarget = (fName: string) => {
      const lower = fName.toLowerCase().replace(/[\s_#-]/g, '');
      return lower === 'shapelength' || lower === 'actuallength' || lower === 'length' || lower === 'طولالخط' || lower === 'طولالعنصر';
    };

    const isStreetTarget = (fName: string) => {
      const lower = fName.toLowerCase().replace(/[\s_#-]/g, '');
      return lower === 'streetname' || lower === 'street' || lower === 'street_name' || lower === 'اسمالشارع' || lower === 'الشارع' || lower === 'شارع';
    };

    const isDistrictTarget = (fName: string) => {
      const lower = fName.toLowerCase().replace(/[\s_#-]/g, '');
      return lower === 'district' || lower === 'اسمالحي' || lower === 'الحي' || lower === 'حي';
    };

    const processedPoints = pts.map(p => {
      const newAttrs: Record<string, string> = {};
      const mappedSourceFields = new Set<string>();

      templateFields.forEach(field => {
        const mapRules = mapping[field];
        const selectedSources = (mapRules?.sourceFields && mapRules.sourceFields.length > 0)
          ? mapRules.sourceFields
          : (mapRules?.sourceField ? [mapRules.sourceField] : []);

        let val = '';

        // Check selected source fields in order until a non-empty value is found
        for (const sf of selectedSources) {
          if (!sf) continue;

          if (sf === '__MAP_LENGTH__') {
            const calcLen = (p.path && p.path.length >= 2) ? calculatePathLength(p.path) : (p.originalLength || 0);
            if (calcLen > 0) {
              val = calcLen.toFixed(2);
              mappedSourceFields.add(sf);
              break;
            }
          } else if (sf === 'الشارع (مسترجع)') {
            const st = p.street || (p.attributes && (p.attributes['STREETNAME'] || p.attributes['الشارع'] || p.attributes['اسم الشارع'] || p.attributes['اسم_الشارع'])) || '';
            if (st && st !== 'غير متوفر' && st !== 'Unknown' && st !== 'غير معروف') {
              val = st;
              mappedSourceFields.add(sf);
              break;
            }
          } else if (sf === 'الحي (مسترجع)') {
            const dist = p.district || (p.attributes && (p.attributes['DISTRICT'] || p.attributes['الحي'] || p.attributes['اسم الحي'] || p.attributes['اسم_الحي'])) || '';
            if (dist && dist !== 'غير متوفر' && dist !== 'Unknown' && dist !== 'غير معروف') {
              val = dist;
              mappedSourceFields.add(sf);
              break;
            }
          } else {
            const sourceFieldLower = String(sf || '').toLowerCase().trim();
            if (p.attributes) {
              const matchedKey = Object.keys(p.attributes).find(k => String(k || '').toLowerCase().trim() === sourceFieldLower);
              if (matchedKey && p.attributes[matchedKey] !== undefined && p.attributes[matchedKey] !== null) {
                const str = String(p.attributes[matchedKey]).trim();
                if (str) {
                  val = str;
                  mappedSourceFields.add(sf);
                  break;
                }
              }
            }
            if (!val && p.description) {
              const descAttrs = parseDescriptionToAttributes(p.description, {});
              const matchedKey = Object.keys(descAttrs).find(k => String(k || '').toLowerCase().trim() === sourceFieldLower);
              if (matchedKey && descAttrs[matchedKey] !== undefined && descAttrs[matchedKey] !== null) {
                const str = String(descAttrs[matchedKey]).trim();
                if (str) {
                  val = str;
                  mappedSourceFields.add(sf);
                  break;
                }
              }
            }
            if (!val && p.originalRow && headers) {
              const matchedIndex = headers.findIndex(h => String(h || '').toLowerCase().trim() === sourceFieldLower);
              if (matchedIndex !== -1 && p.originalRow[matchedIndex] !== undefined && p.originalRow[matchedIndex] !== null) {
                const str = String(p.originalRow[matchedIndex]).trim();
                if (str) {
                  val = str;
                  mappedSourceFields.add(sf);
                  break;
                }
              }
            }
          }
        }

        // Fallback: If val is still empty and this is a length field (e.g. SHAPE_Length), auto-fill from map geometry length
        if (!val && isLengthTarget(field)) {
            const calcLen = (p.path && p.path.length >= 2) ? calculatePathLength(p.path) : (p.originalLength || 0);
            if (calcLen > 0) {
                val = calcLen.toFixed(2);
            }
        }

        // Fallback: If val is empty and this is a street or district field, auto-fill from reverse geocoded map data
        if (!val && isStreetTarget(field)) {
            const st = p.street || (p.attributes && (p.attributes['STREETNAME'] || p.attributes['الشارع'] || p.attributes['اسم الشارع'] || p.attributes['اسم_الشارع'])) || '';
            if (st && st !== 'غير متوفر' && st !== 'Unknown' && st !== 'غير معروف') {
                val = st;
            }
        }
        if (!val && isDistrictTarget(field)) {
            const dist = p.district || (p.attributes && (p.attributes['DISTRICT'] || p.attributes['الحي'] || p.attributes['اسم الحي'] || p.attributes['اسم_الحي'])) || '';
            if (dist && dist !== 'غير متوفر' && dist !== 'Unknown' && dist !== 'غير معروف') {
                val = dist;
            }
        }

        if (!val && mapRules?.defaultValue) val = mapRules.defaultValue;

        // Clean numeric and ZONE target fields (ZONE leading zeros are removed)
        if (val && (isNumericTargetField(field) || isZoneField(field))) {
          val = isZoneField(field) ? cleanZoneValue(val) : extractNumbersOnly(val);
        }

        newAttrs[field] = val;
      });

      if (retainUnmapped) {
        if (p.attributes) {
            Object.keys(p.attributes).forEach(k => {
                if (!mappedSourceFields.has(k) && !unselectedTemplateFields.has(k)) {
                    let rawV = String(p.attributes[k] || '');
                    if (rawV && (isNumericTargetField(k) || isZoneField(k))) {
                        rawV = isZoneField(k) ? cleanZoneValue(rawV) : extractNumbersOnly(rawV);
                    }
                    newAttrs[k] = rawV;
                }
            });
        }
        if (p.originalRow && headers) {
            headers.forEach((h, i) => {
                if (!mappedSourceFields.has(h) && !unselectedTemplateFields.has(h) && p.originalRow![i] !== undefined && p.originalRow![i] !== null) {
                    let rawV = String(p.originalRow![i]);
                    if (rawV && (isNumericTargetField(h) || isZoneField(h))) {
                        rawV = isZoneField(h) ? cleanZoneValue(rawV) : extractNumbersOnly(rawV);
                    }
                    newAttrs[h] = rawV;
                }
            });
        }
      }

      let newId = p.layer || TEMPLATES[targetTemplate].name || p.id;
      let foundName = false;
      if (nameSourceField) {
         if (nameSourceField === 'الشارع (مسترجع)') {
             if (p.street) { newId = String(p.street); foundName = true; }
         } else if (nameSourceField === 'الحي (مسترجع)') {
             if (p.district) { newId = String(p.district); foundName = true; }
         } else if (newAttrs[nameSourceField] !== undefined && newAttrs[nameSourceField] !== '') {
             newId = String(newAttrs[nameSourceField]);
             foundName = true;
         } else if (p.attributes) {
             const matchedKey = Object.keys(p.attributes).find(k => String(k || '').toLowerCase() === String(nameSourceField || '').toLowerCase());
             if (matchedKey && p.attributes[matchedKey]) {
                 newId = String(p.attributes[matchedKey]);
                 foundName = true;
             }
         }
         
         if (!foundName && p.originalRow && headers && nameSourceField) {
             const matchedIndex = headers.findIndex(h => String(h || '').toLowerCase() === String(nameSourceField || '').toLowerCase());
             if (matchedIndex !== -1 && p.originalRow[matchedIndex]) {
                 newId = String(p.originalRow[matchedIndex]);
                 foundName = true;
             }
         }

         if (!foundName) {
             // If selected nameSourceField yields no value, fallback to the field name itself or the layer name
             newId = p.layer || nameSourceField || TEMPLATES[targetTemplate].name || p.id;
         }
      }

      // Format element name as "Zone <Number>" when targetTemplate is polygons or when nameSourceField is a zone field
      if (targetTemplate === 'polygons' || (nameSourceField && isZoneField(nameSourceField))) {
         let valToFormat = newId;
         if (!foundName || !nameSourceField) {
            valToFormat = newAttrs['ZONE'] || p.attributes?.['ZONE'] || p.attributes?.['zone_nu'] || p.attributes?.['zone'] || p.attributes?.['منطقة'] || p.id;
         }
         if (valToFormat) {
            const cleaned = cleanZoneValue(valToFormat);
            if (cleaned) {
                const numOnly = extractNumbersOnly(cleaned);
                if (numOnly) {
                    newId = `Zone ${numOnly}`;
                } else if (/^zone\s*/i.test(cleaned)) {
                    newId = cleaned.replace(/^zone\s*/i, 'Zone ');
                } else {
                    newId = `Zone ${cleaned}`;
                }
            } else if (String(valToFormat).trim()) {
                const strVal = String(valToFormat).trim();
                const numInStr = extractNumbersOnly(strVal);
                newId = numInStr ? `Zone ${numInStr}` : (strVal.startsWith('Zone ') ? strVal : `Zone ${strVal}`);
            }
         }
      }

      let finalColor = p.color;
      if (standardizeColors) {
         finalColor = matchStatusByColor(p.color || '#3b82f6').color;
      } else if (standardizePolygonColors && (p.type === 'Polygon' || targetTemplate === 'polygons' || targetTemplate === 'boundaries')) {
         finalColor = '#0288d1';
      }

      return { ...p, id: newId, color: finalColor, attributes: newAttrs, description: undefined, layer: keepFolders ? p.layer : undefined };
    });

    if (overlapResults) {
        overlapResults.forEach((o, i) => {
            if (o.isIntersection && o.intersectionPoint) {
                processedPoints.push({
                    id: `Intersection_${i}`,
                    x: o.intersectionPoint.x,
                    y: o.intersectionPoint.y,
                    type: 'Point',
                    color: '#9c27b0',
                    layer: 'Intersections',
                    attributes: {
                        'Description': `Intersection between ${o.id1} and ${o.id2}`,
                        'Type': 'Intersection'
                    }
                });
            }
        });
    }
    
    return { processedPoints, templateFields };
  };

  const getBaseFilename = () => {
    const prefix = networkType === 'water' ? 'Water' : 'Wastewater';
    const suffix = targetTemplate === 'all' ? 'All_Layers' : targetTemplate === 'pipes' ? 'Lines' : targetTemplate === 'points' ? 'Points' : targetTemplate === 'stations' ? 'Stations' : targetTemplate === 'boundaries' ? 'Boundaries' : targetTemplate === 'grids' ? 'Grids' : targetTemplate === 'violations' ? 'Violations' : targetTemplate === 'stowage_sites' ? 'StowageSites' : 'Polygons';
    return `${prefix}_${suffix}_Formatted`;
  };

  const wrapLoading = async (msg: string, task: () => void | Promise<void>) => {
    if (isExecutingRef.current) {
      if (setGlobalStatus) setGlobalStatus(msg);
      await task();
      return;
    }
    if (runWithLoading) {
      await runWithLoading(msg, task);
    } else if (setGlobalLoading) {
      setGlobalLoading(true);
      if (setGlobalStatus) setGlobalStatus(msg);
      if (setGlobalProgress) setGlobalProgress(10);
      try {
        await new Promise(r => setTimeout(r, 60));
        await task();
        if (setGlobalProgress) setGlobalProgress(100);
      } finally {
        setGlobalLoading(false);
        if (setGlobalProgress) setGlobalProgress(null);
      }
    } else {
      await task();
    }
  };

  const handleApplyExportKMZ = async (pts?: GeoPoint[]) => {
    await wrapLoading(
      lang === 'ar' ? 'جاري تنسيق وتصدير ملف KMZ...' : 'Formatting and exporting KMZ...',
      async () => {
        try {
          const { processedPoints, templateFields } = getProcessedPoints(pts);
          await downloadKMZ(processedPoints, getBaseFilename(), { 
            mode: keepFolders ? 'layer' : 'none', 
            groupByAttribute: keepFolders ? 'layer' : undefined,
            optimizeForMyMaps: optimizeForMyMaps,
            keepOriginalDescription: keepOriginalDescription,
            removeImagesOnly: removeImagesOnly,
            standardizeColors: standardizeColors,
            lineStyle: { width: 3 },
            ...((targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? {
                polygonStyle: {
                    ...(standardizePolygonColors ? { colorHex: '#0288d1', opacityHex: '4d' } : {}),
                    ...(optimizeForMyMaps || standardizePolygonColors ? { outline: 0, width: 0 } : {})
                }
            } : {})
        }, templateFields, templateFields);
          setSuccessMessage("تم تصدير ملف KMZ بنجاح!");
        } catch (e: any) { setActionError("Error exporting KMZ: " + e.message); console.error(e); }
      }
    );
  };

  const handleApplyExportDXF = async (pts?: GeoPoint[]) => {
    await wrapLoading(
      lang === 'ar' ? 'جاري تحويل وتصدير ملف DXF...' : 'Converting and exporting DXF...',
      async () => {
        try {
          const { processedPoints } = getProcessedPoints(pts);
          await downloadDXF(processedPoints, getBaseFilename());
          setSuccessMessage("تم تصدير ملف DXF بنجاح!");
        } catch (e: any) { setActionError("Error exporting DXF: " + e.message); console.error(e); }
      }
    );
  };

  const handleApplyExportShapefile = async (pts?: GeoPoint[]) => {
    await wrapLoading(
      lang === 'ar' ? 'جاري ضغط وتصدير ملف الشيب فايل (SHP)...' : 'Packaging and exporting Shapefile (SHP)...',
      async () => {
        try {
          const { processedPoints } = getProcessedPoints(pts);
          await downloadShapefile(processedPoints, getBaseFilename());
          setSuccessMessage(lang === 'ar' ? "تم تصدير ملف الشيب فايل (SHP) بنجاح!" : "Shapefile exported successfully!");
        } catch (e: any) { setActionError("Error exporting Shapefile: " + e.message); console.error(e); }
      }
    );
  };

  const handleApplyExportPDF = async (pts?: GeoPoint[]) => {
    await wrapLoading(
      lang === 'ar' ? 'جاري توليد تقرير PDF المنسق...' : 'Generating formatted PDF report...',
      async () => {
        try {
          const { processedPoints } = getProcessedPoints(pts);
          await downloadDataPDF(processedPoints, getBaseFilename(), lang);
        } catch (e: any) { setActionError("Error exporting PDF: " + e.message); console.error(e); }
      }
    );
  };

  const handleApplyExportExcel = async (pts?: GeoPoint[]) => {
    await wrapLoading(
      lang === 'ar' ? 'جاري بناء وجدولة ملف Excel المنسق...' : 'Structuring formatted Excel file...',
      async () => {
        try {
          const { processedPoints, templateFields } = getProcessedPoints(pts);
          const data = processedPoints.map(p => {
            const startX = (p.path && p.path.length > 0) ? p.path[0].x : p.x;
            const startY = (p.path && p.path.length > 0) ? p.path[0].y : p.y;
            const endX = (p.path && p.path.length > 0) ? p.path[p.path.length - 1].x : p.x;
            const endY = (p.path && p.path.length > 0) ? p.path[p.path.length - 1].y : p.y;

            const row: any = {
              ID: p.id,
              Type: p.type,
              Layer: p.layer || '',
              X: p.x,
              Y: p.y,
              Start_X: startX,
              Start_Y: startY,
              End_X: endX,
              End_Y: endY
            };
            
            const extracted = extractAllPointAttributes(p);
            templateFields.forEach(f => {
                let val = extracted[f] || (p.attributes ? p.attributes[f] : '') || '';
                const fUpper = f.toUpperCase();
                if (fUpper === 'PROJECTID' || fUpper === 'PROJECT_ID' || fUpper === 'PROJECT ID' || f === 'رقم المشروع') {
                    val = formatProjectIdForExcel(val);
                }
                row[f] = val;
            });

            // Also add any extra extracted attributes not in templateFields
            Object.entries(extracted).forEach(([k, v]) => {
                if (row[k] === undefined) {
                    const kUpper = k.toUpperCase();
                    row[k] = (kUpper === 'PROJECTID' || kUpper === 'PROJECT_ID' || kUpper === 'PROJECT ID' || k === 'رقم المشروع') ? formatProjectIdForExcel(v) : v;
                }
            });

            if (p.description) {
                const parsed = parseDescriptionToAttributes(p.description);
                if (Object.keys(parsed).length === 0) {
                    row['Description'] = stripHtml(p.description);
                }
            }

            return row;
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Formatted_Data");
        XLSX.writeFile(wb, `${getBaseFilename()}.xlsx`);
        setSuccessMessage(lang === 'ar' ? "تم تصدير ملف الإكسل بنجاح!" : "Excel exported successfully!");
      } catch (e: any) { setActionError("Error exporting Excel: " + e.message); console.error(e); }
    }
    );
  };


  const executeAction = async (action: (overridePoints?: GeoPoint[]) => void | Promise<void>) => {
    if (isExecutingRef.current) return;
    if (!points || points.length === 0) {
      setActionError(lang === 'ar' ? 'لا توجد عناصر مجهزة لتنسيقها أو تصديرها. يرجى رفع ملف أو اختيار طبقة بيانات أولاً.' : 'No data points available.');
      return;
    }

    isExecutingRef.current = true;
    setIsExecuting(true);
    setActionError(null);
    setSuccessMessage(null);

    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalProgress) setGlobalProgress(15);
    if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'جاري تجهيز وتنسيق البيانات...' : 'Preparing formatted data...');

    try {
      let updatedPoints = points;
      if (autoFetchStreets && fetchStreets) {
        if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'جاري جلب أسماء الشوارع والأحياء من الخريطة...' : 'Fetching street and district names from map...');
        if (setGlobalProgress) setGlobalProgress(25);
        updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'], undefined, true);
      }
      if (setGlobalProgress) setGlobalProgress(80);
      if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'جاري إنشاء وتصدير الملف النهائي...' : 'Generating final export file...');
      
      await action(updatedPoints);
      
      if (setGlobalProgress) setGlobalProgress(100);
      if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'تمت العملية وتنزيل الملف بنجاح! 🗺️' : 'Completed and downloaded successfully! 🗺️');
      await new Promise(r => setTimeout(r, 400));
    } catch (err: any) {
      console.error("Export Action Error:", err);
      setActionError((lang === 'ar' ? "حدث خطأ أثناء التصدير: " : "Export error: ") + (err?.message || String(err)));
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setGlobalProgress) setGlobalProgress(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {actionError && <div className="p-4 bg-red-500/20 border border-red-500 rounded-2xl text-red-100 font-bold mb-4">{actionError}</div>}
      {successMessage && <div className="p-4 bg-green-500/20 border border-green-500 rounded-2xl text-green-100 font-bold mb-4">{successMessage}</div>}
      {isExecuting && !setGlobalLoading && <ProcessingModal lang={lang} />}
      <div className="p-8 bg-[#0b2d3d]/40 rounded-[3rem] border border-white/10 shadow-2xl text-center space-y-4">
        <Database className="w-16 h-16 text-accent mx-auto" />
        <h2 className="text-white font-black text-xl">{lang === 'ar' ? 'تنسيق البيانات للمشاريع' : 'Project Data Formatter'}</h2>
        <p className="text-[10px] text-white/50 leading-relaxed font-bold uppercase">{lang === 'ar' ? 'ترتيب وتنسيق الحقول لشبكات المياه والصرف' : 'Organize and format fields for Water/Wastewater'}</p>
      </div>

      {points.length === 0 ? (
        <div className="text-center p-8 bg-white/5 rounded-3xl border border-white/5">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/60">{lang === 'ar' ? 'يرجى تحميل ملف به بيانات لتنسيقه.' : 'Please upload a file with data to format.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[10px] text-white/40 uppercase font-black mb-2 block">{lang === 'ar' ? 'نوع الشبكة' : 'Network Type'}</label>
              <div className="flex gap-2">
                <button onClick={() => setNetworkType('water')} className={cn("flex-1 py-3 rounded-xl font-black text-xs transition-all", networkType === 'water' ? "bg-blue-500 text-white" : "bg-white/10 text-white/50 hover:bg-white/20")}>{lang === 'ar' ? 'مياه (Water)' : 'Water'}</button>
                <button onClick={() => setNetworkType('wastewater')} className={cn("flex-1 py-3 rounded-xl font-black text-xs transition-all", networkType === 'wastewater' ? "bg-orange-600 text-white" : "bg-white/10 text-white/50 hover:bg-white/20")}>{lang === 'ar' ? 'صرف صحي (Wastewater)' : 'Wastewater'}</button>
              </div>
            </div>
            
            <div className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[10px] text-white/40 uppercase font-black mb-2 block">{lang === 'ar' ? 'نوع العناصر (القالب)' : 'Element Type (Template)'}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'all', label: TEMPLATES.all.name },
                  { id: 'pipes', label: TEMPLATES.pipes.name },
                  { id: 'points', label: TEMPLATES.points.name },
                  { id: 'stations', label: TEMPLATES.stations.name },
                  { id: 'polygons', label: TEMPLATES.polygons.name },
                  { id: 'boundaries', label: TEMPLATES.boundaries.name },
                  { id: 'violations', label: TEMPLATES.violations.name },
                  { id: 'grids', label: TEMPLATES.grids.name },
                  { id: 'stowage_sites', label: TEMPLATES.stowage_sites.name },
                ].map((tItem) => (
                  <button
                    key={tItem.id}
                    type="button"
                    onClick={() => setTargetTemplate(tItem.id as any)}
                    className={cn(
                      "py-2.5 px-2 rounded-xl font-black text-[11px] leading-tight transition-all text-center flex items-center justify-center min-h-[44px] break-words",
                      targetTemplate === tItem.id ? "bg-accent text-primary shadow-lg" : "bg-white/10 text-white/70 hover:bg-white/20",
                      (tItem.id === 'all' || tItem.id === 'grids') && "col-span-2"
                    )}
                  >
                    {tItem.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'تصدير المجلدات كما في الملف المصدر (الطبقات الأصلية)' : 'Export Folders As in Source File (Original Layers)'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم الحفاظ على بنية المجلدات والطبقات الأصلية كاملة عند التصدير كما في الملف المصدر.' : 'When enabled, the complete original folder structure (layers) will be preserved on export as in the source file.'}</p>
            </div>
            <button 
              type="button"
              onClick={() => setKeepFolders(!keepFolders)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative shrink-0 flex items-center px-1",
                keepFolders ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                keepFolders 
                  ? (lang === 'ar' ? "translate-x-0" : "translate-x-6") 
                  : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بالحقول غير المطابقة' : 'Keep Unmapped Fields'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم إضافة الحقول الأصلية التي لم يتم تعيينها إلى البيانات المصدرة.' : 'When enabled, original fields that were not mapped will be added to the exported data.'}</p>
            </div>
            <button 
              type="button"
              onClick={() => setRetainUnmapped(!retainUnmapped)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative shrink-0 flex items-center px-1",
                retainUnmapped ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                retainUnmapped 
                  ? (lang === 'ar' ? "translate-x-0" : "translate-x-6") 
                  : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-white font-black text-sm flex items-center gap-2">
                  <span>{lang === 'ar' ? 'جلب أسماء الشوارع والأحياء' : 'Fetch Streets & Districts'}</span>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold border transition-all",
                    currentGeocodingMode === 'accurate' 
                      ? "text-accent bg-accent/10 border-accent/20" 
                      : "text-blue-300 bg-blue-500/10 border-blue-500/20"
                  )}>
                    {currentGeocodingMode === 'accurate'
                      ? (lang === 'ar' ? '🎯 دقيق جداً (هندسي)' : '🎯 Accurate (Geometric)')
                      : (lang === 'ar' ? '⚡ بحث عام (سريع)' : '⚡ Fast General Search')}
                  </span>
                </h4>
                <p className="text-white/50 text-[10px] mt-1">
                  {lang === 'ar' 
                    ? 'جلب أسماء الشوارع والأحياء تلقائياً وإضافتها لحقلي STREETNAME و DISTRICT.' 
                    : 'Automatically fetch street and district names for STREETNAME & DISTRICT fields.'}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setAutoFetchStreets(!autoFetchStreets)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative shrink-0 flex items-center px-1",
                  autoFetchStreets ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                  autoFetchStreets 
                    ? (lang === 'ar' ? "translate-x-0" : "translate-x-6") 
                    : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
                )} />
              </button>
            </div>

            <div className="pt-2 border-t border-white/5 space-y-2">
              <label className="text-[10px] font-bold text-white/70 block">
                {lang === 'ar' ? 'اختر نمط دقة الجلب:' : 'Select Geocoding Mode:'}
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-black/30 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setGeocodingMode ? setGeocodingMode('accurate') : setLocalGeocodingMode('accurate')}
                  className={cn(
                    "py-2 px-2.5 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5",
                    currentGeocodingMode === 'accurate'
                      ? "bg-accent text-primary shadow-lg"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? '🎯 دقيق جداً (هندسي)' : '🎯 Accurate'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGeocodingMode ? setGeocodingMode('fast') : setLocalGeocodingMode('fast')}
                  className={cn(
                    "py-2 px-2.5 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5",
                    currentGeocodingMode === 'fast'
                      ? "bg-blue-500 text-white shadow-lg"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? '⚡ بحث عام (سريع)' : '⚡ Fast Search'}</span>
                </button>
              </div>
              <p className="text-[9px] text-white/50 leading-relaxed px-1">
                {currentGeocodingMode === 'accurate'
                  ? (lang === 'ar' ? '🎯 حساب هندسي متقدم لأقرب مسار طريق لإعطاء نتائج دقيقة جداً.' : '🎯 Advanced geometry-based calculation for exact nearest road.')
                  : (lang === 'ar' ? '⚡ بحث عام سريع ومباشر لتوفير الوقت مع كميات البيانات الكبيرة.' : '⚡ Fast general search lookup to save time on large datasets.')}
              </p>

              {fetchStreets && (
                <button
                  type="button"
                  disabled={isExecuting}
                  onClick={async () => {
                    if (isExecutingRef.current) return;
                    if (!points || points.length === 0) {
                      setActionError(lang === 'ar' ? 'لا توجد عناصر مجهزة لجلب الشوارع. يرجى رفع ملف أو اختيار طبقة أولاً.' : 'No elements available.');
                      return;
                    }
                    isExecutingRef.current = true;
                    setIsExecuting(true);
                    setActionError(null);
                    setSuccessMessage(null);
                    try {
                      await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'], undefined, true);
                      setSuccessMessage(lang === 'ar' ? 'تم جلب وتحديث أسماء الشوارع والأحياء بنجاح! 🗺️' : 'Streets and districts fetched successfully! 🗺️');
                    } catch (e: any) {
                      setActionError((lang === 'ar' ? 'حدث خطأ أثناء جلب الشوارع: ' : 'Error fetching streets: ') + (e?.message || String(e)));
                    } finally {
                      isExecutingRef.current = false;
                      setIsExecuting(false);
                    }
                  }}
                  className="w-full mt-2 py-2.5 px-3 bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExecuting ? (
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  ) : (
                    <CloudDownload className="w-4 h-4 text-accent animate-pulse" />
                  )}
                  <span>{lang === 'ar' ? 'تشغيل جلب أسماء الشوارع والأحياء الآن 🗺️' : 'Fetch Streets & Districts Now 🗺️'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'تحسين لخرائط Google My Maps' : 'Optimize for Google My Maps'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'إزالة جدول الوصف لمنع تكرار البيانات في لوحة My Maps.' : 'Remove description table to prevent duplication in My Maps panel.'}</p>
            </div>
            <button 
              onClick={() => setOptimizeForMyMaps(!optimizeForMyMaps)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                optimizeForMyMaps ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                optimizeForMyMaps ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بالبيانات الأصلية والصور' : 'Retain Original Data & Images'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'استخدام الوصف والمظهر الأصليين والوسائط من الملف المصدر مباشرة.' : 'Use original description, styling, and media directly from the source file.'}</p>
            </div>
            <button 
              onClick={() => setKeepOriginalDescription(!keepOriginalDescription)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                keepOriginalDescription ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                keepOriginalDescription ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'إزالة الصور فقط' : 'Remove Images Only'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'حذف جميع الصور والوسائط من داخل منطاد الوصف في ملف KML مع بقاء سائر التفاصيل.' : 'Delete all images and media from inside the description balloon in the KML file while keeping other details.'}</p>
            </div>
            <button 
              onClick={() => setRemoveImagesOnly(!removeImagesOnly)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                removeImagesOnly ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                removeImagesOnly ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'توحيد ألوان المشروع' : 'Standardize Project Colors'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'تحويل جميع الألوان إلى الدرجات القياسية (أزرق، أخضر، أصفر، أحمر) بناءً على أقرب لون.' : 'Convert all colors to standard shades (blue, green, yellow, red) based on the closest match.'}</p>
            </div>
            <button 
              onClick={() => setStandardizeColors(!standardizeColors)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                standardizeColors ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                standardizeColors ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

                    {(targetTemplate === 'grids') && (
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بشكل والوان الملف المرفوع' : 'Keep Original Shape and Colors'}</h4>
                <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم الحفاظ على نوع وشكل العنصر ولونه الأصلي كما هو في الملف المرفوع.' : 'When enabled, the original shape, type, and color of the element will be kept as in the uploaded file.'}</p>
              </div>
              <button 
                onClick={() => setKeepOriginalGridStyle(!keepOriginalGridStyle)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  keepOriginalGridStyle ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                  keepOriginalGridStyle ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                )} />
              </button>
            </div>
          )}

          {(targetTemplate === 'polygons' || targetTemplate === 'boundaries') && (
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'توحيد ألوان النطاقات' : 'Standardize Polygon Colors'}</h4>
                <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'توحيد لون العناصر إلى اللون الأزرق (#0288d1) بدرجة شفافية 30% وإلغاء عرض الحدود.' : 'Standardize the color of elements to Blue (#0288d1) with 30% opacity and no border.'}</p>
              </div>
              <button 
                onClick={() => setStandardizePolygonColors(!standardizePolygonColors)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  standardizePolygonColors ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                  standardizePolygonColors ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                )} />
              </button>
            </div>
          )}

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'مصدر اسم العنصر (اختياري)' : 'Element Name Source (Optional)'}</h4>
              <p className="text-white/50 text-[10px] mt-1">
                {lang === 'ar' 
                  ? (targetTemplate === 'polygons' ? 'في تنظيم النطاقات، يتم تنسيق اسم العنصر تلقائياً كـ (Zone 1, Zone 2, Zone 3...) بالاعتماد على رقم النطاق المستخرج.' : 'اختر حقلاً ليكون هو اسم العنصر الذي يظهر على الخريطة.') 
                  : (targetTemplate === 'polygons' ? 'For Polygons, element names are automatically formatted as Zone 1, Zone 2, Zone 3... based on the extracted zone number.' : 'Choose a field to be used as the element name shown on the map.')}
              </p>
            </div>
            <select
              value={nameSourceField}
              onChange={(e) => setNameSourceField(e.target.value)}
              className="w-full md:w-1/3 bg-[#0e3f53] text-white text-xs p-3 rounded-xl outline-none border border-white/10"
            >
              <option value="">{lang === 'ar' ? 'الاسم الافتراضي' : 'Default Name'}</option>
              <optgroup label={lang === 'ar' ? 'الحقول المصدرية' : 'Source Fields'}>
                {sourceAttributes.map((attr, attrIdx) => (
                  <option key={`src-attr-${attr.name}-${attrIdx}`} value={attr.name}>{attr.name}</option>
                ))}
              </optgroup>
              <optgroup label={lang === 'ar' ? 'حقول القالب' : 'Template Fields'}>
                {TEMPLATES[targetTemplate].fields.map((field, fIdx) => (
                  <option key={`tmpl-field-${field}-${fIdx}`} value={field}>{field}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'مطابقة الحقول (Field Mapping)' : 'Field Mapping'}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedFields(prev => ({
                      ...prev,
                      [targetTemplate]: [...TEMPLATES[targetTemplate].fields]
                    }));
                  }}
                  className="text-[10px] bg-white/10 hover:bg-white/20 text-white font-black px-3 py-1.5 rounded-lg transition-colors"
                >
                  {lang === 'ar' ? 'تحديد الكل' : 'Select All'}
                </button>
                <button
                  onClick={() => {
                    setSelectedFields(prev => ({
                      ...prev,
                      [targetTemplate]: []
                    }));
                  }}
                  className="text-[10px] bg-white/10 hover:bg-white/20 text-white font-black px-3 py-1.5 rounded-lg transition-colors"
                >
                  {lang === 'ar' ? 'إلغاء التحديد' : 'Deselect All'}
                </button>
              </div>
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {TEMPLATES[targetTemplate].fields.map((field, fIdx) => {
                const isSelected = selectedFields[targetTemplate]?.includes(field) ?? false;
                return (
                <div key={`mapping-field-${field}-${fIdx}`} className={cn("flex flex-col md:flex-row items-center gap-3 p-3 rounded-xl transition-all", isSelected ? "bg-black/20" : "bg-black/10 opacity-50")}>
                  <div className="w-full md:w-1/3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFields(prev => ({
                          ...prev,
                          [targetTemplate]: isSelected 
                            ? (prev[targetTemplate] || []).filter(f => f !== field)
                            : [...(prev[targetTemplate] || []), field]
                        }));
                      }}
                      className={cn(
                        "w-4 h-4 rounded flex items-center justify-center transition-all flex-shrink-0",
                        isSelected ? "bg-accent text-primary" : "border border-white/20 text-transparent"
                      )}
                    >
                      <Check className="w-3 h-3 stroke-[3px]" />
                    </button>
                    <span className="text-xs font-black text-accent flex items-center gap-1.5 flex-wrap">
                      <span>{field}</span>
                      {isNumericTargetField(field) && (
                        <span className="text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                          {lang === 'ar' ? '🔢 أرقام فقط' : '🔢 Numbers Only'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="w-full md:w-1/3">
                    <MultiSourceFieldSelect
                      selectedFields={
                        mapping[field]?.sourceFields && mapping[field]!.sourceFields!.length > 0
                          ? mapping[field]!.sourceFields!
                          : (mapping[field]?.sourceField ? [mapping[field]!.sourceField!] : [])
                      }
                      onChange={(selected) => {
                        setMapping(prev => ({
                          ...prev,
                          [field]: {
                            ...prev[field],
                            sourceFields: selected,
                            sourceField: selected[0] || ''
                          }
                        }));
                      }}
                      sourceAttributes={sourceAttributes}
                      lang={lang}
                    />
                  </div>
                  <div className="w-full md:w-1/3">
                    <input 
                      type="text" 
                      placeholder={lang === 'ar' ? 'القيمة الافتراضية (أو النقاط)..' : 'Default value (or dots)..'}
                      value={mapping[field]?.defaultValue || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field]: { ...prev[field], defaultValue: e.target.value } }))}
                      className="w-full bg-[#0e3f53] border border-white/10 rounded-lg px-3 py-2 text-[10px] font-bold text-white focus:outline-none focus:border-accent placeholder-white/20"
                    />
                  </div>
                </div>
              )})}
            </div>
          </div>

          
          
          {onVerifyYellowMissing && (
            <button onClick={onVerifyYellowMissing} className="w-full bg-[#3d330b] border-2 border-[#FFE600]/80 text-[#FFF275] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-2xl hover:bg-[#FFE600] hover:text-black transition-all text-sm group mt-6 scale-[1.01] hover:scale-[1.02]">
                <AlertOctagon className="w-5 h-5 group-hover:scale-110 transition-transform text-[#FFE600] group-hover:text-black animate-pulse" />
                {lang === 'ar' ? 'فحص الخطوط الصفراء فقط بدون (Permit No / segment id)' : 'Audit Yellow Lines Only (Missing Permit / Segment ID)'}
            </button>
          )}
          {onVerifyMissingAttributes && (
            <button onClick={onVerifyMissingAttributes} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group mt-3">
                <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                {lang === 'ar' ? 'فحص رقم المنطقة او القطر' : 'Audit Zone Number or Diameter'}
            </button>
          )}
          {onVerifyDataSyntaxErrors && (
            <button onClick={onVerifyDataSyntaxErrors} className="w-full bg-[#3d0b28] border-2 border-[#ff0077]/70 text-[#ffb3d9] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-2xl hover:bg-[#ff0077] hover:text-white transition-all text-sm group mt-3 scale-[1.01] hover:scale-[1.02]">
                <AlertCircle className="w-5 h-5 group-hover:scale-110 transition-transform text-[#ff0077] group-hover:text-white animate-pulse" />
                {lang === 'ar' ? 'فحص أخطاء إدخال البيانات (Permit No أرقام فقط / Segment ID بدون -)' : 'Audit Data Syntax Errors (Permit No digits only / Segment ID leading -)'}
            </button>
          )}
          {onVerifyPermitSegment && (
            <button onClick={onVerifyPermitSegment} className="w-full bg-[#2a0b3d] border border-[#9000FF]/50 text-[#d8b4fe] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#9000FF] hover:text-white transition-all text-sm group mt-3">
                <Layers className="w-5 h-5 group-hover:scale-110 transition-transform text-[#9000FF] group-hover:text-white" />
                {lang === 'ar' ? 'فحص عناصر (segment id) بنفسجي' : 'Highlight segment id (Vivid Purple)'}
            </button>
          )}
          {onVerifyPermitNo && (
            <button onClick={onVerifyPermitNo} className="w-full bg-[#3d1e0b] border border-[#FF6D00]/50 text-[#ffc499] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FF6D00] hover:text-white transition-all text-sm group mt-3">
                <FileText className="w-5 h-5 group-hover:scale-110 transition-transform text-[#FF6D00] group-hover:text-white" />
                {lang === 'ar' ? 'فحص رقم الترخيص (Permit No) برتقالي' : 'Highlight Permit No (Neon Orange)'}
            </button>
          )}
          {onVerifySbc && (
            <button onClick={onVerifySbc} className="w-full bg-[#0b281d] border border-emerald-500/50 text-emerald-300 font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-2xl hover:bg-emerald-500 hover:text-black transition-all text-sm group mt-3">
                <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform text-emerald-400 group-hover:text-black" />
                {lang === 'ar' ? 'فحص مطابقة كود البناء السعودي (SBC - تحت التطوير)' : 'Saudi Building Code (SBC) Compliance Audit (In Dev)'}
            </button>
          )}

          <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-white/10">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-accent/10 rounded-2xl border border-accent/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/20 rounded-full">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div className="text-right sm:text-left">
                  <h4 className="text-white text-sm font-black">{lang === 'ar' ? 'وضع التصدير السريع' : 'Fast Export Mode'}</h4>
                  <p className="text-white/50 text-[10px] mt-0.5">
                    {lang === 'ar' 
                      ? 'تخطي جلب أسماء الشوارع لتسريع عملية التصدير بشكل كبير' 
                      : 'Skip fetching street names to speed up the export process significantly'}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={(e) => { e.preventDefault(); setAutoFetchStreets(prev => !prev); }}
                className={cn(
                  "relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75",
                  !autoFetchStreets ? "bg-accent" : "bg-white/20"
                )}
              >
                <span className="sr-only">Toggle fast export</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    !autoFetchStreets 
                      ? (lang === 'ar' ? "-translate-x-1" : "translate-x-6")
                      : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
                  )}
                />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-4">
            <button disabled={isExecuting} onClick={() => executeAction(handleApplyExportKMZ)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner disabled:opacity-50 disabled:cursor-not-allowed">
              {isExecuting ? <Loader2 className="w-5 h-5 text-blue-400 animate-spin" /> : <CloudDownload className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />}
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'KMZ' : 'KMZ'}</span>
            </button>
            <button disabled={isExecuting} onClick={() => executeAction(handleApplyExportShapefile)} className="bg-emerald-950/80 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner disabled:opacity-50 disabled:cursor-not-allowed">
              {isExecuting ? <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" /> : <FolderArchive className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />}
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'شيب فايل (SHP)' : 'Shapefile (SHP)'}</span>
            </button>
            <button disabled={isExecuting} onClick={() => executeAction(handleApplyExportDXF)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner disabled:opacity-50 disabled:cursor-not-allowed">
              {isExecuting ? <Loader2 className="w-5 h-5 text-orange-400 animate-spin" /> : <PenTool className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />}
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'DXF' : 'DXF'}</span>
            </button>
            <button disabled={isExecuting} onClick={() => executeAction(handleApplyExportExcel)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner disabled:opacity-50 disabled:cursor-not-allowed">
              {isExecuting ? <Loader2 className="w-5 h-5 text-[#2ecc71] animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-[#2ecc71] group-hover:scale-110 transition-transform" />}
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'إكسل' : 'Excel'}</span>
            </button>
            <button disabled={isExecuting} onClick={() => executeAction(handleApplyExportPDF)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner disabled:opacity-50 disabled:cursor-not-allowed">
              {isExecuting ? <Loader2 className="w-5 h-5 text-[#D32F2F] animate-spin" /> : <FileText className="w-5 h-5 text-[#D32F2F] group-hover:scale-110 transition-transform" />}
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'PDF' : 'PDF'}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
