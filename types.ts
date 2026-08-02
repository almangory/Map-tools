
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
