import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, PenTool, UploadCloud, FileSpreadsheet, Download, 
  Layers, Check, Trash2, Maximize2, AlertCircle, 
  Sparkles, RefreshCw, ChevronDown, ChevronUp, 
  Info, DollarSign, Activity, Eye, EyeOff
} from 'lucide-react';
import { GeoPoint, AsphaltPolygonCalculation } from '../types';
import { Language } from '../translations';
import { 
  calculateAsphaltPolygonBOQ, 
  extractPolygonFromUploadedFile, 
  exportAsphaltPolygonExcel, 
  exportAsphaltPolygonKML 
} from '../services/asphaltCalculationService';

export interface AsphaltPolygonCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  networkPoints: GeoPoint[];
  currentCalculation?: AsphaltPolygonCalculation | null;
  onUpdateCalculation?: (calc: AsphaltPolygonCalculation | null) => void;
  onApplyCalculation?: (calc: AsphaltPolygonCalculation | null) => void;
  isDrawingMode?: boolean;
  onStartDrawing?: () => void;
  onStartDrawMode?: () => void;
  onCancelDrawing?: () => void;
  onFinishDrawing?: () => void;
  drawingVerticesCount?: number;
  onZoomToPolygon?: () => void;
  isPolygonVisible?: boolean;
  onTogglePolygonVisibility?: () => void;
}

