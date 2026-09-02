import { OpenLocationCode } from 'open-location-code';

const olc = new OpenLocationCode();

export const KNOWN_LOCALITIES: Array<{ names: string[]; lat: number; lon: number }> = [
  // Saudi Arabia - Major
  { names: ['riyadh', 'الرياض', 'ar riyad', 'riyadh 14', 'riyadh 11', 'riyadh 12', 'riyadh 13', 'riyadh 14511', 'al aziziyah', 'العزيزية', 'al amaer'], lat: 24.7136, lon: 46.6753 },
  { names: ['jeddah', 'جدة', 'jiddah'], lat: 21.5433, lon: 39.1728 },
  { names: ['makkah', 'مكة', 'mecca', 'al makkah'], lat: 21.3891, lon: 39.8579 },
  { names: ['madinah', 'المدينة', 'medina', 'al madinah'], lat: 24.5247, lon: 39.5692 },
  { names: ['dammam', 'الدمام'], lat: 26.4207, lon: 50.0888 },
  { names: ['khobar', 'الخبر', 'al khobar'], lat: 26.2172, lon: 50.1971 },
  { names: ['dhahran', 'الظهران'], lat: 26.2361, lon: 50.0393 },
  { names: ['jubail', 'الجبيل'], lat: 27.0174, lon: 49.6225 },
  { names: ['qassim', 'القصيم', 'buraidah', 'بريدة', 'onaizah', 'عنيزة', 'المذنب', 'البكيرية', 'الرس'], lat: 26.3592, lon: 43.9818 },
  { names: ['tabuk', 'تبوك', 'نيوم', 'neom'], lat: 28.3835, lon: 36.5662 },
  { names: ['abha', 'أبها', 'khamis', 'خميس مشيط', 'عسير', 'asir'], lat: 18.2164, lon: 42.5053 },
  { names: ['taif', 'الطائف'], lat: 21.2854, lon: 40.4222 },
  { names: ['hail', 'حائل'], lat: 27.5114, lon: 41.7208 },
  { names: ['jazan', 'جازان', 'jizan', 'جيزان'], lat: 16.8892, lon: 42.5511 },
  { names: ['najran', 'نجران'], lat: 17.5656, lon: 44.2289 },
  { names: ['yanbu', 'ينبع'], lat: 24.0895, lon: 38.0618 },
  { names: ['ahsa', 'الأحساء', 'hofuf', 'الهفوف', 'المبرز'], lat: 25.3800, lon: 49.5850 },
  { names: ['jouf', 'الجوف', 'sakaka', 'سكاكا', 'القريات'], lat: 29.9697, lon: 40.2064 },
  { names: ['arar', 'عرعر', 'طريف', 'رفحاء', 'الحدود الشمالية'], lat: 30.9753, lon: 41.0381 },
  { names: ['baha', 'الباحة', 'بلجرشي'], lat: 20.0129, lon: 41.4677 },
  { names: ['hafar', 'حفر الباطن'], lat: 28.4328, lon: 45.9708 },
  { names: ['kharj', 'الخرج'], lat: 24.1554, lon: 47.3119 },
  { names: ['ula', 'العلا'], lat: 26.6167, lon: 37.9167 },
  { names: ['dubai', 'دبي', 'uae', 'الإمارات'], lat: 25.2048, lon: 55.2708 },
  { names: ['abu dhabi', 'أبوظبي'], lat: 24.4539, lon: 54.3773 },
  { names: ['doha', 'الدوحة', 'qatar', 'قطر'], lat: 25.2854, lon: 51.5310 },
  { names: ['kuwait', 'الكويت'], lat: 29.3759, lon: 47.9774 },
  { names: ['bahrain', 'البحرين', 'manama', 'المنامة'], lat: 26.2285, lon: 50.5860 },
  { names: ['oman', 'عمان', 'muscat', 'مسقط'], lat: 23.5880, lon: 58.3829 },
  { names: ['cairo', 'القاهرة', 'egypt', 'مصر'], lat: 30.0444, lon: 31.2357 },
  { names: ['amman', 'عمان', 'الأردن', 'jordan'], lat: 31.9454, lon: 35.9284 },
];

/**
 * Decodes Open Location Code (Plus Code) from raw text or Google Maps URLs.
 */
export function decodePlusCode(text: string): { lat: number; lon: number } | null {
  if (!text || typeof text !== 'string') return null;

  let decodedStr = text;
  try {
    decodedStr = decodeURIComponent(decodeURIComponent(text));
  } catch (e) {}

  // Look for Plus Code patterns like "HQR7+2GH" or "7HP8HQR7+2GH" or "HQR7+2G"
  const plusCodeRegex = /\b([23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,4})\b/i;
  const match = decodedStr.match(plusCodeRegex);
  if (!match) return null;

  const code = match[1].toUpperCase();

  // 1. Full Plus Code (e.g. 7HP8HQR7+2GH)
  if (olc.isFull(code)) {
    try {
      const area = olc.decode(code);
      return { lat: area.latitudeCenter, lon: area.longitudeCenter };
    } catch (e) {
      console.warn("Full OLC decode error:", e);
    }
  }

  // 2. Short Plus Code with locality in the text (e.g. "HQR7+2GH Riyadh" or "HQR7+2GH, Al Aziziyah, Riyadh")
  const lower = decodedStr.toLowerCase();
  for (const loc of KNOWN_LOCALITIES) {
    if (loc.names.some(n => lower.includes(n.toLowerCase()))) {
      try {
        const fullCode = olc.recoverNearest(code, loc.lat, loc.lon);
        const area = olc.decode(fullCode);
        return { lat: area.latitudeCenter, lon: area.longitudeCenter };
      } catch (e) {}
    }
  }

  // 3. Fallback reference for Saudi Arabia (Center of KSA / Riyadh)
  try {
    const fullCode = olc.recoverNearest(code, 24.7136, 46.6753);
    const area = olc.decode(fullCode);
    return { lat: area.latitudeCenter, lon: area.longitudeCenter };
  } catch (e) {}

  return null;
}
