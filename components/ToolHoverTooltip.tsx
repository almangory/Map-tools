import React from 'react';
import { 
  Globe, RefreshCw, MapPinned, BarChart3, ShieldCheck, 
  HardDrive, Layers, Split, Shapes, Database, GitCompare, 
  PenTool, Info, CheckCircle2, Sparkles
} from 'lucide-react';

export interface ToolHelpData {
  titleAr: string;
  titleEn: string;
  icon: React.ReactNode;
  summaryAr: string;
  summaryEn: string;
  stepsAr: string[];
  stepsEn: string[];
  badgeAr?: string;
  badgeEn?: string;
}

export const TOOL_HELP_MAP: Record<string, ToolHelpData> = {
  'map-viewer': {
    titleAr: 'عرض الخريطة والمنسوب الطبوغرافي',
    titleEn: 'Map Viewer & Elevation Profile',
    icon: <Globe className="w-5 h-5 text-accent" />,
    summaryAr: 'عرض البيانات المكانية على خرائط تفاعلية متعددة الطبقات وإجراء تحليلات المناسيب والقطاعات الطولية مع مؤشر 3D مباشر.',
    summaryEn: 'Interactive multi-layer map viewer with elevation profile analysis and 3D synchronized map cursor.',
    stepsAr: [
      'التبديل بين خرائط القمريات، الشوارع والتضاريس مع نمط 3D.',
      'انقر على أي أنبوب لرسم قطاع المنسوب الطبوغرافي والارتفاعات (Z).',
      'مؤشر حركي أحمر يتتبع حركة الماوس على المخطط مباشرة على الخريطة.',
      'طباعة وتصدير تقارير هندسية متكاملة بصيغة PDF.'
    ],
    stepsEn: [
      'Switch between Satellite, Streets & Terrain basemaps in 3D.',
      'Click any pipeline to view longitudinal elevation profile (Z).',
      'Live animated red pointer syncs chart hover directly on map.',
      'Generate professional PDF map engineering reports.'
    ],
    badgeAr: 'تفاعلي 3D',
    badgeEn: 'Interactive 3D'
  },
  'converter': {
    titleAr: 'محول الإحداثيات والبيانات',
    titleEn: 'Coordinate & File Converter',
    icon: <RefreshCw className="w-5 h-5 text-accent" />,
    summaryAr: 'تحويل النقاط والخطوط من ملفات Excel, CSV, DXF, GDB إلى ملفات KML/KMZ مباشرة مع دعم كامل للأنظمة الوطنية.',
    summaryEn: 'Convert points/lines from Excel, CSV, DXF, GDB to clean KML/KMZ files with Saudi CRS support.',
    stepsAr: [
      'ارفع ملفك المصدري بالنقر أو السحب لجهة المعالجة.',
      'حدد نظام الإحداثيات المصدر (UTM Zone 37N-40N, عين العبد, WGS84).',
      'عيّن أسماء الأعمدة للإحداثيات (Name, X, Y, Z).',
      'حمل ملف KML/KMZ الجاهز فورياً على الخريطة.'
    ],
    stepsEn: [
      'Upload Excel/CSV/DXF source files easily.',
      'Select source CRS (UTM Zones 37N-40N, Ain El Abd, WGS84).',
      'Map coordinate attributes (Name, Easting X, Northing Y, Z).',
      'Download converted KML/KMZ file immediately.'
    ],
    badgeAr: 'تحويل سريع',
    badgeEn: 'Instant Convert'
  },
  'street-planner': {
    titleAr: 'مخطط الشوارع التفاعلي',
    titleEn: 'Street Planner & GIS Extractor',
    icon: <MapPinned className="w-5 h-5 text-accent" />,
    summaryAr: 'استخراج مسارات الشوارع الحقيقية من OpenStreetMap بناءً على مضلع النطاق لتخطيط شبكات المياه والصرف.',
    summaryEn: 'Extract real geographic street networks from OpenStreetMap within custom polygons for network planning.',
    stepsAr: [
      'ارسم مضلع النطاق المستهدف على الخريطة التفاعلية.',
      'اختر نوع الشبكة المستهدفة (مياه أو صرف صحي).',
      'حدد التصنيف الهيكلي للشوارع (رئيسية، فرعية، سكنية).',
      'استخرج خطوط الشبكة المسحوبة وحملها بصيغة KML.'
    ],
    stepsEn: [
      'Draw target polygon boundary on interactive map.',
      'Select network application (Water or Wastewater).',
      'Choose street hierarchies (primary, secondary, residential).',
      'Generate street-aligned polylines and export as KML.'
    ],
    badgeAr: 'OSM مباشر',
    badgeEn: 'Live OSM'
  },
  'analyzer': {
    titleAr: 'محلل أطوال الشبكات',
    titleEn: 'Network Length Analyzer',
    icon: <BarChart3 className="w-5 h-5 text-accent" />,
    summaryAr: 'تحليل دقيق لأطوال شبكات الأنابيب وتصنيفها آلياً حسب الأقطار والمواد وتوليد تقارير عروض تقديمية إحترافية.',
    summaryEn: 'Detailed pipeline length calculations categorized by diameter and material with PPTX & Excel exports.',
    stepsAr: [
      'ارفع ملف KML/KMZ يحتوي على مسارات شبكة الأنابيب.',
      'التعرف الآلي على حقول الأقطار والمواد من جداول الخصائص.',
      'استعراض إجمالي الأطوال بالأمتار والكيلومترات ورسوم بيانية.',
      'تصدير التقرير كعرض تقديمي PowerPoint أو جدول Excel.'
    ],
    stepsEn: [
      'Upload KML/KMZ dataset with network pipelines.',
      'Auto-detect DIAMETER and MATERIAL attribute fields.',
      'View aggregated pipe lengths in meters/km with charts.',
      'Export detailed analysis as PowerPoint (PPTX) or Excel.'
    ],
    badgeAr: 'تقارير PPTX',
    badgeEn: 'PPTX Reports'
  },
  'sbc-checker': {
    titleAr: 'فحص كود البناء السعودي (SBC)',
    titleEn: 'Saudi Building Code (SBC Audit)',
    icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
    summaryAr: 'مطابقة مواصفات الأنابيب والأعماق والميول والغطاء مع اشتراطات كود البناء السعودي (SBC 701/702/1001).',
    summaryEn: 'Automated audit of pipeline slopes, depths, pipe cover, and permit codes against Saudi Building Codes.',
    stepsAr: [
      'فحص تلقائي للأعماق الهندسية ودرجات الانحدار والميول.',
      'تمييز بصري على الخريطة: (أخضر=مطابق، أصفر=تحذير، أحمر=مخالف).',
      'التحقق من اكتمال وصحة رقم تصريح الحفر و Segment ID.',
      'تصدير تقرير الاعتماد والمخالفات المعتمد للهيئات.'
    ],
    stepsEn: [
      'Automated check of depths, slope angles, and pipe covers.',
      'Color status on map: Green (Compliant), Yellow (Warning), Red (Violation).',
      'Validate completeness of Permit Numbers & Segment IDs.',
      'Export comprehensive SBC compliance audit logs.'
    ],
    badgeAr: 'معتمد SBC',
    badgeEn: 'SBC Certified'
  },
  'segment-vault': {
    titleAr: 'حافظة القطاعات (Segment Vault)',
    titleEn: 'Segment Vault & Archive',
    icon: <HardDrive className="w-5 h-5 text-accent" />,
    summaryAr: 'أرشيف ذكي لإدارة قطاعات الأنابيب وتجميعها حسب التسامح الهندسي وتخزين أرقام تصاريح الحفر.',
    summaryEn: 'Smart segment vault for grouping pipe features by tolerance distance and linking excavation permits.',
    stepsAr: [
      'حفظ وتنظيم قطاعات الأنابيب بالاعتماد على Segment ID.',
      'التجميع التلقائي بناءً على مسافة التسامح الهندسي (Tolerance).',
      'ربط واسترجاع أرقام تصاريح الحفر المرتبطة بلك قطاع.',
      'إعادة تحميل المحفظة مباشرة على الخريطة بضغطة زر.'
    ],
    stepsEn: [
      'Store and organize pipe segments indexed by Segment ID.',
      'Auto-group segments using customizable tolerance limits.',
      'Link and manage excavation permit references per segment.',
      'Reload saved vaults directly onto the interactive map.'
    ],
    badgeAr: 'حفظ ذكي',
    badgeEn: 'Smart Storage'
  },
  'classifier': {
    titleAr: 'مصنف الخرائط والطبقات',
    titleEn: 'Spatial Map Classifier',
    icon: <Layers className="w-5 h-5 text-accent" />,
    summaryAr: 'تصنيف وفرز البيانات المكانية إلى طبقات منظمة بجدول الألوان المعياري لشركة المياه والصرف الصحي.',
    summaryEn: 'Classify complex spatial features into ordered, color-coded layer folders using standard NWC schemas.',
    stepsAr: [
      'ارفع ملف البيانات المكانية (KML/KMZ/DXF/GDB).',
      'اختر خاصية التصنيف المطلوب (مثل القطر أو نوع المادة).',
      'تطبيق الألوان المعتمدة لشركة المياه الوطنية تلقائياً.',
      'تصدير ملف مرتب بمجلدات وطبقات جغرافية.'
    ],
    stepsEn: [
      'Upload spatial files (KML/KMZ/DXF/GDB).',
      'Select attribute for classification (DIAMETER, MATERIAL).',
      'Apply official NWC styling and color ramps automatically.',
      'Export structured layers organized into standard folders.'
    ],
    badgeAr: 'تنسيق NWC',
    badgeEn: 'NWC Styling'
  },
  'splitter': {
    titleAr: 'مقسم الملفات المكاني',
    titleEn: 'Spatial File Splitter',
    icon: <Split className="w-5 h-5 text-accent" />,
    summaryAr: 'تجزئة الملفات الضخمة إلى أجزاء رقمية متساوية أو قصها جغرافياً بمضلع النطاق وتفكيك العناصر.',
    summaryEn: 'Split large spatial files into equal chunks or clip geographically using polygon boundaries.',
    stepsAr: [
      'التقسيم العددي: تجزئة الملف الكبير إلى عدد أجزاء محدد.',
      'التقسيم الجغرافي: قص واستقطاع البيانات داخل مضلع النطاق.',
      'أداة تفكيك وتجميع المسارات (Explode & Group).',
      'تصدير الأجزاء الناتجة في حزمة مضغوطة ZIP.'
    ],
    stepsEn: [
      'Numeric Split: Divide huge files into set chunk counts.',
      'Spatial Clip: Crop features inside custom polygon boundaries.',
      'Explode & Group multi-geometry elements.',
      'Export all output chunks as a unified ZIP archive.'
    ],
    badgeAr: 'تصدير ZIP',
    badgeEn: 'ZIP Export'
  },
  'polygon-converter': {
    titleAr: 'محول المضلعات والحدود',
    titleEn: 'Polygon & Boundary Generator',
    icon: <Shapes className="w-5 h-5 text-accent" />,
    summaryAr: 'تحويل الأنابيب والخطوط المنفصلة إلى مضلعات هندسية مغلقة وإنشاء حدود الإحاطة الشاملة (Convex Hull).',
    summaryEn: 'Convert disconnected lines into closed geometric polygons and generate convex hull bounding boundaries.',
    stepsAr: [
      'تتبع الخطوط المتصلة لإنشاء مضلعات مغلقة (Polygons).',
      'توليد حد الإحاطة الشامل (Convex Hull) لجميع عناصر المشروع.',
      'حساب المساحات والمحيط الجغرافي لكل مضلع.',
      'تصدير النطاقات والمضلعات كملفات KML/KMZ جاهزة.'
    ],
    stepsEn: [
      'Trace line segments to construct closed Polygons.',
      'Generate Convex Hull boundaries around project geometry.',
      'Calculate surface area and perimeter for created polygons.',
      'Export boundaries as KML/KMZ files for authority submission.'
    ],
    badgeAr: 'حدود هندسية',
    badgeEn: 'Convex Hull'
  },
  'attribute-formatter': {
    titleAr: 'تنسيق البيانات والشفرات',
    titleEn: 'Attribute & Code Formatter',
    icon: <Database className="w-5 h-5 text-accent" />,
    summaryAr: 'توحيد وهيكلة حقول البيانات والجلب الآلي لأسماء الشوارع والأحياء وتوليد كود العناصر المعياري.',
    summaryEn: 'Standardize GIS metadata, auto-fetch street and district names via reverse geocoding, and build element codes.',
    stepsAr: [
      'اختر القالب الهندسي المستهدف (Mainline, Manhole, Valve, Hydrant).',
      'جلب تلقائي لأسماء الأحياء والشوارع بواسطة Reverse Geocoding.',
      'استنتاج ذكي لربط الـ Segment ID ورخصة الحفر.',
      'تصدير الجدول بالبيانات المكتملة والشفرات المعتمدة.'
    ],
    stepsEn: [
      'Select element schema template (Mainline, Valve, Manhole, Hydrant).',
      'Fetch street and district names automatically via reverse geocoding.',
      'Smartly infer and map Segment IDs and Excavation Permits.',
      'Export fully enriched data tables with GIS standard coding.'
    ],
    badgeAr: 'عنونة عكسية',
    badgeEn: 'Geocoding'
  },
  'comparator': {
    titleAr: 'مقارنة البيانات والشبكات',
    titleEn: 'Spatial Data Comparator',
    icon: <GitCompare className="w-5 h-5 text-accent" />,
    summaryAr: 'مقارنة ملفين مكانيين واكتشاف المتطابقات الهندسية (Duplicates) والتداخلات (Intersections) والفروقات.',
    summaryEn: 'Compare two spatial datasets to isolate duplicate geometries, line intersections, and attribute differences.',
    stepsAr: [
      'ارفع الملف الأساسي (Base) والملف المراد مقارنته (Comparison).',
      'كشف دقيق للتطابقات الهندسية التامة (Duplicates).',
      'تحديد نقاط تداخل وتقاطع الأنابيب (Intersections).',
      'عرض الفروقات ألواناً على الخريطة وتصدير تقرير الاختلافات.'
    ],
    stepsEn: [
      'Upload Base dataset and Comparison dataset.',
      'Isolate exact geometric duplicates (Duplicates).',
      'Identify line intersection points across layers.',
      'Highlight variances on map and export diff report.'
    ],
    badgeAr: 'كشف التداخل',
    badgeEn: 'Diff Detector'
  },
  'line-drawer': {
    titleAr: 'أداة رسم الخطوط',
    titleEn: 'Manual Polyline Drawer',
    icon: <PenTool className="w-5 h-5 text-accent" />,
    summaryAr: 'رسم وتخطيط مسارات الأنابيب يدوياً على الخريطة أو بإدخال الإحداثيات وحساب الأطوال والبروفايل فورياً.',
    summaryEn: 'Draft pipeline routes directly on the map or by entering GPS coordinates with live profile generation.',
    stepsAr: [
      'إدخال إحداثيات النقاط (X, Y, Z) أو النقر المباشر على الخريطة.',
      'حساب فوري للأطوال وزوايا الانحدار والميول.',
      'توليد بروفايل المنسوب الطبوغرافي للمسار المخطط.',
      'تصدير المسار المرسوم بصيغة KML أو DXF.'
    ],
    stepsEn: [
      'Enter GPS coordinates manually or click directly on map.',
      'Instant length and slope angle calculations.',
      'Generate live elevation profile chart for drafted route.',
      'Export drawn polylines as KML or DXF CAD file.'
    ],
    badgeAr: 'رسم حر',
    badgeEn: 'Live Drafting'
  }
};

