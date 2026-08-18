
export interface GeoPoint {
  id: string | number;
  x: number; // Easting or Longitude
  y: number; // Northing or Latitude
  z?: number; // Elevation
  description?: string;
  attr1?: string; // Extra Attribute 1
  attr2?: string; // Extra Attribute 2
  layer?: string;
  folderPath?: string[]; // Nested folder path from source file e.g. ['Main Folder', 'Subfolder 1', 'Subfolder 2']
  type?: 'Point' | 'LineString' | 'Polygon'; // Geometry Type
  path?: { x: number; y: number; z?: number }[]; // Array of coordinates
  color?: string; // Hex color for analysis
  length?: number; // Calculated length in meters
  originalLength?: number; // Total length of lines before joining
  district?: string; // Neighborhood / District name from geocoding
  street?: string; // Street name from geocoding
  originalRow?: any[]; // The raw data from Excel/CSV
  attributes?: Record<string, string>; // Extracted extended data
  iconUrl?: string; // Custom KML icon URL
  isIssue?: boolean; // Flag if element has validation issue
  issueReason?: string; // Explanation of validation issue
}

export interface CheckResultModalState {
  type: 'essential' | 'segment' | 'permit' | 'sbc' | 'general';
  titleAr: string;
  titleEn: string;
  icon: 'essential' | 'segment' | 'permit' | 'sbc' | 'general';
  totalChecked: number;
  issuesCount: number;
  successCount: number;
  uniqueCount?: number;
  badgeTextAr: string;
  badgeTextEn: string;
  detailsAr: string;
  detailsEn: string;
  stats: Array<{ labelAr: string; labelEn: string; value: number | string; colorClass: string }>;
  issueItems?: GeoPoint[];
}

export interface SplitPolygon {
  id: string;
  path: { x: number; y: number }[];
  color: string;
  name: string;
}

export interface ParsedFile {
  filename: string;
  type: 'excel' | 'csv' | 'dxf' | 'kmz' | 'text';
  headers?: string[];
  data: any[]; 
  preview: any[][];
  suggestedMapping?: ColumnMapping;
}

export interface EPSGDefinition {
  code: string;
  name: string;
  def: string;
}

export interface ColumnMapping {
  xColumn: string;
  yColumn: string;
  zColumn?: string;
  idColumn?: string;
  descColumn?: string;
  linkColumn?: string;
  attr1Column?: string;
  attr2Column?: string;
}

export enum AppStep {
  UPLOAD = 0,
  CONFIG = 1,
  PREVIEW = 2,
}

export type KmlSplitMode = 'none' | 'count' | 'attribute' | 'spatial';

export interface KmlExportOptions {
  mode: KmlSplitMode;
  splitCount?: number;
  groupByAttribute?: 'layer' | 'attr1' | 'attr2' | 'color' | 'street' | 'geometry';
  groupByColumn?: string;
  canonicalColorMap?: Record<string, string>; // Mapping for merging colors
  standardizeColors?: boolean;
  selectionPolygon?: { x: number; y: number }[];
  separateMultiGeometry?: boolean;
  splitLinesByLength?: boolean;
  maxLineLength?: number;
  optimizeForMyMaps?: boolean;
  keepOriginalDescription?: boolean;
  removeImagesOnly?: boolean;
  lineStyle?: {
    width?: number;
  };
  polygonStyle?: {
    colorHex?: string;
    opacityHex?: string;
    outline?: number;
    width?: number;
  };
}

export type SplitterMode = 'single' | 'separate';

export interface AnalysisItem {
  color: string;
  statusName?: string;
  statusColor?: string;
  totalLength: number;
  count: number;
  percentage: number;
  center?: { x: number; y: number };
}

export type BaseMapType = 'satellite' | 'streets' | 'terrain' | 'osm';

export type HydraulicVelocityStatus = 'low' | 'optimal' | 'high';

export interface OutfallTarget {
  id: string;
  name?: string;
  x: number;
  y: number;
  z?: number;
  color?: string;
  isExplicitTarget?: boolean;
  furthestPipe?: OutfallFurthestPipeInfo;
  isDistanceExceeded?: boolean;
}

