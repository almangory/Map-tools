import React from 'react';
import { 
  Compass, 
  MapPin, 
  Building2, 
  Landmark, 
  Sparkles, 
  Target, 
  Zap, 
  Layers, 
  Check, 
  ChevronRight,
  ArrowDownCircle,
  Loader2
} from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { 
  return twMerge(clsx(inputs)); 
}

export interface GeocodingHierarchyOptions {
  includeGovernorate: boolean;
  includeCity: boolean;
  includeDistrict: boolean;
  includeStreet: boolean;
  placeBeforeDistrictStreet: boolean;
}

export interface GeocodingHierarchySelectorProps {
  options: GeocodingHierarchyOptions;
  onChangeOptions: (opts: GeocodingHierarchyOptions) => void;
  geocodingMode: 'accurate' | 'fast';
  setGeocodingMode?: (mode: 'accurate' | 'fast') => void;
  onExecuteFetch?: () => void;
  isLoading?: boolean;
  itemCount?: number;
  lang: 'ar' | 'en';
  showExecuteButton?: boolean;
  className?: string;
}

export const GeocodingHierarchySelector: React.FC<GeocodingHierarchySelectorProps> = ({
  options,
  onChangeOptions,
  geocodingMode,
  setGeocodingMode,
  onExecuteFetch,
  isLoading = false,
  itemCount = 0,
  lang,
  showExecuteButton = true,
  className
}) => {
  const {
    includeGovernorate,
    includeCity,
    includeDistrict,
    includeStreet,
    placeBeforeDistrictStreet
  } = options;

  const handleToggle = (field: keyof GeocodingHierarchyOptions) => {
    onChangeOptions({
      ...options,
      [field]: !options[field]
    });
  };

  const applyPreset = (preset: 'gov-city-before-district-street' | 'all' | 'gov-city-only' | 'city-district-street' | 'district-street') => {
    switch (preset) {
      case 'gov-city-before-district-street':
      case 'all':
        onChangeOptions({
          includeGovernorate: true,
          includeCity: true,
          includeDistrict: true,
          includeStreet: true,
          placeBeforeDistrictStreet: true
        });
        break;
      case 'gov-city-only':
        onChangeOptions({
          includeGovernorate: true,
          includeCity: true,
          includeDistrict: false,
          includeStreet: false,
          placeBeforeDistrictStreet: true
        });
        break;
      case 'city-district-street':
        onChangeOptions({
          includeGovernorate: false,
          includeCity: true,
          includeDistrict: true,
          includeStreet: true,
          placeBeforeDistrictStreet: true
        });
        break;
      case 'district-street':
        onChangeOptions({
          includeGovernorate: false,
          includeCity: false,
          includeDistrict: true,
          includeStreet: true,
          placeBeforeDistrictStreet: false
        });
        break;
    }
  };

  // Build breadcrumb preview of active hierarchy
  const hierarchySteps = [
    includeGovernorate ? (lang === 'ar' ? 'المحافظة' : 'Governorate') : null,
    includeCity ? (lang === 'ar' ? 'المدينة' : 'City') : null,
    includeDistrict ? (lang === 'ar' ? 'الحي' : 'District') : null,
    includeStreet ? (lang === 'ar' ? 'الشارع' : 'Street') : null
  ].filter(Boolean);

  return (
    <div className={cn("bg-[#0e3f53]/70 p-5 rounded-3xl border border-white/10 shadow-xl space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>{lang === 'ar' ? 'جلب العنونة الجغرافية الهرمية' : 'Geographical Hierarchy Geocoding'}</span>
            </h4>
            <p className="text-[10px] text-white/50 font-bold mt-0.5">
              {lang === 'ar'
                ? 'إمكانية جلب المحافظة أو المدينة وترتيبها قبل الحي والشارع'
                : 'Fetch Governorate / City and place them before District and Street'}
            </p>
          </div>
        </div>

        {/* Active Flow Pill */}
        {hierarchySteps.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 bg-black/40 px-3 py-1 rounded-full border border-white/10 text-[9.5px] font-black text-accent">
            {hierarchySteps.join(' ◂ ')}
          </div>
        )}
      </div>

      {/* Hierarchy Presets */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-white/50 flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-accent" />
          <span>{lang === 'ar' ? 'خيارات التسلسل الجغرافي السريع:' : 'Quick Hierarchy Presets:'}</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Preset 1: Gov & City BEFORE District & Street */}
          <button
            type="button"
            onClick={() => applyPreset('gov-city-before-district-street')}
            className={cn(
              "px-3 py-2 rounded-xl text-[10px] font-black transition-all text-right flex flex-col gap-0.5 border",
              includeGovernorate && includeCity && includeDistrict && includeStreet && placeBeforeDistrictStreet
                ? "bg-accent text-primary border-accent shadow-md ring-2 ring-accent/30"
                : "bg-black/30 text-white/70 border-white/10 hover:bg-white/10"
            )}
          >
            <span className="font-extrabold flex items-center justify-between">
              <span>{lang === 'ar' ? 'المحافظة والمدينة قبل الحي والشارع' : 'Gov & City before Dist & Street'}</span>
              {includeGovernorate && includeCity && includeDistrict && includeStreet && placeBeforeDistrictStreet && (
                <Check className="w-3 h-3" />
              )}
            </span>
            <span className="text-[8.5px] opacity-75 font-semibold">
              {lang === 'ar' ? 'الترتيب القياسي الهرمي الكامل' : 'Standard Full Hierarchy'}
            </span>
          </button>

          {/* Preset 2: Gov & City ONLY */}
          <button
            type="button"
            onClick={() => applyPreset('gov-city-only')}
            className={cn(
              "px-3 py-2 rounded-xl text-[10px] font-black transition-all text-right flex flex-col gap-0.5 border",
              includeGovernorate && includeCity && !includeDistrict && !includeStreet
                ? "bg-accent text-primary border-accent shadow-md ring-2 ring-accent/30"
                : "bg-black/30 text-white/70 border-white/10 hover:bg-white/10"
            )}
          >
            <span className="font-extrabold flex items-center justify-between">
              <span>{lang === 'ar' ? 'المحافظة والمدينة فقط' : 'Governorate & City Only'}</span>
              {includeGovernorate && includeCity && !includeDistrict && !includeStreet && (
                <Check className="w-3 h-3" />
              )}
            </span>
            <span className="text-[8.5px] opacity-75 font-semibold">
              {lang === 'ar' ? 'تخطي الشوارع وتسريع الجلب' : 'Fast Regional / Urban geocode'}
            </span>
          </button>

          {/* Preset 3: City + District + Street */}
          <button
            type="button"
            onClick={() => applyPreset('city-district-street')}
            className={cn(
              "px-3 py-2 rounded-xl text-[10px] font-black transition-all text-right flex flex-col gap-0.5 border",
              !includeGovernorate && includeCity && includeDistrict && includeStreet
                ? "bg-accent text-primary border-accent shadow-md ring-2 ring-accent/30"
                : "bg-black/30 text-white/70 border-white/10 hover:bg-white/10"
            )}
          >
            <span className="font-extrabold flex items-center justify-between">
              <span>{lang === 'ar' ? 'المدينة قبل الحي والشارع' : 'City before Dist & Street'}</span>
              {!includeGovernorate && includeCity && includeDistrict && includeStreet && (
                <Check className="w-3 h-3" />
              )}
            </span>
            <span className="text-[8.5px] opacity-75 font-semibold">
              {lang === 'ar' ? 'مدينة ◂ حي ◂ شارع' : 'City ◂ District ◂ Street'}
            </span>
          </button>

          {/* Preset 4: District & Street only */}
          <button
            type="button"
            onClick={() => applyPreset('district-street')}
            className={cn(
              "px-3 py-2 rounded-xl text-[10px] font-black transition-all text-right flex flex-col gap-0.5 border",
              !includeGovernorate && !includeCity && includeDistrict && includeStreet
                ? "bg-accent text-primary border-accent shadow-md ring-2 ring-accent/30"
                : "bg-black/30 text-white/70 border-white/10 hover:bg-white/10"
            )}
          >
            <span className="font-extrabold flex items-center justify-between">
              <span>{lang === 'ar' ? 'الحي والشارع فقط' : 'District & Street Only'}</span>
              {!includeGovernorate && !includeCity && includeDistrict && includeStreet && (
                <Check className="w-3 h-3" />
              )}
            </span>
            <span className="text-[8.5px] opacity-75 font-semibold">
              {lang === 'ar' ? 'عنونة تفصيلية للشوارع' : 'Detailed street addressing only'}
            </span>
          </button>
        </div>
      </div>

      {/* 4 Interactive Columns Selection (Order: Governorate -> City -> District -> Street) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* 1. Governorate */}
        <button
          type="button"
          onClick={() => handleToggle('includeGovernorate')}
          className={cn(
            "p-3 rounded-2xl border transition-all text-right flex flex-col justify-between gap-2 select-none group",
            includeGovernorate
              ? "bg-cyan-950/40 border-cyan-400/50 text-white"
              : "bg-black/20 border-white/5 text-white/40 hover:bg-white/5"
          )}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-black uppercase text-cyan-400/80">#1</span>
            <div className={cn(
              "w-4 h-4 rounded-md flex items-center justify-center border transition-colors",
              includeGovernorate ? "bg-cyan-400 border-cyan-400 text-primary" : "border-white/20"
            )}>
              {includeGovernorate && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Landmark className={cn("w-4 h-4", includeGovernorate ? "text-cyan-400" : "text-white/30")} />
            <span className="text-[11px] font-black">{lang === 'ar' ? 'المحافظة' : 'Governorate'}</span>
          </div>
        </button>

        {/* 2. City */}
        <button
          type="button"
          onClick={() => handleToggle('includeCity')}
          className={cn(
            "p-3 rounded-2xl border transition-all text-right flex flex-col justify-between gap-2 select-none group",
            includeCity
              ? "bg-blue-950/40 border-blue-400/50 text-white"
              : "bg-black/20 border-white/5 text-white/40 hover:bg-white/5"
          )}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-black uppercase text-blue-400/80">#2</span>
            <div className={cn(
              "w-4 h-4 rounded-md flex items-center justify-center border transition-colors",
              includeCity ? "bg-blue-400 border-blue-400 text-primary" : "border-white/20"
            )}>
              {includeCity && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className={cn("w-4 h-4", includeCity ? "text-blue-400" : "text-white/30")} />
            <span className="text-[11px] font-black">{lang === 'ar' ? 'المدينة' : 'City'}</span>
          </div>
        </button>

        {/* 3. District */}
        <button
          type="button"
          onClick={() => handleToggle('includeDistrict')}
          className={cn(
            "p-3 rounded-2xl border transition-all text-right flex flex-col justify-between gap-2 select-none group",
            includeDistrict
              ? "bg-emerald-950/40 border-emerald-400/50 text-white"
              : "bg-black/20 border-white/5 text-white/40 hover:bg-white/5"
          )}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-black uppercase text-emerald-400/80">#3</span>
            <div className={cn(
              "w-4 h-4 rounded-md flex items-center justify-center border transition-colors",
              includeDistrict ? "bg-emerald-400 border-emerald-400 text-primary" : "border-white/20"
            )}>
              {includeDistrict && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className={cn("w-4 h-4", includeDistrict ? "text-emerald-400" : "text-white/30")} />
            <span className="text-[11px] font-black">{lang === 'ar' ? 'الحي' : 'District'}</span>
          </div>
        </button>

        {/* 4. Street */}
        <button
          type="button"
          onClick={() => handleToggle('includeStreet')}
          className={cn(
            "p-3 rounded-2xl border transition-all text-right flex flex-col justify-between gap-2 select-none group",
            includeStreet
              ? "bg-amber-950/40 border-accent/50 text-white"
              : "bg-black/20 border-white/5 text-white/40 hover:bg-white/5"
          )}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-black uppercase text-accent/80">#4</span>
            <div className={cn(
              "w-4 h-4 rounded-md flex items-center justify-center border transition-colors",
              includeStreet ? "bg-accent border-accent text-primary" : "border-white/20"
            )}>
              {includeStreet && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Compass className={cn("w-4 h-4", includeStreet ? "text-accent" : "text-white/30")} />
            <span className="text-[11px] font-black">{lang === 'ar' ? 'الشارع' : 'Street'}</span>
          </div>
        </button>
      </div>

      {/* Position Ordering Option Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/30 p-3 rounded-2xl border border-white/5">
        <label className="flex items-center gap-2.5 text-[10.5px] font-bold text-white/90 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={placeBeforeDistrictStreet}
            onChange={(e) => onChangeOptions({ ...options, placeBeforeDistrictStreet: e.target.checked })}
            className="w-4 h-4 accent-accent rounded"
          />
          <div className="flex flex-col">
            <span>{lang === 'ar' ? 'ترتيب الأعمدة: وضع المحافظة والمدينة قبل الحي والشارع' : 'Column Order: Place Governorate & City BEFORE District & Street'}</span>
            <span className="text-[9px] text-white/40">{lang === 'ar' ? 'يضمن ظهور المحافظة والمدينة أولاً في الجداول وملفات الإكسل المصدرة' : 'Guarantees Gov/City appear first in tables and exported sheets'}</span>
          </div>
        </label>

        {setGeocodingMode && (
          <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setGeocodingMode('accurate')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[9.5px] font-black transition-all flex items-center gap-1",
                geocodingMode === 'accurate' ? "bg-accent text-primary shadow-sm" : "text-white/40 hover:text-white"
              )}
            >
              <Target className="w-3 h-3" />
              <span>{lang === 'ar' ? 'دقيق 🎯' : 'Accurate'}</span>
            </button>
            <button
              type="button"
              onClick={() => setGeocodingMode('fast')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[9.5px] font-black transition-all flex items-center gap-1",
                geocodingMode === 'fast' ? "bg-blue-500 text-white shadow-sm" : "text-white/40 hover:text-white"
              )}
            >
              <Zap className="w-3 h-3" />
              <span>{lang === 'ar' ? 'سريع ⚡' : 'Fast'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Action Button */}
      {showExecuteButton && onExecuteFetch && (
        <button
          type="button"
          onClick={onExecuteFetch}
          disabled={isLoading || (!includeGovernorate && !includeCity && !includeDistrict && !includeStreet)}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2.5 transition-all shadow-xl group border-2",
            isLoading
              ? "bg-accent/40 text-primary/70 border-accent/40 cursor-wait"
              : "bg-[#0b2d3d] hover:bg-accent hover:text-primary text-accent border-accent/30 hover:border-accent"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{lang === 'ar' ? 'جاري الاتصال بخوادم الخرائط وجلب العناوين...' : 'Connecting to map servers & geocoding...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>
                {lang === 'ar'
                  ? `جلب وتحديث (${hierarchySteps.join(' ◂ ') || 'العناوين'})${itemCount > 0 ? ` لـ (${itemCount}) عنصر` : ''}`
                  : `Fetch & Enrich (${hierarchySteps.join(' ◂ ') || 'Addresses'})${itemCount > 0 ? ` for (${itemCount}) items` : ''}`}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
