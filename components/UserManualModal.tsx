import React, { useState } from 'react';
import {
  FileSpreadsheet, X, Download, ShieldCheck, Database, Layers,
  Compass, Zap, Printer, Search, Activity, RefreshCw, Split,
  SlidersHorizontal, MapPin, PenTool, Mountain, Pickaxe, ShieldAlert, Waves,
  ChevronDown, ChevronUp, BookOpen, CheckCircle2, Info
} from 'lucide-react';

interface UserManualModalProps {
  lang: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({
  lang,
  isOpen,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'core' | 'engineering' | 'gis'>('all');

  if (!isOpen) return null;

  const sections = [
    {
      id: 'sec-1',
      category: 'core',
      num: '1',
      titleAr: '1. مستعرض الخرائط التفاعلي (Map Viewer)',
      titleEn: '1. Interactive Map Viewer',
      icon: Activity,
      color: 'text-cyan-400',
      descAr: 'استعراض البيانات المكانية على خرائط تفاعلية متعددة الطبقات وإجراء تحليلات المناسيب والقطاعات الطولية.',
      descEn: 'View spatial data on interactive multi-layer maps and perform level and longitudinal elevation profile analysis.',
      pointsAr: [
        'التحكم بالخرائط: التبديل بين خرائط القمريات (Satellite)، الشوارع، التضاريس، و OpenStreetMap مع نمط الرؤية ثلاثية الأبعاد (3D).',
        'أداة قياس المنسوب (Profile Tool): انقر على أي خط أو أنبوب لعرض قطاع المنسوب الطبوغرافي التفاعلي بالارتفاعات (Z) والميول (Slope %) والمسافات التراكمية.',
        'مؤشر الخريطة المباشر: تحريك الماوس على المخطط البياني يحدد موقعك فورياً بسهم أحمر ثلاثي الأبعاد حركي على الخريطة.',
        'تقارير الخريطة: استخراج تقارير هندسية بصيغة PDF وتصدير بيانات الموقع فورياً.'
      ],
      pointsEn: [
        'Map Controls: Switch between Satellite, Street, Terrain, and OpenStreetMap basemaps with 3D view mode.',
        'Elevation Profile Tool: Click any pipeline to generate an interactive profile chart showing Z-elevations, slope %, and cumulative distances.',
        'Interactive Pointer: Hovering on the profile chart dynamically moves a 3D animated red arrow pointer directly on the Leaflet map.',
        'Map Reports: Generate professional PDF engineering map reports instantly.'
      ]
    },
    {
      id: 'sec-2',
      category: 'core',
      num: '2',
      titleAr: '2. محول الإحداثيات والبيانات (Converter)',
      titleEn: '2. Coordinate Converter',
      icon: RefreshCw,
      color: 'text-accent',
      descAr: 'تحويل الإحداثيات والبيانات من ملفات Excel, CSV, DXF, KMZ, GDB إلى KML/KMZ مباشرة.',
      descEn: 'Convert points and lines from Excel, CSV, DXF, KMZ, GDB directly into clean KML/KMZ files.',
      pointsAr: [
        'ارفع الملف بالنقر أو السحب لمنطقة الرفع التفاعلية.',
        'اختر نظام الإحداثيات المصدر (مثل UTM Zone 37N-40N أو عين العبد أو WGS84).',
        'عيّن أسماء الأعمدة في ملفك (الاسم، السيني X، الصادي Y، المنسوب Z).',
        'حمل ملف KML أو KMZ المنسق لمشاهدة البيانات بدقة على الخريطة.'
      ],
      pointsEn: [
        'Upload files via click or drag-and-drop.',
        'Select source CRS (e.g., UTM Zone 37N-40N, Ain El Abd, or WGS84).',
        'Map your file column headers (Name, Easting X, Northing Y, Elevation Z).',
        'Download formatted KML or KMZ ready for immediate GIS deployment.'
      ]
    },
    {
      id: 'sec-3',
      category: 'gis',
      num: '3',
      titleAr: '3. مقسم الملفات الذكي (File Splitter)',
      titleEn: '3. Smart File Splitter',
      icon: Split,
      color: 'text-purple-400',
      descAr: 'توزيع وتقسيم ملفات KML الكبيرة وفق استراتيجيات متعددة لتسهيل إدارة وتوزيع العمل.',
      descEn: 'Split large KML datasets across multiple strategies for project management and field teams.',
      pointsAr: [
        'التقسيم بالعدد: تقسيم الملف إلى أجزاء متساوية بحسب عدد العناصر.',
        'التقسيم المكاني الذكي: تقسيم العناصر جغرافياً باستخدام خوارزميات التجميع K-Means.',
        'التقسيم حسب أسماء الشوارع: تجميع الخطوط في ملفات مستقلة بناءً على الشارع.',
        'تنزيل جميع الأجزاء في ملف مضغوط ZIP بنقرة واحدة.'
      ],
      pointsEn: [
        'Split by Count: Divide files into equal element batches.',
        'Spatial K-Means: Cluster elements geographically based on proximity.',
        'Street Clustering: Group pipelines into files matching street names.',
        'Download all partitioned folders as a consolidated ZIP package.'
      ]
    },
    {
      id: 'sec-4',
      category: 'core',
      num: '4',
      titleAr: '4. محلل أطوال وتصنيف الأنابيب (Length & Color Analyzer)',
      titleEn: '4. Length & Color Analyzer',
      icon: FileSpreadsheet,
      color: 'text-emerald-400',
      descAr: 'تحليل أطوال الشبكات وتصنيفها حسب الأقطار، المواد، وحالة التنفيذ المعتمدة.',
      descEn: 'Analyze network pipeline lengths categorized by diameter, material, and execution status.',
      pointsAr: [
        'ارفق ملف KML/KMZ يحتوي على مسارات الشبكة المطلوبة.',
        'يتعرف النظام تلقائياً على الأعمدة (DIAMETER, MATERIAL, STATUS).',
        'استعراض إجمالي الأطوال مقسمة حسب القطر ونوع المادة بالأمتار والكيلومترات.',
        'تصدير تقرير عروض تقديمية احترافية (PPTX) وملفات Excel.'
      ],
      pointsEn: [
        'Upload KML/KMZ files containing network pipelines.',
        'System automatically identifies attributes (DIAMETER, MATERIAL, STATUS).',
        'View total lengths categorized by diameter and material in meters & km.',
        'Export executive presentation reports (PPTX) and Excel spreadsheets.'
      ]
    },
    {
      id: 'sec-5',
      category: 'engineering',
      num: '5',
      titleAr: '5. مدقق كود البناء السعودي (SBC Code Check)',
      titleEn: '5. Saudi Building Code (SBC Validator)',
      icon: ShieldCheck,
      color: 'text-amber-400',
      descAr: 'فحص ومطابقة الشبكات والخطوط مع متطلبات كود البناء السعودي (SBC 701/702/1001).',
      descEn: 'Validate pipelines against Saudi Building Code (SBC 701/702/1001) engineering standards.',
      pointsAr: [
        'التحقق آلياً من الأعماق، درجات الانحدار، أغطية الأنابيب (Pipe Cover)، والميول المسموحة.',
        'تمييز ألوان التوافق على الخريطة: (أخضر=مطابق، أصفر=تحذير، أحمر=مخالفة كود).',
        'التحقق من وجود واستيفاء رقم تصريح الحفر (Permit No) و Segment ID.',
        'تصدير تقارير المطابقة والمخالفات بالتفصيل لتسليم الهيئات.'
      ],
      pointsEn: [
        'Automatically verify pipe depths, hydraulic slopes, and pipe cover thresholds.',
        'Map compliance highlighting: Green (Compliant), Yellow (Warning), Red (SBC Violation).',
        'Validate existence and format of Permit Numbers and Segment IDs.',
        'Export detailed SBC audit reports for authority submissions.'
      ]
    },
    {
      id: 'sec-6',
      category: 'gis',
      num: '6',
      titleAr: '6. تنسيق البيانات والشفرات (Attribute Formatter)',
      titleEn: '6. Attribute Formatter',
      icon: Database,
      color: 'text-blue-400',
      descAr: 'توحيد وهيكلة حقول البيانات الوصفية لتطابق المعايير المعتمدة لشركة المياه الوطنية.',
      descEn: 'Standardize metadata fields according to NWC GIS data dictionary standards.',
      pointsAr: [
        'اختيار القالب الهندسي المستهدف (Mainline, Manhole, Valve, Hydrant).',
        'الجلب الآلي لأسماء الشوارع والأحياء بواسطة تقنية العنونة العكسية (Reverse Geocoding).',
        'الربط والاستنتاج الذكي لمعرفات القطاعات (Segment ID) وأرقام تصاريح الحفر (Permit No).',
        'تصدير الملف المنسق مع كامل البيانات الوصفية والشفرات المعيارية.'
      ],
      pointsEn: [
        'Select target element schema template (Mainline, Manhole, Valve, Hydrant).',
        'Auto-fetch street & district names via reverse geocoding from coordinates.',
        'Smartly infer and extract Segment IDs and Excavation Permit Numbers.',
        'Export formatted files with mapped attributes and standard GIS codings.'
      ]
    },
    {
      id: 'sec-7',
      category: 'gis',
      num: '7',
      titleAr: '7. مصنف الخرائط والطبقات (Map Classifier)',
      titleEn: '7. Map Classifier',
      icon: Layers,
      color: 'text-indigo-400',
      descAr: 'تصنيف وتلوين خطوط الشبكة آلياً بناءً على تقاطعها المكاني مع مناطق مرجعية (Zones / Districts).',
      descEn: 'Classify and color network lines automatically based on spatial overlay with reference zones.',
      pointsAr: [
        'ارفع ملف الخطوط المراد تصنيفها ثم ارفع ملف المضلعات أو الأحياء المرجعية.',
        'يجري النظام فحص التقاطع المكاني (Spatial Containment / Intersection).',
        'تطبيق ألوان الأحياء وتحديث البيانات الوصفية لكل خط بنقرة زر واحدة.'
      ],
      pointsEn: [
        'Upload source lines and reference zone polygons.',
        'System executes spatial containment and intersection audit.',
        'Apply district color coding and update attribute tags with one click.'
      ]
    },
    {
      id: 'sec-8',
      category: 'core',
      num: '8',
      titleAr: '8. مقارنة الملفات وإصدارات المخططات (File Comparator)',
      titleEn: '8. File Comparator',
      icon: SlidersHorizontal,
      color: 'text-pink-400',
      descAr: 'كشف الفروقات والتعديلات بين نسختين من المخططات (قبل وبعد التحديث).',
      descEn: 'Detect geometric and attribute differences between two revisions of CAD/GIS files.',
      pointsAr: [
        'رفع الملف الأصلي والملف المعدل.',
        'تحديد العناصر المضافة (جديدة)، المحذوفة، والمعدلة مكانياً.',
        'عرض مقارنة تفاعلية على الخريطة وتصدير تقرير التغييرات.'
      ],
      pointsEn: [
        'Upload baseline original file and modified revision file.',
        'Identify added, removed, and geometrically altered elements.',
        'Interactive dual-layer difference map and delta change summary.'
      ]
    },
    {
      id: 'sec-9',
      category: 'engineering',
      num: '9',
      titleAr: '9. تخطيط الشوارع والمحاور (Street Planner)',
      titleEn: '9. Street Network Planner',
      icon: Compass,
      color: 'text-teal-400',
      descAr: 'تخطيط شبكات الأنابيب داخل حدود المخططات وتقسيم الخطوط عند التقاطعات.',
      descEn: 'Plan pipe runs inside project boundaries and break lines at topological street intersections.',
      pointsAr: [
        'استيراد أو رسم مضلع حدود المشروع (Boundary Polygon).',
        'توليد الخطوط ومحاور الشوارع آلياً وتقطيع الخطوط عند تقاطعات الشوارع (Topology Clean).',
        'تصدير المسارات كملفات KML و DXF مع إسناد أرقام القطاعات.'
      ],
      pointsEn: [
        'Import or draft project boundary polygon.',
        'Auto-generate street axes and split lines at topological intersections.',
        'Export runs to KML and DXF with assigned Segment IDs.'
      ]
    },
    {
      id: 'sec-10',
      category: 'gis',
      num: '10',
      titleAr: '10. محول المضلعات والحدود (Polygon Converter)',
      titleEn: '10. Polygon & Boundary Converter',
      icon: MapPin,
      color: 'text-amber-500',
      descAr: 'تحويل النقاط والمضلعات إلى نطاقات جغرافية وحساب المساحات ومراكز الثقل.',
      descEn: 'Convert point clusters and boundary loops into geospatial polygon zones.',
      pointsAr: [
        'توليد الغلاف المحدب (Convex Hull) أو الإحاطة المستطيلة للنقاط.',
        'حساب المساحات بالمتر المربع والهكتار بدقة عالية.',
        'إنشاء نطاقات أمان (Buffer Zones) حول الأنابيب والمرافق.'
      ],
      pointsEn: [
        'Generate Convex Hull or bounding boxes around point clusters.',
        'Calculate precise land areas in m² and hectares.',
        'Create safety buffer corridors around pipelines and utilities.'
      ]
    },
    {
      id: 'sec-11',
      category: 'gis',
      num: '11',
      titleAr: '11. خزنة وحافظة القطاعات (Segment Vault)',
      titleEn: '11. Segment Vault Manager',
      icon: Database,
      color: 'text-sky-400',
      descAr: 'حفظ وإدارة قطاعات الأنابيب وأرقام التصاريح ومطابقتها مكانياً دون فقدان البيانات.',
      descEn: 'Store, query, and synchronize pipe segments and permit IDs with local device storage.',
      pointsAr: [
        'تخزين وتجميع القطاعات آلياً بناءً على حدود التسامح الهندسي.',
        'ربط أرقام التصاريح بمعرفات الـ Segment المقابلة فورياً.',
        'استرجاع وتطبيق المشاريع المحفوظة على الخريطة بنقرة واحدة.'
      ],
      pointsEn: [
        'Store and group pipe segments automatically based on geometric tolerance limits.',
        'Link permit numbers with corresponding Segment IDs seamlessly.',
        'Reload saved projects and segments directly onto the interactive map.'
      ]
    },
    {
      id: 'sec-12',
      category: 'gis',
      num: '12',
      titleAr: '12. أداة رسم الخطوط واستخلاص شبكات CAD (Line Drawer & CAD Extractor)',
      titleEn: '12. Line Drawer & CAD Network Extractor',
      icon: PenTool,
      color: 'text-accent',
      descAr: 'رسم وتخطيط مسارات الأنابيب يدوياً أو استخلاص محاور الشوارع آلياً من ملفات CAD/DXF وShapefile وتحويل إحداثيات UTM إلى WGS84.',
      descEn: 'Draw pipeline routes manually, import from Excel, or auto-extract street centerlines from CAD/DXF & Shapefiles.',
      pointsAr: [
        'توليد آلي من CAD / Shapefile: قراءة وتصفية طبقات محاور الشوارع وتجاهل النصوص والبلوكات.',
        'التحويل الجغرافي والإسقاط: تحويل الإحداثيات المترية (UTM Zone 37N-40N, Ain el Abd) إلى WGS84.',
        'توليد شبكة الأنابيب دفعة واحدة: تحديد القطر والمادة ورقم التصريح وبادئة الـ Segment ID.',
        'الرسم المباشر والإكسل: رسم تفاعلي على الخريطة أو استيراد إكسل مع البروفايل الطبوغرافي.'
      ],
      pointsEn: [
        'Auto-Extraction from CAD/Shapefile: Filter street centerline layers, ignoring text annotations.',
        'Coordinate Transformation: Convert UTM zones and Ain El Abd into WGS84.',
        'Batch Pipe Generation: Configure diameter, material, permit number, and Segment prefix.',
        'Direct Drafting & Excel Import: Interactive clicking, Excel ingestion, and live profile chart.'
      ]
    },
    {
      id: 'sec-13',
      category: 'engineering',
      num: '13',
      titleAr: '13. المخطط الطولي التفاعلي (Longitudinal Profile / Profile View Engine)',
      titleEn: '13. Longitudinal Profile / Profile View Engine',
      icon: Mountain,
      color: 'text-cyan-300',
      descAr: 'توليد رسم بياني احترافي يوضح خط الأرض الطبيعية (GL)، منسوب قاع الأنبوب (IL)، الأعماق، والميول، ورصد الهدارات (Drop Manholes) ومحطات الرفع.',
      descEn: 'Interactive engineering profile showing Ground Level (GL), Invert Level (IL), excavation depths, hydraulic slopes, drop manholes, and lift stations.',
      pointsAr: [
        'معادلات الحساب الهيدروليكي: منسوب القاع IL = GL - Depth، نسبة الانحدار Slope (%) = (IL_start - IL_end) / Length * 100.',
        'رصد المناهل الهدارة: وسم تلقائي لـ Drop Manhole عندما يتجاوز فرق منسوب الدخول والخروج 0.60 م طبقاً لمعايير NWC.',
        'التكبير والتخصيص: إمكانية التكبير الرأسي للمقاطع (1x, 2x, 5x, 10x) وعكس اتجاه المسار وتصدير التقرير إلى Excel.',
        'تزامن المؤشر: حركة الماوس على المخطط الطولي تنقل مؤشر الخريطة فورياً لموقع النقطة والمحطة (Station).'
      ],
      pointsEn: [
        'Hydraulic Formulas: Invert Level IL = GL - Depth, Hydraulic Slope (%) = (IL_start - IL_end) / Length * 100.',
        'Drop Manhole Detection: Flags drop manholes automatically when invert drop exceeds 0.60 m as per NWC codes.',
        'Vertical Exaggeration: Toggle vertical exaggeration (1x, 2x, 5x, 10x), reverse stationing, and export tabular station sheets to Excel.',
        'Map Synchronization: Hovering over the profile graph instantly pins and centers the station on the interactive map.'
      ]
    },
    {
      id: 'sec-14',
      category: 'engineering',
      num: '14',
      titleAr: '14. حساب كميات الحفر والردم وجدول الكميات (Earthwork Quantities & BOQ)',
      titleEn: '14. Earthwork Quantities & BOQ Calculation Engine',
      icon: Pickaxe,
      color: 'text-amber-300',
      descAr: 'حساب كميات أعمال الحفر والردم والفرشات الرملية وقطع السفلتة تلقائياً بناء على القطر والمنسوب وتصنيف بنود الحفر حسب فئات الأعماق.',
      descEn: 'Automated calculation of excavation volume, sand bedding, pipe volume, backfilling, and asphalt reinstatement with depth-categorized BOQ.',
      pointsAr: [
        'عرض الخندق المعياري: W = D_ext + 2 * Clearance (مثال: 0.80م لأقطار 160-200مم، 1.00م لأقطار 250-315مم، 1.20م لأقطار 400-500مم).',
        'حجم الحفر الإجمالي: V_excav = W * Depth_avg * Length.',
        'حجم فرشة الرمل: V_bedding = W * Thickness_bedding * Length.',
        'حجم الردم الصافي: V_backfill = V_excav - (V_bedding + V_pipe).',
        'قطع السفلتة والتصنيف: Area_asphalt = W * Length وتصنيف الحفر بفئات الأعماق (0-1.5م، 1.5-3.0م، 3.0-5.0م، >5.0م) وتصدير جدول كميات رسمي.'
      ],
      pointsEn: [
        'Standard Trench Width: W = D_ext + 2 * Clearance (e.g. 0.80m for 160-200mm, 1.00m for 250-315mm, 1.20m for 400-500mm).',
        'Excavation Volume: V_excav = W * Depth_avg * Length.',
        'Bedding Sand Volume: V_bedding = W * Thickness_bedding * Length.',
        'Net Backfill Volume: V_backfill = V_excav - (V_bedding + V_pipe).',
        'Asphalt Reinstatement: Area_asphalt = W * Length and automatic depth bracket classification (0-1.5m, 1.5-3.0m, 3.0-5.0m, >5.0m).'
      ]
    },
    {
      id: 'sec-15',
      category: 'engineering',
      num: '15',
      titleAr: '15. التحقق من التعارضات الميدانية والخدمات (Utility Clash Detection Engine)',
      titleEn: '15. Utility Clash Detection Engine',
      icon: ShieldAlert,
      color: 'text-rose-400',
      descAr: 'محرك تدقيق تقاطعات المرافق (مياه، صرف صحي، خدمات)، فحص الخلوص الرأسي والأفقي، وتطبيق القاعدة الذهبية: خط المياه دائماً أعلى من خط الصرف الصحي بمقدار 0.50م على الأقل.',
      descEn: 'Spatial and vertical intersection auditor verifying utility clearances and the golden rule: water mains must always sit above sewer lines by at least 0.50m.',
      pointsAr: [
        'القاعدة الهندسية المعتمدة: IL_water - Crown_sewer >= 0.50 m لحماية مياه الشرب من التلوث.',
        'تصنيف مستويات الخطورة: اصطدام مادي (Collision < 0.0m)، خلوص حرج (Critical < 0.50m)، تحذير مسافة (Warning)، وآمن (Safe).',
        'التركيز الميداني: تحديد إحداثيات نقاط التقاطع بدقة مع إمكانية التكبير والتمركز المباشر على الخريطة وتصدير سجل التدقيق.',
        'فحص التقاطعات المتعددة: فحص خطوط المياه مع خطوط الصرف الصحي والكابلات وخطوط الري.'
      ],
      pointsEn: [
        'Code Requirement: IL_water - Crown_sewer >= 0.50 m to safeguard potable water from contamination.',
        'Severity Classification: Physical Collision (< 0.0m), Critical Clearance (< 0.50m), Proximity Warning, and Safe Pass.',
        'Map Centering: Live GPS coordinate identification with interactive map focus and Excel audit report generation.',
        'Multi-Utility Audit: Cross-checks water mains, gravity sewers, storm drains, and buried conduits.'
      ]
    },
    {
      id: 'sec-16',
      category: 'engineering',
      num: '16',
      titleAr: '16. محاكاة تعطل محطات الرفع والفيضان السطحي (Sewer Overflow & Lift Station Simulation)',
      titleEn: '16. Lift Station Failure & Sewer Overflow Simulation',
      icon: Waves,
      color: 'text-orange-400',
      descAr: 'محاكاة هيدروليكية ديناميكية لحالات الطوارئ (انقطاع الكهرباء، عطل المضخات)، حساب سعة التخزين الرجعية للشبكة، زمن الطفح (TTO)، وتحديد أول منهول معرض للفيضان.',
      descEn: 'Dynamic hydraulic failure simulator computing pipe buffer storage, Time-to-Overflow (TTO), critical spill manholes, and emergency tanker dispatch.',
      pointsAr: [
        'السعة التخزينية الإجمالية: V_total = V_wetwell + Sum(Pi * r^2 * L_pipe) + Sum(Area_mh * h).',
        'زمن بدء الطفح (Time-to-Overflow): TTO = V_total / Q_inflow بالساعات والدقائق.',
        'أول منهول يفيض: المنهول ذو أوطى منسوب غطاء سطحي (Lowest Rim Elevation) المتصل هيدروليكياً بمصب الرفع.',
        'خطة الإخلاء والطوارئ: حساب عدد الصهاريج المطلوبة بالساعة: N_tankers = Ceil(Q_inflow * 3600 / V_tanker).'
      ],
      pointsEn: [
        'Total Buffer Volume: V_total = V_wetwell + Sum(Pi * r^2 * L_pipe) + Sum(Area_mh * h).',
        'Time-to-Overflow (TTO): TTO = V_total / Q_inflow in hours and minutes.',
        'First Spill Point: Connected manhole with the lowest surface rim elevation.',
        'Emergency Tanker Fleet: Required vacuum tankers per hour: N_tankers = Ceil(Q_inflow * 3600 / V_tanker).'
      ]
    }
  ];

  const filteredSections = sections.filter(sec => {
    const matchCat = activeCategory === 'all' || sec.category === activeCategory;
    const matchSearch =
      searchQuery === '' ||
      sec.titleAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.descAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.descEn.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300">
      <div className="bg-[#0a2330] border border-cyan-500/40 rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#071d29] flex items-center justify-between shrink-0 print:bg-white print:border-slate-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shadow-inner print:bg-slate-100 print:text-black">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-black text-base md:text-lg flex items-center gap-2 print:text-black">
                {lang === 'ar' ? 'الدليل الهندسي الشامل واستخدام الأدوات' : 'Comprehensive Engineering User Manual'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold border border-accent/30 print:hidden">
                  {lang === 'ar' ? '16 أداة ومعيار' : '16 Modules'}
                </span>
              </h2>
              <p className="text-[11px] text-white/60 font-medium print:text-slate-600">
                {lang === 'ar' ? 'شرح كامل لكافة أدوات المنصة مع المعادلات الهندسية ومعايير التصميم المعتمدة.' : 'Detailed documentation, hydraulic formulas, and engineering calculation workflows.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="p-2.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold"
              title={lang === 'ar' ? 'طباعة أو حفظ PDF' : 'Print / Save PDF'}
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-6 py-3 bg-[#05151e] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCategory === 'all'
                  ? 'bg-accent text-slate-950 shadow-md'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {lang === 'ar' ? 'جميع الأقسام' : 'All Sections'} ({sections.length})
            </button>
            <button
              onClick={() => setActiveCategory('engineering')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeCategory === 'engineering'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {lang === 'ar' ? 'الهندسة والهيدروليكا' : 'Engineering & Hydraulics'}
            </button>
            <button
              onClick={() => setActiveCategory('core')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCategory === 'core'
                  ? 'bg-cyan-400 text-slate-950 shadow-md'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {lang === 'ar' ? 'الأدوات الأساسية' : 'Core Tools'}
            </button>
            <button
              onClick={() => setActiveCategory('gis')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCategory === 'gis'
                  ? 'bg-purple-400 text-slate-950 shadow-md'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {lang === 'ar' ? 'نظم المعلومات GIS' : 'GIS & Data'}
            </button>
          </div>

          <div className="relative min-w-[200px] max-w-xs w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث في الدليل...' : 'Search manual...'}
              className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar print:p-2 print:overflow-visible">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSections.map((sec) => {
              const IconComp = sec.icon;
              return (
                <div
                  key={sec.id}
                  id={sec.id}
                  className="bg-white/5 hover:bg-white/[0.07] p-5 rounded-2xl border border-white/10 hover:border-accent/40 space-y-3 transition-all print:bg-white print:border-slate-300 print:border"
                >
                  <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                    <div className="p-2 bg-white/5 rounded-xl text-accent print:bg-slate-100 print:text-black">
                      <IconComp className={`w-4 h-4 ${sec.color}`} />
                    </div>
                    <h3 className="font-black text-sm text-white print:text-black">
                      {lang === 'ar' ? sec.titleAr : sec.titleEn}
                    </h3>
                  </div>

                  <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800 font-medium">
                    {lang === 'ar' ? sec.descAr : sec.descEn}
                  </p>

                  <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                    {(lang === 'ar' ? sec.pointsAr : sec.pointsEn).map((pt, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Print help banner */}
          <div className="p-5 bg-cyan-950/40 rounded-2xl border border-cyan-500/30 text-white space-y-2 print:hidden">
            <h4 className="font-black text-xs text-cyan-300 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-cyan-300" />
              {lang === 'ar' ? '💡 لحفظ هذا الدليل بنجاح كملف PDF عالي الجودة وبطريقة رسمية:' : '💡 To save this manual as a high-fidelity vector PDF file:'}
            </h4>
            <p className="text-[10.5px] leading-relaxed text-cyan-100/80">
              {lang === 'ar' ? (
                <>
                  1. انقر على زر <b>طباعة / PDF</b> في الأعلى.<br />
                  2. في نافذة الطباعة المنبثقة، اختر الوجهة كـ <b>"حفظ بتنسيق PDF" (Save as PDF)</b>.<br />
                  3. تأكد من تفعيل "خلفية الرسوم" (Background graphics) في خيارات الطباعة الإضافية ليظهر التصميم الملائم والدقيق.
                </>
              ) : (
                <>
                  1. Click the <b>Print / PDF</b> button in the top corner.<br />
                  2. In the printing dialog window, set the destination layout to <b>Save as PDF</b>.<br />
                  3. Ensure you enable <b>Background graphics</b> in the print settings for maximum layout fidelity.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/5 bg-black/40 flex justify-end gap-3 shrink-0 print:hidden">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-black transition-all"
          >
            {lang === 'ar' ? 'إغلاق الدليل' : 'Close Manual'}
          </button>
        </div>
      </div>
    </div>
  );
};