export interface OutfallFurthestPipeInfo {
  pipeId: string;
  pipeName?: string;
  distanceMeters: number;
  hydraulicRunLengthMeters: number;
  furthestPoint: { x: number; y: number; z?: number };
  exceedsStandard: boolean;
  standardLimitMeters: number;
  severity: 'safe' | 'caution' | 'critical';
  warningMessageAr?: string;
  warningMessageEn?: string;
}

export interface OutfallSummaryInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  GL: number;
  IL: number;
  depth: number;
  totalConnectedPipes: number;
  totalLengthMeters: number;
  totalIncomingFlowLs: number;
  avgSlope: number;
  avgVelocity: number;
  color: string;
  furthestPipe?: OutfallFurthestPipeInfo;
  isDistanceExceeded?: boolean;
}

export type AsphaltRestorationScope = 'trench' | 'lane' | 'full_street';

export interface AsphaltCalculationParams {
  scope: AsphaltRestorationScope;
  trenchWidth: number; // default: 1.0 m
  laneWidth: number; // default: 3.5 m
  fullStreetWidth: number; // default: 15.0 m
  asphaltThickness: number; // default: 0.10 m (10 cm)
}

export interface AsphaltPolygonCalculation {
  id: string;
  name: string;
  polygon: { x: number; y: number; z?: number }[];
  areaM2: number;
  perimeterM: number;
  thicknessM: number; // default: 0.10 m (10 cm)
  thicknessCm: number; // default: 10 cm
  densityTonM3: number; // default: 2.40 ton/m3
  volumeM3: number; // area * thickness
  weightTons: number; // volume * density
  
  // Bituminous Coats
  primeCoatRateKgM2: number; // default: 1.0 kg/m2 (MC-70)
  primeCoatTotalKg: number;
  tackCoatRateKgM2: number; // default: 0.5 kg/m2 (RC-250)
  tackCoatTotalKg: number;

  // Base Course / Subbase
  includeBaseCourse?: boolean;
  baseCourseThicknessM?: number; // e.g. 0.15 m (15 cm)
  baseCourseVolumeM3?: number;
  baseCourseWeightTons?: number; // density ~ 2.2 ton/m3

  // Network Pipes inside Polygon
  pipesInsideCount: number;
  pipesTotalLengthM: number;
  pipesTrenchAsphaltAreaM2: number;
  pipesTrenchAsphaltVolumeM3: number;
  pipesTrenchAsphaltWeightTons: number;

  // Cost Estimation (Optional)
  unitPricePerTon?: number;
  unitPricePerM2?: number;
  unitPricePerM3?: number;
  estimatedTotalCost?: number;

  source: 'draw' | 'file';
  filename?: string;
  createdAt: string;
}

export type HydraulicColorMode = 'velocity' | 'priority' | 'diameter' | 'status' | 'catchment' | 'default';

export type SewerHydraulicStatus = 'Normal Gravity' | 'Drop Manhole' | 'Lift Station Needed';

export interface GravityPipeCalculations {
  id: string | number;
  GL_start: number;
  GL_end: number;
  IL_start: number;
  IL_end: number;
  Depth_start: number;
  Depth_end: number;
  Length: number;
  Slope: number; // Slope in percentage (%) = ((IL_start - IL_end) / Length) * 100
  SlopeDecimal: number; // m/m
  Diameter_mm: number;
  Diameter_m: number;
  Manning_n: number;
  Velocity: number; // m/s
  Flow_Capacity_Ls: number; // L/s
  Flow_Capacity_M3s: number; // m3/s
  VelocityStatus: 'optimal' | 'low' | 'high';
  VelocityStatusLabelAr: string;
  VelocityStatusLabelEn: string;
  Status: SewerHydraulicStatus;
  StatusReasonAr: string;
  StatusReasonEn: string;
  DropHeight_m?: number;
  Outfall_ID?: string;
  IsOutfall: boolean;
  IsLiftStationRequired: boolean;
  IsDropManhole: boolean;
  UpstreamNode: string;
  DownstreamNode: string;
  IsReversed: boolean;
}

