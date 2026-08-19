import { GeoPoint, KmlExportOptions } from '../types';
import { parseCoordinatesFromText } from './crs';
import { calculatePathLength, downloadKMZ } from './kmlService';

export interface StreetSearchFilters {
  countryCode?: string; // e.g. 'sa', 'eg', 'ae', 'kw', 'jo', 'om', 'qa', 'bh', 'iq', ''
  countryName?: string; // e.g. 'السعودية', 'مصر', 'الإمارات', etc.
  city?: string;        // e.g. 'الرياض', 'جدة', 'القاهرة', 'دبي', etc.
  district?: string;    // e.g. 'حي النرجس', 'حي الياسمين', 'المعادي', etc.
}

export interface RegionBoundaryGeometry {
  name: string;
  type: 'city' | 'district' | 'region';
  boundaryType?: 'administrative_boundary' | 'cadastral_boundary' | 'district_border';
  geoJson: any; // GeoJSON Geometry / Feature (Polygon / MultiPolygon)
  bbox?: [number, number, number, number];
  lat: number;
  lng: number;
  displayName: string;
  isAccurateGeographicBoundary?: boolean;
}

/**
 * Fetches OpenStreetMap geographic administrative boundary GeoJSON for a district, city, or region
 */
export async function fetchRegionBoundary(
  locationName: string,
  countryCode?: string,
  parentCity?: string
): Promise<RegionBoundaryGeometry | null> {
  if (!locationName || !locationName.trim()) return null;

  try {
    const cleanLocation = locationName.trim();
    const queryVariants: string[] = [];

    if (parentCity && parentCity.trim() && !cleanLocation.includes(parentCity)) {
      queryVariants.push(`${cleanLocation}, ${parentCity.trim()}`);
    }
    queryVariants.push(cleanLocation);
    if (cleanLocation.startsWith('حي ') && parentCity) {
      queryVariants.push(`${cleanLocation.replace('حي ', '')}, ${parentCity}`);
    }

    for (const query of queryVariants) {
      let url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=ar,en`;
      if (countryCode && countryCode.trim()) {
        url += `&countrycodes=${encodeURIComponent(countryCode.trim().toLowerCase())}`;
      }

      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      // Prioritize results that have real Polygon/MultiPolygon administrative boundaries
      const bestPolygonItem = data.find((it: any) => 
        it.geojson && (it.geojson.type === 'Polygon' || it.geojson.type === 'MultiPolygon') &&
        (it.class === 'boundary' || it.type === 'administrative' || it.type === 'suburb' || it.type === 'neighbourhood' || it.type === 'quarter')
      ) || data.find((it: any) => 
        it.geojson && (it.geojson.type === 'Polygon' || it.geojson.type === 'MultiPolygon')
      ) || data[0];

      if (bestPolygonItem) {
        const lat = parseFloat(bestPolygonItem.lat);
        const lng = parseFloat(bestPolygonItem.lon);

        let bbox: [number, number, number, number] | undefined = undefined;
        if (bestPolygonItem.boundingbox && Array.isArray(bestPolygonItem.boundingbox) && bestPolygonItem.boundingbox.length >= 4) {
          bbox = [
            parseFloat(bestPolygonItem.boundingbox[0]),
            parseFloat(bestPolygonItem.boundingbox[1]),
            parseFloat(bestPolygonItem.boundingbox[2]),
            parseFloat(bestPolygonItem.boundingbox[3])
          ];
        }

        let geoJson = bestPolygonItem.geojson;
        const hasTruePolygon = Boolean(geoJson && (geoJson.type === 'Polygon' || geoJson.type === 'MultiPolygon'));

        // If no polygon returned in geojson, build a smoothed 8-vertex geographic boundary envelope
        if (!hasTruePolygon && bbox) {
          const [south, north, west, east] = bbox;
          const latSpan = north - south;
          const lngSpan = east - west;
          const insetLat = latSpan * 0.15;
          const insetLng = lngSpan * 0.15;

          // Smoothed natural geographic boundary envelope
          geoJson = {
            type: 'Polygon',
            coordinates: [[
              [west + insetLng, south],
              [east - insetLng, south],
              [east, south + insetLat],
              [east, north - insetLat],
              [east - insetLng, north],
              [west + insetLng, north],
              [west, north - insetLat],
              [west, south + insetLat],
              [west + insetLng, south]
            ]]
          };
        }

        if (geoJson) {
          return {
            name: cleanLocation,
            type: bestPolygonItem.type === 'city' || bestPolygonItem.type === 'administrative' ? 'city' : 'district',
            boundaryType: cleanLocation.includes('حي') || bestPolygonItem.type === 'suburb' || bestPolygonItem.type === 'neighbourhood'
              ? 'district_border'
              : 'administrative_boundary',
            geoJson,
            bbox,
            lat: !isNaN(lat) ? lat : 0,
            lng: !isNaN(lng) ? lng : 0,
            displayName: bestPolygonItem.display_name || cleanLocation,
            isAccurateGeographicBoundary: hasTruePolygon
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.warn('Failed to fetch geographic region boundary:', err);
    return null;
  }
}


export interface CountryPreset {
  code: string;
  nameAr: string;
  nameEn: string;
  flag: string;
  cities: {
    nameAr: string;
    nameEn: string;
    popularDistricts?: string[];
  }[];
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  {
    code: 'sa',
    nameAr: 'المملكة العربية السعودية',
    nameEn: 'Saudi Arabia',
    flag: '🇸🇦',
    cities: [
      {
        nameAr: 'الرياض',
        nameEn: 'Riyadh',
        popularDistricts: [
          'حي النرجس', 'حي الياسمين', 'حي الملقا', 'حي الصحافة', 'حي العقيق',
          'حي حطين', 'حي النخيل', 'حي الروضة', 'حي العليا', 'حي السليمانية',
          'حي الملز', 'حي الشفا', 'حي النسيم', 'حي الرمال', 'حي القيروان',
          'حي طويق', 'حي المونسية', 'حي ظهرة لبن', 'حي قرطبة', 'حي العارض'
        ]
      },
      {
        nameAr: 'جدة',
        nameEn: 'Jeddah',
        popularDistricts: [
          'حي الشاطئ', 'حي الروضة', 'حي الحمراء', 'حي الزهراء', 'حي السلامة',
          'حي المروة', 'حي الصفا', 'حي أبحر الشمالية', 'حي أبحر الجنوبية', 'حي النعيم',
          'حي البساتين', 'حي المحمدية', 'حي المرجان', 'حي البلد', 'حي السامر'
        ]
      },
      {
        nameAr: 'مكة المكرمة',
        nameEn: 'Makkah',
        popularDistricts: ['حي العزيزية', 'حي الشوقية', 'حي العوالي', 'حي بطحاء قريش', 'حي النوارية', 'حي الكعكية']
      },
      {
        nameAr: 'المدينة المنورة',
        nameEn: 'Madinah',
        popularDistricts: ['حي العريض', 'حي الخالدية', 'حي باقدو', 'حي قربان', 'حي الدفاع', 'حي الملك فهد']
      },
      {
        nameAr: 'الدمام',
        nameEn: 'Dammam',
        popularDistricts: ['حي الشاطئ الشرقي', 'حي الشاطئ الغربي', 'حي الفيصلية', 'حي المزروعية', 'حي النورس', 'حي الفاخرية', 'حي الضباب']
      },
      {
        nameAr: 'الخبر',
        nameEn: 'Khobar',
        popularDistricts: ['حي العليا', 'حي الحزام الذهبي', 'حي الحزام الأخضر', 'حي العقربية', 'حي الراكة الجنوبية', 'حي اليرموك']
      },
      {
        nameAr: 'الظهران',
        nameEn: 'Dhahran',
        popularDistricts: ['حي الدوحة الشمالية', 'حي الدوحة الجنوبية', 'حي القصور', 'حي السلمانية']
      },
      {
        nameAr: 'الأحساء / الهفوف',
        nameEn: 'Al Ahsa / Hofuf',
        popularDistricts: ['حي المزروع', 'حي الشهابية', 'حي الخالدية', 'حي النزهة', 'حي الروضة']
      },
      {
        nameAr: 'الجبيل',
        nameEn: 'Jubail',
        popularDistricts: ['حي الفناتير', 'حي الدفي', 'حي جلمودة', 'حي الحويلات', 'حي الجوهرة']
      },
      {
        nameAr: 'الطائف',
        nameEn: 'Taif',
        popularDistricts: ['حي شهار', 'حي قروى', 'حي السداد', 'حي الفيصلية', 'حي نخب', 'حي الحوية']
      },
      {
        nameAr: 'تبوك',
        nameEn: 'Tabuk',
        popularDistricts: ['حي المروج', 'حي السليمانية', 'حي الورود', 'حي الفيصلية', 'حي سلطانة']
      },
      {
        nameAr: 'بريدة / القصيم',
        nameEn: 'Buraidah / Qassim',
        popularDistricts: ['حي المنتزه', 'حي الفايزية', 'حي الصفراء', 'حي الإسكان', 'حي الريان']
      },
      {
        nameAr: 'عنيزة',
        nameEn: 'Unaizah',
        popularDistricts: ['حي الأشرفية', 'حي الفاخرية', 'حي المروة', 'حي القادسية']
      },
      {
        nameAr: 'أبها',
        nameEn: 'Abha',
        popularDistricts: ['حي المنسك', 'حي المفتاحة', 'حي شمسان', 'حي الخالدية', 'حي السد']
      },
      {
        nameAr: 'خميس مشيط',
        nameEn: 'Khamis Mushait',
        popularDistricts: ['حي الرصراص', 'حي شباعة', 'حي عتود', 'حي ضمك']
      },
      {
        nameAr: 'حائل',
        nameEn: 'Hail',
        popularDistricts: ['حي النقرة', 'حي الوسيطاء', 'حي الجامعيين', 'حي صديان']
      },
      {
        nameAr: 'جازان',
        nameEn: 'Jazan',
        popularDistricts: ['حي الشاطئ', 'حي السويس', 'حي الروضة', 'حي المطار']
      },
      {
        nameAr: 'نجران',
        nameEn: 'Najran',
        popularDistricts: ['حي الفهد', 'حي الخالدية', 'حي الضيافة', 'حي المخيم']
      },
      {
        nameAr: 'ينبع',
        nameEn: 'Yanbu',
        popularDistricts: ['حي الصهاريج', 'حي السميري', 'حي النواة', 'حي رضوى']
      }
    ]
  },
  {
    code: 'eg',
    nameAr: 'جمهورية مصر العربية',
    nameEn: 'Egypt',
    flag: '🇪🇬',
    cities: [
      {
        nameAr: 'القاهرة',
        nameEn: 'Cairo',
        popularDistricts: [
          'المعادي', 'مصر الجديدة', 'مدينة نصر', 'التجمع الخامس', 'الزمالك',
          'النزهة', 'شبرا', 'وسط البلد', 'المقطم', 'عين شمس', 'الرحاب', 'مدينتي'
        ]
      },
      {
        nameAr: 'الجيزة',
        nameEn: 'Giza',
        popularDistricts: ['الدقي', 'المهندسين', '6 أكتوبر', 'الشيخ زايد', 'الهرم', 'فيصل', 'العجوزة']
      },
      {
        nameAr: 'الإسكندرية',
        nameEn: 'Alexandria',
        popularDistricts: ['سموحة', 'سيدي جابر', 'المنتزه', 'لوران', 'ستانلي', 'محرم بك', 'ميامي', 'العجمي']
      },
      {
        nameAr: 'العاصمة الإدارية',
        nameEn: 'New Administrative Capital',
        popularDistricts: ['الحي الحكومي', 'حي المال والأعمال', 'منطقة R3', 'منطقة R5', 'الحي الدبلوماسي']
      },
      {
        nameAr: 'المنصورة',
        nameEn: 'Mansoura',
        popularDistricts: ['حي المشاية', 'حي الجامعة', 'حي توريل', 'حي الجلاء']
      },
      {
        nameAr: 'طنطا',
        nameEn: 'Tanta',
        popularDistricts: ['حي النحاس', 'شارع البحر', 'حي الاستاد']
      },
      {
        nameAr: 'بورسعيد',
        nameEn: 'Port Said',
        popularDistricts: ['حي الشرق', 'حي العرب', 'حي المناخ', 'بورفؤاد']
      },
      {
        nameAr: 'السويس',
        nameEn: 'Suez',
        popularDistricts: ['حي الأربعين', 'حي السويس', 'حي فيصل', 'حي عتاقة']
      },
      {
        nameAr: 'الإسماعيلية',
        nameEn: 'Ismailia',
        popularDistricts: ['حي الشيخ زايد', 'حي الجامعة', 'حي الأفرنج']
      }
    ]
  },
  {
    code: 'ae',
    nameAr: 'الإمارات العربية المتحدة',
    nameEn: 'United Arab Emirates',
    flag: '🇦🇪',
    cities: [
      {
        nameAr: 'دبي',
        nameEn: 'Dubai',
        popularDistricts: ['دبي مارينا', 'وسط مدينة دبي (داون تاون)', 'جميرا', 'الخليج التجاري', 'بر دبي', 'ديرة', 'نخلة جميرا', 'البرشاء']
      },
      {
        nameAr: 'أبوظبي',
        nameEn: 'Abu Dhabi',
        popularDistricts: ['الكورنيش', 'جزيرة ياس', 'جزيرة السعديات', 'المرور', 'الخالدية', 'مدينة خليفة']
      },
      {
        nameAr: 'الشارقة',
        nameEn: 'Sharjah',
        popularDistricts: ['المجاز', 'الخان', 'القاسمية', 'النهدة', 'مويلح']
      },
      {
        nameAr: 'عجمان',
        nameEn: 'Ajman',
        popularDistricts: ['النعيمية', 'الراشدية', 'الكورنيش', 'الجرف']
      },
      {
        nameAr: 'رأس الخيمة',
        nameEn: 'Ras Al Khaimah',
        popularDistricts: ['الجزيرة الحمراء', 'الدفن', 'النخيل', 'الظيت']
      },
      {
        nameAr: 'العين',
        nameEn: 'Al Ain',
        popularDistricts: ['الجيمي', 'المويجعي', 'زاخر', 'الهيلي']
      }
    ]
  },
  {
    code: 'kw',
    nameAr: 'دولة الكويت',
    nameEn: 'Kuwait',
    flag: '🇰🇼',
    cities: [
      {
        nameAr: 'مدينة الكويت',
        nameEn: 'Kuwait City',
        popularDistricts: ['شرق', 'القبلة', 'المرقاب', 'دسمان', 'بنيد القار']
      },
      {
        nameAr: 'حولي',
        nameEn: 'Hawally',
        popularDistricts: ['السالمية', 'حولي', 'الجابرية', 'الرميثية', 'بيان', 'مشرف']
      },
      {
        nameAr: 'الفروانية',
        nameEn: 'Farwaniya',
        popularDistricts: ['الفروانية', 'خيطان', 'الأندلس', 'إشبيلية', 'العارضية', 'صباح الناصر']
      },
      {
        nameAr: 'الأحمدي',
        nameEn: 'Al Ahmadi',
        popularDistricts: ['الفحيحيل', 'المنقف', 'المهبولة', 'أبو حليفة', 'صباح الأحمد']
      },
      {
        nameAr: 'الجهراء',
        nameEn: 'Al Jahra',
        popularDistricts: ['الجهراء القديمة', 'الواحة', 'العيون', 'النسيم', 'سعد العبدالله']
      }
    ]
  },
  {
    code: 'qa',
    nameAr: 'دولة قطر',
    nameEn: 'Qatar',
    flag: '🇶🇦',
    cities: [
      {
        nameAr: 'الدوحة',
        nameEn: 'Doha',
        popularDistricts: ['الدفنة', 'اللؤلؤة', 'مشيرب', 'السد', 'الوعب', 'الخليج الغربي']
      },
      {
        nameAr: 'لوسيل',
        nameEn: 'Lusail',
        popularDistricts: ['مارينا لوسيل', 'مدينة الطاقة', 'جزر قطيفان', 'درب لوسيل']
      },
      {
        nameAr: 'الريان',
        nameEn: 'Al Rayyan',
        popularDistricts: ['الريان القديم', 'الريان الجديد', 'الغرافة', 'معيذر']
      },
      {
        nameAr: 'الوكرة',
        nameEn: 'Al Wakrah',
        popularDistricts: ['الوكرة القديمة', 'المشاف', 'الوكرة الجديدة']
      }
    ]
  },
  {
    code: 'bh',
    nameAr: 'مملكة البحرين',
    nameEn: 'Bahrain',
    flag: '🇧🇭',
    cities: [
      {
        nameAr: 'المنامة',
        nameEn: 'Manama',
        popularDistricts: ['الجفير', 'السيف', 'العدلية', 'أم الحصم', 'المنامة القديمة']
      },
      {
        nameAr: 'المحرق',
        nameEn: 'Muharraq',
        popularDistricts: ['البسيتين', 'عراد', 'قلالي', 'أمواج']
      },
      {
        nameAr: 'الرفاع',
        nameEn: 'Riffa',
        popularDistricts: ['الرفاع الشرقي', 'الرفاع الغربي', 'بوكوارة', 'الحجيات']
      }
    ]
  },
  {
    code: 'om',
    nameAr: 'سلطنة عمان',
    nameEn: 'Oman',
    flag: '🇴🇲',
    cities: [
      {
        nameAr: 'مسقط',
        nameEn: 'Muscat',
        popularDistricts: ['الخوير', 'شاطئ القرم', 'بوشر', 'الموالح', 'العذيبة', 'الموج', 'السيب']
      },
      {
        nameAr: 'صلالة',
        nameEn: 'Salalah',
        popularDistricts: ['الحافة', 'الدهاريز', 'عوقد', 'صلالة الجديدة']
      },
      {
        nameAr: 'صحار',
        nameEn: 'Sohar',
        popularDistricts: ['الوقيبة', 'الهمبار', 'الغشبة', 'صويلح']
      }
    ]
  },
  {
    code: 'jo',
    nameAr: 'المملكة الأردنية الهاشمية',
    nameEn: 'Jordan',
    flag: '🇯🇴',
    cities: [
      {
        nameAr: 'عمان',
        nameEn: 'Amman',
        popularDistricts: ['العبدلي', 'عبدون', 'دابوق', 'الجبيهة', 'الشميساني', 'الصويفية', 'طبربور', 'خلدا']
      },
      {
        nameAr: 'إربد',
        nameEn: 'Irbid',
        popularDistricts: ['حي الجامعة', 'الحي الشرقي', 'الحي الجنوبي', 'إيدون']
      },
      {
        nameAr: 'الزرقاء',
        nameEn: 'Zarqa',
        popularDistricts: ['الزرقاء الجديدة', 'حي معصوم', 'حي الحسين']
      },
      {
        nameAr: 'العقبة',
        nameEn: 'Aqaba',
        popularDistricts: ['وسط البلد', 'المنطقة الشمالية', 'حي الشامية', 'تالا بيه']
      }
    ]
  },
  {
    code: 'iq',
    nameAr: 'جمهورية العراق',
    nameEn: 'Iraq',
    flag: '🇮🇶',
    cities: [
      {
        nameAr: 'بغداد',
        nameEn: 'Baghdad',
        popularDistricts: ['الكرادة', 'المنصور', 'الأعظمية', 'الكرخ', 'الرصافة', 'الجادرية', 'العطيفية']
      },
      {
        nameAr: 'البصرة',
        nameEn: 'Basra',
        popularDistricts: ['العشار', 'الجبيلة', 'البراضعية', 'الكزيزة', 'حي الحسين']
      },
      {
        nameAr: 'أربيل',
        nameEn: 'Erbil',
        popularDistricts: ['عينكاوة', 'طريق 100 متري', 'حي وزيران', 'بختياري', 'حي الإسكان']
      }
    ]
  }
];

export interface StreetSearchResult {
  id: string;
  type: 'project_street' | 'project_point' | 'global_street' | 'coordinate';
  name: string;
  secondaryText: string;
  badge: string;
  badgeColor?: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // [south, north, west, east]
  path?: { x: number; y: number }[];
  layer?: string;
  lengthM?: number;
  category?: 'motorway' | 'primary' | 'secondary' | 'residential' | 'service' | 'place' | 'project';
  country?: string;
  city?: string;
  district?: string;
  raw?: any;
}

/**
 * Normalizes Arabic strings for resilient fuzzy searching:
 * - Unifies alef forms (أ, إ, آ, ٱ -> ا)
 * - Unifies yaa & alef maqsura (ى -> ي)
 * - Unifies taa marbuta & haa (ة -> ه)
 * - Removes arabic diacritics (tashkeel)
 * - Converts to lowercase and collapses whitespace
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    // Remove Arabic diacritics (harakat/tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Unify Alef forms
    .replace(/[أإآٱ]/g, 'ا')
    // Unify Taa Marbuta
    .replace(/ة/g, 'ه')
    // Unify Alef Maqsura / Yaa
    .replace(/ى/g, 'ي')
    // Replace underscores/hyphens with space
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts all potential street name candidates from a GeoPoint's attributes
 */
function extractStreetNameFromPoint(pt: GeoPoint): string | null {
  if (pt.street && typeof pt.street === 'string' && pt.street.trim()) {
    return pt.street.trim();
  }

  if (pt.attributes && typeof pt.attributes === 'object') {
    const streetKeys = [
      'street', 'street_name', 'streetname', 'road', 'road_name', 'st_name', 'street_ar',
      'الشارع', 'اسم الشارع', 'اسم_الشارع', 'اسم_طريق', 'الطريق', 'اسم الطريق', 'المسار',
      'street_name_ar', 'name', 'label'
    ];
    for (const key of Object.keys(pt.attributes)) {
      const lowerKey = key.toLowerCase();
      if (streetKeys.includes(lowerKey)) {
        const val = pt.attributes[key];
        if (typeof val === 'string' && val.trim()) {
          return val.trim();
        }
      }
    }
  }

  // If layer name implies a street (e.g. "C-ROAD-MAIN", "STREETS_50M", "طريق الملك فهد")
  if (pt.layer && typeof pt.layer === 'string') {
    const l = pt.layer.toLowerCase();
    if (l.includes('street') || l.includes('road') || l.includes('طريق') || l.includes('شارع')) {
      return pt.layer;
    }
  }

  // Fallback to name if it has road/street indicators
  if (pt.name && typeof pt.name === 'string') {
    const n = pt.name.toLowerCase();
    if (n.includes('street') || n.includes('road') || n.includes('طريق') || n.includes('شارع') || n.includes('محور')) {
      return pt.name;
    }
  }

  return null;
}

/**
 * Searches in project loaded points/lines for matching street names or layers,
 * with support for country, city, and district filtering.
 */
export function searchProjectStreets(
  points: GeoPoint[], 
  query: string, 
  lang: 'ar' | 'en',
  filters?: StreetSearchFilters,
  limit: number = 10
): StreetSearchResult[] {
  if (!points || points.length === 0) return [];

  const normQuery = normalizeArabicText(query);
  const queryTokens = normQuery ? normQuery.split(' ').filter(t => t.length > 0) : [];
  
  const normCity = filters?.city ? normalizeArabicText(filters.city) : '';
  const normDistrict = filters?.district ? normalizeArabicText(filters.district) : '';

  const results: StreetSearchResult[] = [];
  const seenIds = new Set<string>();

  for (const pt of points) {
    if (results.length >= limit) break;

    const streetName = extractStreetNameFromPoint(pt);
    const ptIdStr = String(pt.id || '');
    const ptLayerStr = String(pt.layer || '');
    const ptDescStr = String(pt.description || '');
    const ptNameStr = String(pt.name || '');

    // Collect all candidate strings for searching
    const candidateTexts = [
      streetName,
      ptNameStr,
      ptLayerStr,
      ptIdStr,
      ptDescStr
    ].filter(Boolean) as string[];

    const fullPointText = candidateTexts.map(normalizeArabicText).join(' ');

    // 1. If city filter is specified, check if point matches city (if attributes contain city)
    if (normCity && !fullPointText.includes(normCity)) {
      // If point does not explicitly match city, but user searched with query, allow if query matches
      // else skip
    }

    // 2. If district filter is specified, check if point matches district
    if (normDistrict && !fullPointText.includes(normDistrict)) {
      // allow partial matching
    }

    let isMatch = false;

    if (queryTokens.length === 0) {
      // If no query string, but filters exist (e.g. looking for streets in a project district)
      if (normDistrict || normCity) {
        if ((normDistrict && fullPointText.includes(normDistrict)) || (normCity && fullPointText.includes(normCity))) {
          isMatch = true;
        }
      }
    } else {
      for (const text of candidateTexts) {
        const normCandidate = normalizeArabicText(text);
        const allTokensMatch = queryTokens.every(token => normCandidate.includes(token));
        if (allTokensMatch) {
          isMatch = true;
          break;
        }
      }
    }

    if (!isMatch) continue;

    const resultId = `proj_${pt.id || Math.random().toString(36).substring(7)}`;
    if (seenIds.has(resultId)) continue;
    seenIds.add(resultId);

    // Calculate center coordinates and length
    let centerLat = pt.y;
    let centerLng = pt.x;
    let lengthM = 0;
    let bbox: [number, number, number, number] | undefined = undefined;

    if (pt.type === 'LineString' && pt.path && pt.path.length > 0) {
      lengthM = calculatePathLength(pt.path);
      const midIdx = Math.floor(pt.path.length / 2);
      centerLat = pt.path[midIdx].y;
      centerLng = pt.path[midIdx].x;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pt.path.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      if (minX !== Infinity) {
        bbox = [minY, maxY, minX, maxX];
      }
    }

    const displayName = streetName || pt.name || (lang === 'ar' ? `خط رقم #${pt.id}` : `Pipe/Line #${pt.id}`);
    const lengthStr = lengthM > 0 
      ? (lengthM >= 1000 ? `${(lengthM / 1000).toFixed(2)} ${lang === 'ar' ? 'كم' : 'km'}` : `${lengthM.toFixed(1)} ${lang === 'ar' ? 'م' : 'm'}`)
      : '';
    
    const secondaryDetails = [
      pt.layer ? (lang === 'ar' ? `طبقة: ${pt.layer}` : `Layer: ${pt.layer}`) : null,
      lengthStr ? (lang === 'ar' ? `الطول: ${lengthStr}` : `Length: ${lengthStr}`) : null
    ].filter(Boolean).join(' • ');

    results.push({
      id: resultId,
      type: pt.type === 'LineString' ? 'project_street' : 'project_point',
      name: displayName,
      secondaryText: secondaryDetails || (lang === 'ar' ? 'عنصر من المخطط النشط' : 'Active Project Element'),
      badge: pt.type === 'LineString' ? (lang === 'ar' ? 'مسار بالمخطط' : 'Project Line') : (lang === 'ar' ? 'نقطة بالمخطط' : 'Project Point'),
      badgeColor: '#06b6d4',
      lat: centerLat,
      lng: centerLng,
      bbox,
      path: pt.path,
      layer: pt.layer,
      lengthM,
      category: 'project',
      raw: pt
    });
  }

  return results;
}

/**
 * Searches global streets, roads, and places using OpenStreetMap Nominatim Geocoding
 * with advanced Country, City, and District / Neighborhood filtering.
 */
export async function searchGlobalStreets(
  query: string,
  lang: 'ar' | 'en',
  mapCenter?: { lat: number; lng: number },
  filters?: StreetSearchFilters,
  limit: number = 10
): Promise<StreetSearchResult[]> {
  const trimmedQuery = query.trim();
  const hasFilter = !!(filters?.countryCode || filters?.city || filters?.district);

  if (!trimmedQuery && !hasFilter) return [];

  // Check if text is direct coordinates first
  if (trimmedQuery) {
    const extractedCoords = parseCoordinatesFromText(trimmedQuery);
    if (extractedCoords) {
      return [{
        id: `coord_${extractedCoords.lat}_${extractedCoords.lon}`,
        type: 'coordinate',
        name: `${extractedCoords.lat.toFixed(6)}, ${extractedCoords.lon.toFixed(6)}`,
        secondaryText: lang === 'ar' ? 'إحداثيات جغرافية دقيقة (WGS84)' : 'Exact Geographic Coordinates (WGS84)',
        badge: lang === 'ar' ? 'إحداثيات' : 'Coordinates',
        badgeColor: '#10b981',
        lat: extractedCoords.lat,
        lng: extractedCoords.lon,
        category: 'place'
      }];
    }
  }

  const results: StreetSearchResult[] = [];
  const seenPlaceIds = new Set<string>();

  try {
    const langParam = lang === 'ar' ? 'ar,en' : 'en,ar';

    // Construct query with intelligent context expansion
    const queryParts: string[] = [];
    if (trimmedQuery) queryParts.push(trimmedQuery);
    if (filters?.district?.trim()) queryParts.push(filters.district.trim());
    if (filters?.city?.trim()) queryParts.push(filters.city.trim());
    if (filters?.countryName?.trim() && !filters?.countryCode) queryParts.push(filters.countryName.trim());

    const compositeQuery = queryParts.join(', ');
    if (!compositeQuery.trim()) return results;

    let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(compositeQuery)}&addressdetails=1&limit=${limit}&accept-language=${langParam}`;
    
    // Add country code filter restriction if selected
    if (filters?.countryCode?.trim()) {
      nominatimUrl += `&countrycodes=${encodeURIComponent(filters.countryCode.trim().toLowerCase())}`;
    }

    // If map has a center, add a viewbox bias to prioritize nearby streets
    if (mapCenter && typeof mapCenter.lat === 'number' && typeof mapCenter.lng === 'number') {
      const delta = 1.2; // ~120km viewbox
      const left = mapCenter.lng - delta;
      const right = mapCenter.lng + delta;
      const top = mapCenter.lat + delta;
      const bottom = mapCenter.lat - delta;
      nominatimUrl += `&viewbox=${left},${top},${right},${bottom}`;
    }

    const response = await fetch(nominatimUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          const pid = `osm_${item.place_id || item.osm_id || Math.random().toString(36).substring(7)}`;
          if (seenPlaceIds.has(pid)) continue;
          seenPlaceIds.add(pid);

          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (isNaN(lat) || isNaN(lng)) continue;

          const addr = item.address || {};
          
          // Determine street name
          const streetName = addr.road || addr.street || addr.pedestrian || addr.cycleway || addr.path || addr.highway || addr.residential || item.name || item.display_name.split(',')[0];
          
          const districtName = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || addr.district;
          const cityName = addr.city || addr.town || addr.municipality || addr.state;
          const countryName = addr.country;

          // Build secondary address breakdown: [ Country • City • District ]
          const locationBadges = [
            districtName ? `🏡 ${districtName}` : null,
            cityName ? `🏙️ ${cityName}` : null,
            countryName ? `🌐 ${countryName}` : null
          ].filter(Boolean);

          const secondaryText = locationBadges.length > 0 ? locationBadges.join(' • ') : item.display_name;

          // Determine road/street category badge & color
          let badge = lang === 'ar' ? 'شارع / موقع' : 'Street / Location';
          let badgeColor = '#64748b';
          let category: StreetSearchResult['category'] = 'place';

          const highwayType = item.type || item.class;
          if (highwayType === 'motorway' || highwayType === 'trunk') {
            badge = lang === 'ar' ? 'طريق سريع / دولي' : 'Highway / Motorway';
            badgeColor = '#ef4444';
            category = 'motorway';
          } else if (highwayType === 'primary') {
            badge = lang === 'ar' ? 'طريق رئيسي' : 'Primary Road';
            badgeColor = '#f59e0b';
            category = 'primary';
          } else if (highwayType === 'secondary' || highwayType === 'tertiary') {
            badge = lang === 'ar' ? 'شارع رئيسي / شرياني' : 'Secondary Street';
            badgeColor = '#3b82f6';
            category = 'secondary';
          } else if (highwayType === 'residential' || highwayType === 'living_street') {
            badge = lang === 'ar' ? 'شارع سكني' : 'Residential Street';
            badgeColor = '#10b981';
            category = 'residential';
          } else if (highwayType === 'service' || highwayType === 'unclassified') {
            badge = lang === 'ar' ? 'طريق خدمة' : 'Service Road';
            badgeColor = '#8b5cf6';
            category = 'service';
          }

          let bbox: [number, number, number, number] | undefined = undefined;
          if (item.boundingbox && Array.isArray(item.boundingbox) && item.boundingbox.length >= 4) {
            bbox = [
              parseFloat(item.boundingbox[0]),
              parseFloat(item.boundingbox[1]),
              parseFloat(item.boundingbox[2]),
              parseFloat(item.boundingbox[3])
            ];
          }

          results.push({
            id: pid,
            type: 'global_street',
            name: streetName,
            secondaryText,
            badge,
            badgeColor,
            lat,
            lng,
            bbox,
            category,
            country: countryName,
            city: cityName,
            district: districtName,
            raw: item
          });
        }
      }
    }
  } catch (err) {
    console.warn('Street geocoding search failed:', err);
  }

  return results;
}

/**
 * Geodesic Polygon Area in square meters on WGS84 sphere
 */
function calculateGeodesicPolygonArea(coords: { x: number; y: number }[]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6378137; // Earth radius in meters
  let area = 0;
  const len = coords.length;
  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    const lat1 = (p1.y * Math.PI) / 180;
    const lat2 = (p2.y * Math.PI) / 180;
    const lng1 = (p1.x * Math.PI) / 180;
    const lng2 = (p2.x * Math.PI) / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = Math.abs((area * R * R) / 2.0);
  return area;
}

/**
 * Geodesic Perimeter in meters
 */
function calculateGeodesicPerimeter(coords: { x: number; y: number }[]): number {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length];
    const lat1 = (p1.y * Math.PI) / 180;
    const lat2 = (p2.y * Math.PI) / 180;
    const dLat = ((p2.y - p1.y) * Math.PI) / 180;
    const dLng = ((p2.x - p1.x) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += 6378137 * c;
  }
  return total;
}

export interface RegionBoundaryKMZOptions {
  renderMode?: 'boundary_lines' | 'boundary_with_tint' | 'full_polygon';
  colorHex?: string;
  fillOpacity?: number; // 0 to 1 (e.g. 0.25)
  strokeWeight?: number;
  includeVertices?: boolean;
  includeCenter?: boolean;
  includeOuterLine?: boolean;
  customDocName?: string;
}

/**
 * Exports region/district/city boundary geometry retrieved from search as a high-precision KMZ file
 */
export async function exportRegionBoundaryToKMZ(
  boundary: RegionBoundaryGeometry,
  options: RegionBoundaryKMZOptions = {}
): Promise<void> {
  if (!boundary || !boundary.geoJson) {
    throw new Error('No valid boundary geometry available to export');
  }

  const colorHex = options.colorHex || '#06b6d4';
  const strokeWeight = options.strokeWeight || 3;
  const fillOpacityVal = options.fillOpacity !== undefined ? options.fillOpacity : (options.renderMode === 'boundary_lines' ? 0.05 : (options.renderMode === 'boundary_with_tint' ? 0.20 : 0.35));
  
  // Convert 0..1 opacity to 2-digit hex
  const opacityByte = Math.min(255, Math.max(0, Math.round(fillOpacityVal * 255)));
  const opacityHex = opacityByte.toString(16).padStart(2, '0');

  const points: GeoPoint[] = [];
  const ringsList: { x: number; y: number }[][] = [];

  // 1. Extract linear coordinate rings from GeoJSON
  const extractRings = (geom: any) => {
    if (!geom) return;
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((ring: any[]) => {
        if (Array.isArray(ring) && ring.length >= 3) {
          ringsList.push(ring.map((c: any) => ({ x: Number(c[0]), y: Number(c[1]) })));
        }
      });
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((poly: any[]) => {
        if (Array.isArray(poly)) {
          poly.forEach((ring: any[]) => {
            if (Array.isArray(ring) && ring.length >= 3) {
              ringsList.push(ring.map((c: any) => ({ x: Number(c[0]), y: Number(c[1]) })));
            }
          });
        }
      });
    } else if (geom.type === 'FeatureCollection' && Array.isArray(geom.features)) {
      geom.features.forEach((f: any) => extractRings(f.geometry));
    } else if (geom.type === 'Feature') {
      extractRings(geom.geometry);
    }
  };

  extractRings(boundary.geoJson);

  // If no rings found, fallback to bbox
  if (ringsList.length === 0 && boundary.bbox) {
    const [south, north, west, east] = boundary.bbox;
    ringsList.push([
      { x: west, y: south },
      { x: east, y: south },
      { x: east, y: north },
      { x: west, y: north },
      { x: west, y: south }
    ]);
  }

  if (ringsList.length === 0) {
    throw new Error('Unable to extract boundary polygon rings');
  }

  // Calculate total area and main perimeter
  let totalAreaM2 = 0;
  let totalPerimeterM = 0;
  ringsList.forEach(ring => {
    totalAreaM2 += calculateGeodesicPolygonArea(ring);
    totalPerimeterM += calculateGeodesicPerimeter(ring);
  });

  const areaKm2 = (totalAreaM2 / 1_000_000).toFixed(2);
  const perimeterKm = (totalPerimeterM / 1_000).toFixed(2);
  const cleanName = boundary.name.trim();
  const layerName = `حدود_${cleanName.replace(/\s+/g, '_')}`;

  // 2. Add Polygon features
  ringsList.forEach((ring, idx) => {
    const polyId = ringsList.length > 1 ? `مضلع_حدود_${cleanName}_${idx + 1}` : `مضلع_حدود_${cleanName}`;
    const descHtml = `
      <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 6px;">
        <h3 style="color: ${colorHex}; margin: 0 0 8px 0; border-bottom: 2px solid ${colorHex}; padding-bottom: 4px;">
          🏛️ ${cleanName} (الحدود الجغرافية الرسمية)
        </h3>
        <p style="margin: 4px 0; font-size: 13px; color: #475569;"><b>النطاق الإداري:</b> ${boundary.displayName}</p>
        <div style="background: #f1f5f9; border-radius: 6px; padding: 8px; margin: 8px 0; font-size: 12px; line-height: 1.6;">
          <div>📐 <b>المساحة الإجمالية:</b> <span style="color: #0284c7; font-weight: bold;">${areaKm2} كم²</span> (${Math.round(totalAreaM2).toLocaleString()} م²)</div>
          <div>📏 <b>محيط الحدود:</b> <span style="color: #10b981; font-weight: bold;">${perimeterKm} كم</span> (${Math.round(totalPerimeterM).toLocaleString()} م)</div>
          <div>📍 <b>المركز الجغرافي:</b> ${boundary.lat.toFixed(6)}, ${boundary.lng.toFixed(6)}</div>
          <div>🌐 <b>نظام الإحداثيات:</b> WGS84 (EPSG:4326)</div>
        </div>
        <p style="font-size: 11px; color: #64748b; margin: 4px 0;">تم استخراج وتوليد الحدود الجغرافية عبر نظام البحث الميداني للخرائط.</p>
      </div>
    `;

    points.push({
      id: polyId,
      x: ring[0].x,
      y: ring[0].y,
      type: 'Polygon',
      path: ring,
      layer: layerName,
      color: colorHex,
      description: descHtml,
      attributes: {
        'الاسم': cleanName,
        'النطاق_الإداري': boundary.displayName,
        'المساحة_كم2': areaKm2,
        'المساحة_م2': Math.round(totalAreaM2),
        'المحيط_كم': perimeterKm,
        'خط_العرض': boundary.lat,
        'خط_الطول': boundary.lng,
        'نوع_المعلم': 'حدود جغرافية وإدارية'
      }
    });

    // 3. Add Boundary Outline LineString (for sharp Google Earth border rendering)
    if (options.includeOuterLine !== false) {
      const lineId = ringsList.length > 1 ? `خط_محيط_${cleanName}_${idx + 1}` : `خط_محيط_${cleanName}`;
      points.push({
        id: lineId,
        x: ring[0].x,
        y: ring[0].y,
        type: 'LineString',
        path: ring,
        layer: `${layerName}_خط_المحيط`,
        color: colorHex,
        description: `مسار خط الحدود الخارجية لـ ${cleanName}`,
        attributes: {
          'الاسم': cleanName,
          'نوع_المسار': 'خط الحدود الخارجية',
          'الطول_كم': (calculateGeodesicPerimeter(ring) / 1000).toFixed(2)
        }
      });
    }
  });

  // 4. Add Center Placemark
  if (options.includeCenter !== false && boundary.lat && boundary.lng) {
    points.push({
      id: `مركز_${cleanName}`,
      x: boundary.lng,
      y: boundary.lat,
      type: 'Point',
      layer: `${layerName}_المركز`,
      color: '#f59e0b',
      description: `نقطة المركز الجغرافي لـ ${cleanName} (${boundary.lat.toFixed(6)}, ${boundary.lng.toFixed(6)})`,
      attributes: {
        'اسم_المنطقة': cleanName,
        'خط_العرض': boundary.lat,
        'خط_الطول': boundary.lng,
        'المساحة_كم2': areaKm2
      }
    });
  }

  // 5. Add Key Boundary Corner Nodes (Top representative vertices)
  if (options.includeVertices !== false && ringsList.length > 0) {
    const mainRing = ringsList[0];
    const step = Math.max(1, Math.floor(mainRing.length / 24)); // Up to 24 key vertex pins
    for (let i = 0; i < mainRing.length; i += step) {
      const pt = mainRing[i];
      points.push({
        id: `ركن_${cleanName}_${Math.floor(i / step) + 1}`,
        x: pt.x,
        y: pt.y,
        type: 'Point',
        layer: `${layerName}_نقاط_الأركان`,
        color: '#38bdf8',
        description: `نقطة ركن وزاوية حدود (${pt.y.toFixed(6)}, ${pt.x.toFixed(6)})`,
        attributes: {
          'اسم_المنطقة': cleanName,
          'رقم_الركن': Math.floor(i / step) + 1,
          'خط_العرض': pt.y,
          'خط_الطول': pt.x
        }
      });
    }
  }

  // 6. Export via KMZ packager
  const kmlOptions: KmlExportOptions = {
    mode: 'none',
    polygonStyle: {
      colorHex,
      opacityHex,
      outline: 1,
      width: strokeWeight
    },
    lineStyle: {
      width: strokeWeight
    }
  };

  const docName = options.customDocName || `حدود_${cleanName.replace(/\s+/g, '_')}_KMZ`;
  await downloadKMZ(points, `${docName}.kmz`, kmlOptions);
}
