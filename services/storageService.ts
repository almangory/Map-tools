import * as XLSX from 'xlsx';
import { GeoPoint } from '../types';

export interface SavedProject {
  id: string; // Unique ID (e.g., proj_1720000000)
  name: string; // User project name or file name
  projectId?: string; // PROJECTID if extracted
  contractor?: string; // CONTRACTOR if extracted
  filename?: string;
  savedAt: string; // ISO timestamp
  totalElementsCount: number;
  validSegmentIdsCount: number;
  uniqueSegmentIdsCount: number;
  totalSegmentedLength: number; // in meters
  points: GeoPoint[];
  notes?: string;
}

const DB_NAME = 'GeoSpatialStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'saved_projects';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function getAllSavedProjects(): Promise<SavedProject[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result as SavedProject[]) || [];
        results.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error fetching saved projects:', err);
    return [];
  }
}

export async function saveProjectToDB(project: SavedProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllProjectsFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Attribute and geometry helpers
export function extractAttrValue(points: GeoPoint[], keyCandidates: string[], regexCandidates: RegExp[]): string {
  const foundSet = new Set<string>();
  for (const pt of points) {
    let valFound = '';
    if (pt.attributes) {
      for (const [k, v] of Object.entries(pt.attributes)) {
        if (v === undefined || v === null) continue;
        const cleanV = String(v).replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
        if (!cleanV || cleanV === 'null' || cleanV === 'undefined' || cleanV === '-' || cleanV === '0') continue;
        const kNorm = k.toLowerCase().replace(/[\s_#-]/g, '');
        for (const candidate of keyCandidates) {
          if (kNorm === candidate.toLowerCase().replace(/[\s_#-]/g, '')) {
            valFound = cleanV;
            break;
          }
        }
        if (valFound) break;
      }
    }
    if (!valFound && pt.description) {
      for (const rgx of regexCandidates) {
        const match = pt.description.match(rgx);
        if (match && match[1]) {
          const cleanV = String(match[1]).replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
          if (cleanV && cleanV !== 'null' && cleanV !== 'undefined' && cleanV !== '-' && cleanV !== '0') {
            valFound = cleanV;
            break;
          }
        }
      }
    }
    if (valFound) {
      foundSet.add(valFound);
    }
  }
  return Array.from(foundSet).join(' / ');
}

export function getMapLinkForPoints(pts: GeoPoint[]): string {
  if (!pts || pts.length === 0) return '';
  const firstPt = pts[0];
  let lat = firstPt.y;
  let lon = firstPt.x;
  if ((!lat || !lon) && firstPt.path && firstPt.path.length > 0) {
    lat = firstPt.path[0].y;
    lon = firstPt.path[0].x;
  }
  if (!lat || !lon) return '';
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

const SEGMENT_KEYS = [
  'SEGMENTID', 'SEGMENT_ID', 'SEGMENT ID', 'SegmentID', 'Segment Id', 'segment id', 'Segment_Id', 'segment_id',
  'SEGMENT', 'segment', 'SEGMENTNO', 'SEGMENT_NO', 'SEGMENT NO', 'SegmentNo', 'Segment No', 'segment no',
  'SEG ID', 'SEG_ID', 'SEGID', 'SegID', 'seg id', 'seg_id', 'segid', 'SEG', 'seg',
  'شريحة', 'شريحه', 'رقم الشريحة', 'كود الشريحة', 'معرف الشريحة', 'رقم شريحة', 'كود شريحة', 'معرف شريحة',
  'رقم القطاع', 'كود القطاع', 'معرف القطاع', 'قطاع', 'رقم القطع', 'كود القطع'
];
const SEGMENT_REGEXES = [
  /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id|segment\s*id|segment_id|segmentid|SEGMENT|segment|SEGMENTNO|SEGMENT_NO|SEGMENT\s*NO|SEG\s*ID|SEG_ID|SEGID|SEG|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|شريحة|شريحه|قطاع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
  /(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id|segment\s*id|segment_id|segmentid|SEGMENT|segment|SEGMENTNO|SEGMENT_NO|SEGMENT\s*NO|SEG\s*ID|SEG_ID|SEGID|SEG|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|شريحة|شريحه|قطاع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
];

const PROJECTNAME_KEYS = ['PROJECTNAME', 'PROJECT_NAME', 'PROJECT NAME', 'ProjectName', 'اسم المشروع', 'المشروع'];
const PROJECTNAME_REGEXES = [
  /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:PROJECTNAME|PROJECT_NAME|PROJECT\s*NAME|اسم\s*المشروع|المشروع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
  /(?:PROJECTNAME|PROJECT_NAME|PROJECT\s*NAME|اسم\s*المشروع|المشروع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
];

const PROJECTID_KEYS = ['PROJECTID', 'PROJECT_ID', 'PROJECT ID', 'ProjectId', 'رقم المشروع', 'رمز المشروع', 'كود المشروع'];
const PROJECTID_REGEXES = [
  /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:PROJECTID|PROJECT_ID|PROJECT\s*ID|رقم\s*المشروع|رمز\s*المشروع|كود\s*المشروع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
  /(?:PROJECTID|PROJECT_ID|PROJECT\s*ID|رقم\s*المشروع|رمز\s*المشروع|كود\s*المشروع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
];

const CONTRACTOR_KEYS = ['CONTRACTOR', 'Contractor', 'المقاول', 'اسم المقاول', 'المقاول المنفذ', 'CONTRACTOR_NAME', 'CONTRACTORNAME'];
const CONTRACTOR_REGEXES = [
  /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:CONTRACTOR|Contractor|المقاول|اسم\s*المقاول)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
  /(?:CONTRACTOR|Contractor|المقاول|اسم\s*المقاول)\s*[:=]\s*([^\r\n,;<>&|]+)/i
];

function calcPathLen(path: { x: number; y: number }[]): number {
  if (!path || path.length < 2) return 0;
  let dist = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const dx = (p2.x - p1.x) * (Math.PI / 180) * 6371000 * Math.cos(((p1.y + p2.y) / 2) * (Math.PI / 180));
    const dy = (p2.y - p1.y) * (Math.PI / 180) * 6371000;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  return dist;
}

export function exportAggregatedSegmentIdReport(projects: SavedProject[], lang: 'ar' | 'en' = 'ar'): void {
  if (!projects || projects.length === 0) return;

  // Aggregate Segment ID data across selected projects
  const uniqueSegmentMap: Record<string, {
    idValue: string;
    totalLength: number;
    count: number;
    points: GeoPoint[];
    projectNames: Set<string>;
    projectIds: Set<string>;
    contractors: Set<string>;
    savedProjectNames: Set<string>;
  }> = {};

  let grandTotalLengthWithSegmentId = 0;

  // Sheet 2 rows: line-by-line for all items (including duplicates across projects)
  const rowsSheet2: any[] = [];
  let itemCounter = 0;

  projects.forEach((proj) => {
    (proj.points || []).forEach((pt) => {
      const segId = extractAttrValue([pt], SEGMENT_KEYS, SEGMENT_REGEXES);
      if (!segId) return;

      let len = pt.originalLength || 0;
      if (len === 0 && pt.type === 'LineString' && pt.path) {
        len = calcPathLen(pt.path);
      }

      const ptProjName = extractAttrValue([pt], PROJECTNAME_KEYS, PROJECTNAME_REGEXES) || proj.name || '';
      const ptProjId = extractAttrValue([pt], PROJECTID_KEYS, PROJECTID_REGEXES) || proj.projectId || '';
      const ptContractor = extractAttrValue([pt], CONTRACTOR_KEYS, CONTRACTOR_REGEXES) || proj.contractor || '';

      grandTotalLengthWithSegmentId += len;

      if (!uniqueSegmentMap[segId]) {
        uniqueSegmentMap[segId] = {
          idValue: segId,
          totalLength: 0,
          count: 0,
          points: [],
          projectNames: new Set(),
          projectIds: new Set(),
          contractors: new Set(),
          savedProjectNames: new Set()
        };
      }

      uniqueSegmentMap[segId].totalLength += len;
      uniqueSegmentMap[segId].count += 1;
      uniqueSegmentMap[segId].points.push(pt);

      if (ptProjName) uniqueSegmentMap[segId].projectNames.add(ptProjName);
      if (ptProjId) uniqueSegmentMap[segId].projectIds.add(ptProjId);
      if (ptContractor) uniqueSegmentMap[segId].contractors.add(ptContractor);
      uniqueSegmentMap[segId].savedProjectNames.add(proj.name);

      itemCounter++;
      rowsSheet2.push({
        'اسم المشروع المصدر (Project File)': proj.name,
        'PROJECTNAME': ptProjName,
        'PROJECTID': ptProjId,
        'CONTRACTOR': ptContractor,
        'م': itemCounter,
        'Segment ID': segId,
        'الطول (متر)': len ? len.toFixed(2) : '0.00',
        'رابط موقع الخريطة (Google Maps Link)': getMapLinkForPoints([pt])
      });
    });
  });

  const uniqueSegmentList = Object.values(uniqueSegmentMap).sort((a, b) => b.totalLength - a.totalLength);

  // Sheet 1 rows: Unique Segment IDs Summary
  const rowsSheet1 = uniqueSegmentList.map((item, index) => ({
    'PROJECTNAME': Array.from(item.projectNames).join(' / '),
    'PROJECTID': Array.from(item.projectIds).join(' / '),
    'CONTRACTOR': Array.from(item.contractors).join(' / '),
    'المشاريع المحفوظة المتضمنة (Source Projects)': Array.from(item.savedProjectNames).join(' | '),
    'م': index + 1,
    'Segment ID': item.idValue,
    'عدد العناصر (Items Count)': item.count,
    'إجمالي الطول (متر)': (item.totalLength).toFixed(2),
    'إجمالي الطول (كيلومتر)': (item.totalLength / 1000).toFixed(3),
    'نسبة الأطوال (%)': ((item.totalLength / (grandTotalLengthWithSegmentId || 1)) * 100).toFixed(1) + '%',
    'رابط موقع الخريطة (Google Maps Link)': getMapLinkForPoints(item.points)
  }));

  const workbook = XLSX.utils.book_new();

  const worksheet1 = XLSX.utils.json_to_sheet(rowsSheet1);
  XLSX.utils.book_append_sheet(workbook, worksheet1, lang === 'ar' ? 'ملخص_Segment_ID_المجمع' : 'Aggregated_Segment_Summary');

  const worksheet2 = XLSX.utils.json_to_sheet(rowsSheet2);
  XLSX.utils.book_append_sheet(workbook, worksheet2, lang === 'ar' ? 'جميع_قيم_Segment_ID_المجمعة' : 'All_Segment_IDs_Aggregated');

  XLSX.writeFile(workbook, `Consolidated_Segment_ID_Report_${projects.length}_Projects_${Date.now()}.xlsx`);
}
