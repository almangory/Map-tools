
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const normalizeHexToRgbHex = (hex: string): string => {
  let cleanHex = String(hex || '').trim().toUpperCase();
  if (cleanHex.startsWith('#')) cleanHex = cleanHex.substring(1);
  if (cleanHex.length === 8) cleanHex = cleanHex.substring(2); // Strip alpha
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  return '#' + cleanHex;
};

export const hexToRgb = (hex: string): RGB | null => {
  const cleanHex = normalizeHexToRgbHex(hex).substring(1);
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const colorDistance = (c1: string, c2: string): number => {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  if (!rgb1 || !rgb2) return 1000;
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
};

/**
 * Merges colors that are visually similar based on a threshold.
 * Returns a mapping from original color to a canonical "merged" color.
 */
export const getCanonicalColorMap = (colors: string[], threshold: number = 45): Record<string, string> => {
  const canonicals: string[] = [];
  const map: Record<string, string> = {};

  colors.forEach(color => {
    const upperColor = String(color || '').toUpperCase();
    if (map[upperColor]) return;

    // Check if this color is close to any existing canonical
    let found = false;
    for (const canonical of canonicals) {
      if (colorDistance(upperColor, canonical) < threshold) {
        map[upperColor] = canonical;
        found = true;
        break;
      }
    }

    if (!found) {
      canonicals.push(upperColor);
      map[upperColor] = upperColor;
    }
  });

  return map;
};

export interface StatusCategory {
  key: 'executed_water' | 'executed_sewer' | 'in_progress' | 'remaining' | 'cancelled';
  nameAr: string;
  nameEn: string;
  color: string;
}

export const STATUS_CATEGORIES: StatusCategory[] = [
  { key: 'executed_water', nameAr: 'منفذ - مياه', nameEn: 'Executed - Water', color: '#01579B' },
  { key: 'executed_sewer', nameAr: 'منفذ - صرف', nameEn: 'Executed - Sewer', color: '#097138' },
  { key: 'in_progress', nameAr: 'جاري العمل', nameEn: 'Work in Progress', color: '#FFEA00' },
  { key: 'remaining', nameAr: 'أعمال متبقية', nameEn: 'Remaining Work', color: '#A52714' },
  { key: 'cancelled', nameAr: 'أعمال تم الغائها', nameEn: 'Cancelled Works', color: '#F48FB1' },
];

export const EXACT_APPROVED_CODES: Record<string, StatusCategory> = {
  '#01579B': { key: 'executed_water', nameAr: 'منفذ - مياه', nameEn: 'Executed - Water', color: '#01579B' },
  '#097138': { key: 'executed_sewer', nameAr: 'منفذ - صرف', nameEn: 'Executed - Sewer', color: '#097138' },
  '#FFEA00': { key: 'in_progress', nameAr: 'جاري العمل', nameEn: 'Work in Progress', color: '#FFEA00' },
  '#A52714': { key: 'remaining', nameAr: 'أعمال متبقية', nameEn: 'Remaining Work', color: '#A52714' },
  '#F48FB1': { key: 'cancelled', nameAr: 'أعمال تم الغائها', nameEn: 'Cancelled Works', color: '#F48FB1' },
};

export const NON_COMPLIANT_CATEGORY = {
  key: 'non_compliant',
  nameAr: 'ألوان مخالفة للأكواد المعتمدة',
  nameEn: 'Non-Compliant Color Codes',
  color: '#EF4444'
};

export interface ColorComplianceResult {
  isCompliant: boolean;
  category: StatusCategory;
  distance: number;
  suggestedColor: string;
  reasonAr: string;
  reasonEn: string;
}

/**
 * Validates if a hex color complies with the approved project specifications.
 * Strict exact match: ONLY #01579B, #097138, #FFEA00, #A52714, #F48FB1 are compliant.
 * Any other color code is flagged as non-compliant (مخالف).
 */
export const checkColorCompliance = (colorHex: string): ColorComplianceResult => {
  const cleanHex = normalizeHexToRgbHex(colorHex);
  const rgb = hexToRgb(cleanHex);

  if (!rgb || cleanHex.length !== 7) {
    return {
      isCompliant: false,
      category: STATUS_CATEGORIES[3],
      distance: 999,
      suggestedColor: STATUS_CATEGORIES[3].color,
      reasonAr: `كود لون غير صالح أو غير معروف (${colorHex})`,
      reasonEn: `Invalid or unknown color code (${colorHex})`
    };
  }

  // Exact match verification
  if (EXACT_APPROVED_CODES[cleanHex]) {
    const matched = EXACT_APPROVED_CODES[cleanHex];
    return {
      isCompliant: true,
      category: matched,
      distance: 0,
      suggestedColor: matched.color,
      reasonAr: `مطابق تماماً للأكواد المعتمدة (${matched.nameAr} - ${matched.color})`,
      reasonEn: `Exact match with approved codes (${matched.nameEn} - ${matched.color})`
    };
  }

  // If not exact match, it is STRICTLY NON-COMPLIANT.
  // We calculate distance to find closest category for suggested auto-fix.
  let minDistance = Infinity;
  let bestCategory = STATUS_CATEGORIES[3];

  for (const cat of STATUS_CATEGORIES) {
    const dist = colorDistance(cleanHex, cat.color);
    if (dist < minDistance) {
      minDistance = dist;
      bestCategory = cat;
    }
  }

  return {
    isCompliant: false,
    category: bestCategory,
    distance: Math.round(minDistance),
    suggestedColor: bestCategory.color,
    reasonAr: `كود لون مخالف للمواصفات (${cleanHex}) - الأقرب المعتمد: ${bestCategory.nameAr} (${bestCategory.color})`,
    reasonEn: `Non-compliant color code (${cleanHex}) - Closest approved: ${bestCategory.nameEn} (${bestCategory.color})`
  };
};

export const REMAINING_WORK_COLOR = '#A52714';

export const isRemainingWorkColor = (colorHex: string, canonicalMap?: Record<string, string>): boolean => {
  if (!colorHex) return false;
  const cleanHex = normalizeHexToRgbHex(colorHex);
  if (cleanHex === REMAINING_WORK_COLOR) return true;
  if (canonicalMap && canonicalMap[colorHex]) {
    const mapped = normalizeHexToRgbHex(canonicalMap[colorHex]);
    if (mapped === REMAINING_WORK_COLOR) return true;
  }
  return colorDistance(cleanHex, REMAINING_WORK_COLOR) < 25;
};

export const matchStatusByColor = (colorHex: string): StatusCategory & { isCompliant?: boolean; complianceDistance?: number } => {
  const comp = checkColorCompliance(colorHex);
  return {
    ...comp.category,
    isCompliant: comp.isCompliant,
    complianceDistance: comp.distance
  };
};


