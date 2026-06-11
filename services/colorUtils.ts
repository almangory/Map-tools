
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
    const upperColor = color.toUpperCase();
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