interface ToolHoverTooltipProps {
  toolId: string;
  lang: 'ar' | 'en';
  position: { top: number; left: number; side?: 'left' | 'right' | 'bottom' };
}

export const ToolHoverTooltip: React.FC<ToolHoverTooltipProps> = ({ toolId, lang, position }) => {
  const info = TOOL_HELP_MAP[toolId];
  if (!info) return null;

  const isAr = lang === 'ar';
  const title = isAr ? info.titleAr : info.titleEn;
  const summary = isAr ? info.summaryAr : info.summaryEn;
  const steps = isAr ? info.stepsAr : info.stepsEn;
  const badge = isAr ? info.badgeAr : info.badgeEn;

  let style: React.CSSProperties = {
    position: 'fixed',
    top: `${position.top}px`,
    zIndex: 999999,
  };

  if (position.side === 'right') {
    style.left = `${position.left}px`;
  } else if (position.side === 'bottom') {
    style.top = `${position.top}px`;
    style.left = `${position.left}px`;
  } else {
    style.left = `${position.left}px`;
  }

  return (
    <div 
      style={style}
      className="w-80 sm:w-96 p-4 rounded-3xl bg-[#031822]/95 backdrop-blur-xl border border-accent/40 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white text-xs space-y-3 pointer-events-none animate-in fade-in zoom-in-95 duration-200"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
            {info.icon}
          </div>
          <div>
            <h4 className="font-black text-sm text-white leading-tight">{title}</h4>
            <span className="text-[9.5px] font-bold text-accent/80 uppercase tracking-wider flex items-center gap-1 mt-0.5">
              <Sparkles className="w-3 h-3 text-accent inline" />
              {isAr ? 'طريقة عمل الأداة' : 'How Tool Works'}
            </span>
          </div>
        </div>
        {badge && (
          <span className="px-2 py-0.5 rounded-full bg-accent/20 border border-accent/40 text-[9.5px] font-black text-accent shrink-0">
            {badge}
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-[11px] text-white/80 leading-relaxed bg-white/5 p-2.5 rounded-2xl border border-white/5">
        {summary}
      </p>

      {/* Steps / Features */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[10px] font-black text-accent/90 uppercase tracking-wider flex items-center gap-1">
          <Info className="w-3 h-3" />
          {isAr ? 'خطوات وآلية التشغيل:' : 'Key Operations:'}
        </div>
        <ul className="space-y-1.5 text-[10.5px] text-white/70">
          {steps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
              <span className="leading-tight">{step}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tip footer */}
      <div className="pt-2 border-t border-white/10 text-[9.5px] text-white/40 font-bold text-center">
        {isAr ? '💡 انقر على الأداة للانتقال إليها فوراً' : '💡 Click tool button to open immediately'}
      </div>
    </div>
  );
};