export interface GravityNetworkResult {
  pipes: GravityPipeCalculations[];
  pipesMap: Map<string | number, GravityPipeCalculations>;
  totalPipes: number;
  totalLengthM: number;
  outfallNode?: {
    id: string;
    x: number;
    y: number;
    IL: number;
    GL: number;
    depth: number;
    totalIncomingCapacityLs: number;
  };
  liftStationNodes: Array<{
    id: string;
    x: number;
    y: number;
    reasonAr: string;
    reasonEn: string;
    requiredDepth: number;
    pipeId: string | number;
  }>;
  dropManholeNodes: Array<{
    id: string;
    x: number;
    y: number;
    dropMeters: number;
    pipeId: string | number;
  }>;
  stats: {
    normalGravityCount: number;
    dropManholeCount: number;
    liftStationCount: number;
    optimalVelocityCount: number;
    lowVelocityCount: number;
    highVelocityCount: number;
    avgSlopePercent: number;
    avgVelocity: number;
    totalFlowCapacityLs: number;
  };
}

export interface PipeHydraulicData {
  id: string | number;
  length: number; // meters
  diameterMm: number; // mm
  diameterM: number; // m
  slopeDecimal: number; // m/m
  slopePercent: number; // %
  slopeSource: 'attribute' | 'elevation_diff' | 'dem_diff' | 'default';
  manningN: number; // default: 0.013
  flowArea: number; // m² (full cross-section)
  hydraulicRadius: number; // m (D/4)
  velocity: number; // m/s (full pipe)
  maxCapacityLs: number; // L/s (Q_full)
  designCapacity75Ls: number; // L/s (Q_75%)
  velocityStatus: HydraulicVelocityStatus;
  statusBadgeAr: string; // 'رسوبيات' | 'سلس ومطابق' | 'نحر وتآكل'
  statusBadgeEn: string; // 'Sedimentation Risk' | 'Optimal Flow' | 'Scour Risk'
  velocityColor: string; // #FF9800 | #00E676 | #FF1744
  animationDurationSec: number; // 2.5s | 1.2s | 0.5s
  animationClass: 'flow-anim-low' | 'flow-anim-optimal' | 'flow-anim-high';
  
  // Sewer Gravity Levels & Depths
  glStart?: number; // Ground Level Start (m)
  glEnd?: number; // Ground Level End (m)
  ilStart?: number; // Invert Level Start (m)
  ilEnd?: number; // Invert Level End (m)
  depthStart?: number; // Excavation / Trench depth at start (m)
  depthEnd?: number; // Excavation / Trench depth at end (m)
  sewerStatus?: SewerHydraulicStatus;
  sewerStatusReasonAr?: string;
  sewerStatusReasonEn?: string;
  isLiftStationRequired?: boolean;
  isDropManhole?: boolean;
  dropHeightM?: number;
  outfallId?: string;
  isOutfall?: boolean;

  // Direction & Topology
  flowDirectionTextAr: string;
  flowDirectionTextEn: string;
  upstreamNode: string;
  downstreamNode: string;
  startElevation?: number;
  endElevation?: number;
  priority: 1 | 2 | 3;
  priorityLabelAr: string;
  priorityLabelEn: string;
  isReversed: boolean;
  
  // Asphalt Restoration Quantities
  restorationWidth: number; // m
  asphaltAreaM2: number; // m²
  asphaltVolumeM3: number; // m³
}

export interface HydraulicNetworkSummary {
  totalPipes: number;
  totalLengthM: number;
  avgVelocity: number;
  averageVelocity: number;
  avgDiameterMm: number;
  avgSlopePercent: number;
  totalCapacityLs: number;
  totalFullCapacityLs: number;
  
  lowVelocityCount: number;
  lowVelocityLengthM: number;
  optimalVelocityCount: number;
  optimalVelocityLengthM: number;
  highVelocityCount: number;
  highVelocityLengthM: number;

  statsByVelocity: {
    low: number;
    optimal: number;
    high: number;
  };

  // Sewer Specific Stats
  normalGravityCount?: number;
  dropManholeCount?: number;
  liftStationCount?: number;
  primaryOutfallId?: string;
  primaryOutfallIL?: number;
  liftStationNodes?: Array<{
    id: string;
    x: number;
    y: number;
    reasonAr: string;
    requiredDepth: number;
    pipeId: string | number;
  }>;
  dropManholeNodes?: Array<{
    id: string;
    x: number;
    y: number;
    dropMeters: number;
    pipeId: string | number;
  }>;
  
  totalAsphaltAreaM2: number;
  totalAsphaltVolumeM3: number;
  
  pipes: PipeHydraulicData[];
  pipesMap: Map<string | number, PipeHydraulicData>;
}
