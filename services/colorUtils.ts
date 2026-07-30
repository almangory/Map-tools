
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const hexToRgb = (hex: string): RGB | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
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
  key: 'executed_water' | 'executed_sewer' | 'in_progress' | 'remaining';
  nameAr: string;
  nameEn: string;
  color: string;
}

export const STATUS_CATEGORIES: StatusCategory[] = [
  { key: 'executed_water', nameAr: 'منفذ - مياه', nameEn: 'Executed - Water', color: '#01579B' },
  { key: 'executed_sewer', nameAr: 'منفذ - صرف', nameEn: 'Executed - Sewer', color: '#097138' },
  { key: 'in_progress', nameAr: 'جاري العمل', nameEn: 'Work in Progress', color: '#FFEA00' },
  { key: 'remaining', nameAr: 'أعمال متبقية', nameEn: 'Remaining Work', color: '#A52714' },
];

export const matchStatusByColor = (colorHex: string): StatusCategory => {
  const cleanHex = String(colorHex || '#DCB13C').trim().toUpperCase();
  const rgb = hexToRgb(cleanHex);
  if (!rgb) return STATUS_CATEGORIES[3];

  let minDistance = Infinity;
  let bestMatch = STATUS_CATEGORIES[3];

  for (const cat of STATUS_CATEGORIES) {
    const catRgb = hexToRgb(cat.color);
    if (catRgb) {
      const dist = Math.sqrt(
        Math.pow(rgb.r - catRgb.r, 2) +
        Math.pow(rgb.g - catRgb.g, 2) +
        Math.pow(rgb.b - catRgb.b, 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = cat;
      }
    }
  }

  return bestMatch;
};