export const AsphaltPolygonCalculatorModal: React.FC<AsphaltPolygonCalculatorModalProps> = ({
  isOpen,
  onClose,
  lang,
  networkPoints,
  currentCalculation,
  onUpdateCalculation,
  onApplyCalculation,
  isDrawingMode = false,
  onStartDrawing,
  onStartDrawMode,
  onCancelDrawing,
  onFinishDrawing,
  drawingVerticesCount = 0,
  onZoomToPolygon,
  isPolygonVisible = true,
  onTogglePolygonVisibility
}) => {
  const isAr = lang === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyCalc = useCallback((calc: AsphaltPolygonCalculation | null) => {
    if (onUpdateCalculation) onUpdateCalculation(calc);
    if (onApplyCalculation) onApplyCalculation(calc);
  }, [onUpdateCalculation, onApplyCalculation]);

  const triggerStartDraw = useCallback(() => {
    if (onStartDrawing) onStartDrawing();
    else if (onStartDrawMode) onStartDrawMode();
  }, [onStartDrawing, onStartDrawMode]);

  // Parameter states
  const [thicknessCm, setThicknessCm] = useState<number>(10);
  const [densityTonM3, setDensityTonM3] = useState<number>(2.40);
  const [includeBaseCourse, setIncludeBaseCourse] = useState<boolean>(false);
  const [baseCourseThicknessCm, setBaseCourseThicknessCm] = useState<number>(15);
  const [unitPricePerTon, setUnitPricePerTon] = useState<number | undefined>(undefined);
  const [unitPricePerM2, setUnitPricePerM2] = useState<number | undefined>(undefined);
  const [costMode, setCostMode] = useState<'ton' | 'm2'>('ton');

  // UI state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Sync parameters with current calculation if present
  useEffect(() => {
    if (currentCalculation) {
      setThicknessCm(currentCalculation.thicknessCm);
      setDensityTonM3(currentCalculation.densityTonM3);
      if (currentCalculation.includeBaseCourse) {
        setIncludeBaseCourse(true);
        setBaseCourseThicknessCm((currentCalculation.baseCourseThicknessM || 0.15) * 100);
      }
      if (currentCalculation.unitPricePerTon) {
        setUnitPricePerTon(currentCalculation.unitPricePerTon);
        setCostMode('ton');
      } else if (currentCalculation.unitPricePerM2) {
        setUnitPricePerM2(currentCalculation.unitPricePerM2);
        setCostMode('m2');
      }
    }
  }, [currentCalculation?.id]);

  // Recalculate whenever parameters change on an existing polygon
  const handleRecalculate = (
    newThickness = thicknessCm,
    newDensity = densityTonM3,
    newIncludeBase = includeBaseCourse,
    newBaseThickness = baseCourseThicknessCm,
    newPriceTon = unitPricePerTon,
    newPriceM2 = unitPricePerM2
  ) => {
    if (!currentCalculation?.polygon || currentCalculation.polygon.length < 3) return;

    const updated = calculateAsphaltPolygonBOQ(
      currentCalculation.polygon,
      {
        name: currentCalculation.name,
        thicknessCm: newThickness,
        densityTonM3: newDensity,
        includeBaseCourse: newIncludeBase,
        baseCourseThicknessCm: newBaseThickness,
        unitPricePerTon: costMode === 'ton' ? newPriceTon : undefined,
        unitPricePerM2: costMode === 'm2' ? newPriceM2 : undefined,
        source: currentCalculation.source,
        filename: currentCalculation.filename
      },
      networkPoints
    );

    applyCalc(updated);
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const { polygon, name, filename } = await extractPolygonFromUploadedFile(file);
      const calc = calculateAsphaltPolygonBOQ(
        polygon,
        {
          name,
          filename,
          source: 'file',
          thicknessCm,
          densityTonM3,
          includeBaseCourse,
          baseCourseThicknessCm,
          unitPricePerTon: costMode === 'ton' ? unitPricePerTon : undefined,
          unitPricePerM2: costMode === 'm2' ? unitPricePerM2 : undefined
        },
        networkPoints
      );

      applyCalc(calc);
      setTimeout(() => {
        onZoomToPolygon?.();
      }, 200);
    } catch (err: any) {
      console.error('Failed to parse polygon file:', err);
      setUploadError(err.message || (isAr ? 'فشل تحليل المضلع من الملف المرفق.' : 'Failed to extract polygon from attached file.'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-slate-950 text-slate-100 rounded-3xl border border-amber-500/30 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/10">
              <span className="text-xl">🏗️</span>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>{isAr ? 'حاسبة كميات الأسفلت بالمضلع' : 'Asphalt Polygon BOQ Calculator'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                  {isAr ? 'رسم / إرفاق مضلع' : 'Draw / Upload'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {isAr 
                  ? 'حساب المساحة السطحية، سماكة الأسفلت، الحجم بالمتر المكعب، الوزن بالطن، وطبقات الرش'
                  : 'Calculate surface area, volume (m³), weight (tons), and bituminous coats from polygon'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all border border-white/10"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          
          {/* Main Action Banner: Draw vs Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            
            {/* Option A: Interactive Draw on Map */}
            <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
              isDrawingMode 
                ? 'bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/40' 
                : 'bg-slate-900/90 border-white/10 hover:border-amber-500/40'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <PenTool className="w-4 h-4 text-amber-400" />
                  <span>{isAr ? '1. رسم مضلع على الخريطة' : '1. Draw Polygon on Map'}</span>
                </div>
                {isDrawingMode && (
                  <span className="text-[10px] bg-red-600 text-white font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {isAr ? 'وضع الرسم نشط' : 'Drawing Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                {isAr 
                  ? 'انقر على الخريطة لتحديد أركان ونقاط مضلع الأسفلت بدقة مع عرض المساحة والمحيط مباشرة.'
                  : 'Click on the map to define polygon vertices with real-time area and perimeter preview.'}
              </p>

              {isDrawingMode ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30">
                    <span>{isAr ? 'النقاط المحددة حالياً:' : 'Vertices placed:'}</span>
                    <strong className="font-mono text-sm">{drawingVerticesCount} {isAr ? 'نقاط' : 'pts'}</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onFinishDrawing?.();
                        onClose();
                      }}
                      disabled={drawingVerticesCount < 3}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isAr ? 'إنهاء وحساب' : 'Finish & Calc'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancelDrawing?.()}
                      className="w-full py-2 px-3 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-rose-200 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>{isAr ? 'إلغاء الرسم' : 'Cancel'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    triggerStartDraw();
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs transition-all shadow-md shadow-amber-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <PenTool className="w-4 h-4" />
                  <span>{isAr ? 'بدء رسم مضلع الأسفلت على الخريطة' : 'Start Drawing Asphalt Polygon'}</span>
                </button>
              )}
            </div>

            {/* Option B: Upload / Attach Polygon File */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                isDragOver
                  ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/40'
                  : 'bg-slate-900/90 border-white/10 hover:border-amber-500/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-white text-sm">
                    <UploadCloud className="w-4 h-4 text-cyan-400" />
                    <span>{isAr ? '2. إرفاق / رفع ملف مضلع' : '2. Upload Polygon File'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-white/5 font-mono">
                    KML • KMZ • DXF • SHP • CSV • Excel
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  {isAr 
                    ? 'اسحب وأفلت أو اختر ملف المضلع (KML, KMZ, DXF, GeoJSON, Excel) لاستخراج الإحداثيات وحساب الكميات فورياً.'
                    : 'Drag & drop or browse a polygon file (KML, KMZ, DXF, GeoJSON, Excel) to calculate quantities instantly.'}
                </p>
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  accept=".kml,.kmz,.dxf,.json,.geojson,.zip,.xlsx,.xls,.csv"
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-500/60 font-bold text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                      <span>{isAr ? 'جاري قراءة واستخراج المضلع...' : 'Extracting polygon...'}</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4 text-cyan-400" />
                      <span>{isAr ? 'اختيار ملف المضلع من الجهاز...' : 'Browse Polygon File...'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-2xl flex items-center gap-2.5 text-rose-200 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* CALCULATION RESULTS & METRICS DISPLAY */}
          {/* ======================================================== */}
          {currentCalculation && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              
              {/* Result Header & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50 animate-pulse" />
                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                    <span>{currentCalculation.name}</span>
                    <span className="text-[10px] font-normal text-slate-400 font-mono">
                      ({currentCalculation.polygon.length} {isAr ? 'رؤوس زوايا' : 'vertices'})
                    </span>
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTogglePolygonVisibility?.()}
                    className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
                    title={isAr ? 'إظهار / إخفاء المضلع على الخريطة' : 'Toggle polygon visibility'}
                  >
                    {isPolygonVisible ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{isPolygonVisible ? (isAr ? 'المضلع معروض' : 'Visible') : (isAr ? 'المضلع مخفي' : 'Hidden')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onZoomToPolygon?.();
                      onClose();
                    }}
                    className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
                    title={isAr ? 'تركيز وتقريب الخريطة على المضلع' : 'Zoom to polygon'}
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isAr ? 'تقريب للخريطة' : 'Zoom to Map'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyCalc(null)}
                    className="py-1.5 px-3 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/30 text-xs font-bold text-rose-300 hover:text-white transition-all flex items-center gap-1.5"
                    title={isAr ? 'مسح هذا المضلع' : 'Clear calculation'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'مسح' : 'Clear'}</span>
                  </button>
                </div>
              </div>

              {/* Primary Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                
                {/* 1. Surface Area */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-b from-cyan-950/50 to-slate-900/90 border border-cyan-500/30">
                  <span className="text-[11px] font-bold text-cyan-300 block mb-1">
                    {isAr ? 'المساحة السطحية (Area)' : 'Surface Area'}
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-black text-white">
                    {currentCalculation.areaM2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-cyan-400/80 font-bold">
                    {isAr ? 'متر مربع (m²)' : 'Square Meters (m²)'}
                  </span>
                </div>

                {/* 2. Perimeter */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10">
                  <span className="text-[11px] font-bold text-slate-300 block mb-1">
                    {isAr ? 'محيط المضلع (Perimeter)' : 'Perimeter'}
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-black text-slate-100">
                    {currentCalculation.perimeterM.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">
                    {isAr ? 'متر طولي (m)' : 'Meters (m)'}
                  </span>
                </div>

                {/* 3. Asphalt Volume */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-b from-amber-950/50 to-slate-900/90 border border-amber-500/30">
                  <span className="text-[11px] font-bold text-amber-300 block mb-1">
                    {isAr ? 'حجم الأسفلت (Volume)' : 'Asphalt Volume'}
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-black text-amber-200">
                    {currentCalculation.volumeM3.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-amber-400/80 font-bold">
                    {isAr ? `متر مكعب (m³) @ ${currentCalculation.thicknessCm}cm` : `m³ @ ${currentCalculation.thicknessCm}cm`}
                  </span>
                </div>

                {/* 4. Total Tonnage */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-b from-orange-950/60 to-slate-900/90 border border-orange-500/40 shadow-lg shadow-orange-950/30">
                  <span className="text-[11px] font-bold text-orange-300 block mb-1">
                    {isAr ? 'وزن الأسفلت (Weight)' : 'Total Weight'}
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-black text-orange-100">
                    {currentCalculation.weightTons.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-orange-400/80 font-bold">
                    {isAr ? `طن أسفلت (${currentCalculation.densityTonM3} t/m³)` : `Tons (${currentCalculation.densityTonM3} t/m³)`}
                  </span>
                </div>

              </div>

              {/* Bituminous Coats & Base Course Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Prime & Tack Coats Card */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2.5">
                  <div className="font-bold text-xs text-cyan-300 flex items-center justify-between">
                    <span>{isAr ? 'طبقات الرش الإسفلتية (Bituminous Coats)' : 'Bituminous Spray Coats'}</span>
                    <span className="text-[10px] text-slate-400">MC-70 & RC-250</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-white/5">
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'طبقة تشريب MC-70:' : 'Prime Coat (MC-70):'}</span>
                      <strong className="font-mono text-cyan-200 text-sm block mt-0.5">
                        {currentCalculation.primeCoatTotalKg.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg
                      </strong>
                      <span className="text-[9px] text-slate-400">
                        ({(currentCalculation.primeCoatTotalKg / 1000).toFixed(2)} {isAr ? 'طن' : 'Tons'})
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/60 border border-white/5">
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'طبقة لصق RC-250:' : 'Tack Coat (RC-250):'}</span>
                      <strong className="font-mono text-amber-200 text-sm block mt-0.5">
                        {currentCalculation.tackCoatTotalKg.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg
                      </strong>
                      <span className="text-[9px] text-slate-400">
                        ({(currentCalculation.tackCoatTotalKg / 1000).toFixed(2)} {isAr ? 'طن' : 'Tons'})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Network Pipes in Polygon / Trench Comparison */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2.5">
                  <div className="font-bold text-xs text-amber-300 flex items-center justify-between">
                    <span>{isAr ? 'خطوط الشبكة والخنادق داخل المضلع' : 'Network Pipes Inside Polygon'}</span>
                    <span className="text-[10px] font-mono text-amber-400">
                      {currentCalculation.pipesInsideCount} {isAr ? 'أنابيب' : 'pipes'}
                    </span>
                  </div>

                  {currentCalculation.pipesInsideCount > 0 ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-white/5">
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'إجمالي أطوال الأنابيب:' : 'Pipes Length:'}</span>
                        <strong className="font-mono text-emerald-300 text-sm block mt-0.5">
                          {currentCalculation.pipesTotalLengthM.toFixed(1)} m
                        </strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-white/5">
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'أسفلت الخنادق فقط (1.0m):' : 'Trench Asphalt (1m):'}</span>
                        <strong className="font-mono text-amber-300 text-sm block mt-0.5">
                          {currentCalculation.pipesTrenchAsphaltWeightTons.toFixed(1)} {isAr ? 'طن' : 'Tons'}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-white/5 text-[11px] text-slate-400">
                      {isAr 
                        ? 'لم يتم رصد خطوط شبكة تتقاطع مع حدود هذا المضلع.'
                        : 'No network pipes currently intersect this polygon area.'}
                    </div>
                  )}
                </div>

              </div>

              {/* Base Course Summary (if enabled) */}
              {currentCalculation.includeBaseCourse && (
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🪨</span>
                    <div>
                      <strong className="text-emerald-300 block">{isAr ? 'طبقة الأساس الحجري (Aggregate Base Course)' : 'Aggregate Base Course'}</strong>
                      <span className="text-[10px] text-slate-400">
                        {isAr ? `سماكة ${((currentCalculation.baseCourseThicknessM || 0.15) * 100).toFixed(0)} سم` : `Thickness ${((currentCalculation.baseCourseThicknessM || 0.15) * 100).toFixed(0)} cm`}
                      </span>
                    </div>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-white font-bold text-sm block">
                      {(currentCalculation.baseCourseVolumeM3 || 0).toFixed(1)} m³
                    </span>
                    <span className="text-emerald-400 text-[10px] font-bold">
                      {(currentCalculation.baseCourseWeightTons || 0).toFixed(1)} {isAr ? 'طن ركام' : 'Tons'}
                    </span>
                  </div>
                </div>
              )}

              {/* Cost Estimation (if entered) */}
              {currentCalculation.estimatedTotalCost !== undefined && currentCalculation.estimatedTotalCost > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-emerald-950/70 border border-emerald-500/40 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-emerald-300 block">{isAr ? 'التكلفة الإجمالية التقديرية (Estimated Cost)' : 'Total Estimated Cost'}</span>
                      <span className="text-[10px] text-slate-400">
                        {isAr ? 'شامل التوريد والتنفيذ والدمك' : 'Supply, paving & compaction'}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono text-lg sm:text-xl font-black text-emerald-200">
                    {currentCalculation.estimatedTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs font-bold text-emerald-400 ms-1.5">{isAr ? 'ريال' : 'SAR'}</span>
                  </div>
                </div>
              )}

              {/* Export Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => exportAsphaltPolygonExcel(currentCalculation, [], lang)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isAr ? 'تصدير جدول حصر كميات إكسل (Excel BOQ)' : 'Export Excel BOQ'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportAsphaltPolygonKML(currentCalculation, lang)}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-500/60 font-bold text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>{isAr ? 'تصدير KML للمضلع' : 'Export KML'}</span>
                </button>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* CONFIGURABLE PARAMETERS & ACCORDION */}
          {/* ======================================================== */}
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white transition-all text-xs font-bold border border-white/5"
            >
              <div className="flex items-center gap-2">
                <span>⚙️</span>
                <span>{isAr ? 'تعديل معايير وسماكة الأسفلت والتكاليف' : 'Asphalt Thickness & Density Parameters'}</span>
              </div>
              {showAdvancedParams ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showAdvancedParams && (
              <div className="mt-3 p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4 animate-in fade-in text-xs">
                
                {/* Row 1: Thickness & Density */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Thickness */}
                  <div>
                    <label className="text-slate-300 font-bold block mb-1.5">
                      {isAr ? 'سماكة طبقة الأسفلت (Thickness):' : 'Asphalt Thickness:'}
                    </label>
                    <div className="flex items-center gap-2 mb-2">
                      {[5, 7, 10, 15, 20].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setThicknessCm(val);
                            handleRecalculate(val, densityTonM3);
                          }}
                          className={`py-1 px-2.5 rounded-lg font-bold text-xs transition-all ${
                            thicknessCm === val 
                              ? 'bg-amber-500 text-slate-950 shadow-sm font-black' 
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {val} cm
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="0.5"
                        value={thicknessCm}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setThicknessCm(val);
                          handleRecalculate(val, densityTonM3);
                        }}
                        className="w-24 bg-slate-950 border border-white/20 rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-amber-400 outline-none"
                      />
                      <span className="text-slate-400 font-bold">{isAr ? 'سم (cm)' : 'cm'}</span>
                    </div>
                  </div>

                  {/* Density */}
                  <div>
                    <label className="text-slate-300 font-bold block mb-1.5">
                      {isAr ? 'كثافة الخلطة الإسفلتية (Density):' : 'Asphalt Density:'}
                    </label>
                    <div className="flex items-center gap-2 mb-2">
                      {[2.35, 2.40, 2.45].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setDensityTonM3(val);
                            handleRecalculate(thicknessCm, val);
                          }}
                          className={`py-1 px-2.5 rounded-lg font-bold text-xs transition-all ${
                            densityTonM3 === val 
                              ? 'bg-orange-500 text-slate-950 shadow-sm font-black' 
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {val.toFixed(2)} t/m³
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1.5"
                        max="3.5"
                        step="0.01"
                        value={densityTonM3}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 2.4;
                          setDensityTonM3(val);
                          handleRecalculate(thicknessCm, val);
                        }}
                        className="w-24 bg-slate-950 border border-white/20 rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-amber-400 outline-none"
                      />
                      <span className="text-slate-400 font-bold">{isAr ? 'طن / م³ (Ton/m³)' : 'Ton/m³'}</span>
                    </div>
                  </div>

                </div>

                {/* Row 2: Aggregate Base Course Toggle */}
                <div className="pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-200 font-bold flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeBaseCourse}
                        onChange={(e) => {
                          setIncludeBaseCourse(e.target.checked);
                          handleRecalculate(thicknessCm, densityTonM3, e.target.checked);
                        }}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                      />
                      <span>{isAr ? 'تضمين طبقة الأساس الحجري (Aggregate Base Course)' : 'Include Aggregate Base Course'}</span>
                    </label>

                    {includeBaseCourse && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{isAr ? 'سماكة الأساس:' : 'Base Thickness:'}</span>
                        <input
                          type="number"
                          min="5"
                          max="60"
                          value={baseCourseThicknessCm}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 15;
                            setBaseCourseThicknessCm(val);
                            handleRecalculate(thicknessCm, densityTonM3, includeBaseCourse, val);
                          }}
                          className="w-20 bg-slate-950 border border-white/20 rounded-xl px-2.5 py-1 text-white font-mono text-xs"
                        />
                        <span className="text-slate-400">cm</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 3: Cost Estimation */}
                <div className="pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-200">{isAr ? 'تقدير التكلفة الإجمالية (اختياري):' : 'Unit Cost Estimation (Optional):'}</span>
                    <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/10">
                      <button
                        type="button"
                        onClick={() => setCostMode('ton')}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${costMode === 'ton' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
                      >
                        {isAr ? 'ريال / طن' : 'SAR / Ton'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCostMode('m2')}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${costMode === 'm2' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
                      >
                        {isAr ? 'ريال / م²' : 'SAR / m²'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder={isAr ? (costMode === 'ton' ? 'أدخل سعر الطن (مثال: 250)' : 'أدخل سعر المتر المربع (مثال: 45)') : 'Enter unit rate'}
                      value={costMode === 'ton' ? (unitPricePerTon || '') : (unitPricePerM2 || '')}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || undefined;
                        if (costMode === 'ton') {
                          setUnitPricePerTon(val);
                          handleRecalculate(thicknessCm, densityTonM3, includeBaseCourse, baseCourseThicknessCm, val, undefined);
                        } else {
                          setUnitPricePerM2(val);
                          handleRecalculate(thicknessCm, densityTonM3, includeBaseCourse, baseCourseThicknessCm, undefined, val);
                        }
                      }}
                      className="w-64 bg-slate-950 border border-white/20 rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:border-emerald-400 outline-none placeholder:text-slate-600"
                    />
                    <span className="text-slate-400 font-bold">{isAr ? 'ريال سعودي (SAR)' : 'SAR'}</span>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-900/90 border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>{isAr ? 'يدعم المضلعات المغلقة، ملفات Google Earth والـ AutoCAD والـ Excel' : 'Supports closed polygons, KML, CAD DXF & Excel'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all border border-white/10 active:scale-95"
          >
            {isAr ? 'إغلاق النافذة' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
