
export interface GeoPoint {
  id: string | number;
  x: number; // Easting or Longitude
  y: number; // Northing or Latitude
  z?: number; // Elevation
  description?: string;
  attr1?: string; // Extra Attribute 1
  attr2?: string; // Extra Attribute 2
  layer?: string;
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
  groupByAttribute?: 'layer' | 'attr1' | 'attr2' | 'color' | 'street';
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
export type CheckResultModalState = any;

export type HydraulicVelocityStatus = 'low' | 'optimal' | 'high';

export type AsphaltRestorationScope = 'trench' | 'lane' | 'full_street';

export interface AsphaltCalculationParams {
  scope: AsphaltRestorationScope;
  trenchWidth: number; // default: 1.0 m
  laneWidth: number; // default: 3.5 m
  fullStreetWidth: number; // default: 15.0 m
  asphaltThickness: number; // default: 0.10 m (10 cm)
}

export type HydraulicColorMode = 'velocity' | 'priority' | 'diameter' | 'default';

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
  
  totalAsphaltAreaM2: number;
  totalAsphaltVolumeM3: number;
  
  pipes: PipeHydraulicData[];
  pipesMap: Map<string | number, PipeHydraulicData>;
}
