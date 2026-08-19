import { GeoPoint } from '../types';

export function getSampleInfrastructureProject(): GeoPoint[] {
  return [
    // 1. Sewer Gravity Pipeline - Segment 1
    {
      id: 'MH-101_to_MH-102',
      x: 46.6110,
      y: 24.8120,
      z: 624.50,
      type: 'LineString',
      layer: 'Sewer Network',
      description: 'خط انحدار صرف صحي رئيسي | القطر: 200 مم | المادة: uPVC | الشارع: شارع أنس بن مالك - حي الملقا',
      color: '#8b5cf6',
      diameter: '200',
      material: 'uPVC',
      street: 'شارع أنس بن مالك',
      district: 'حي الملقا - الرياض',
      permitNo: 'RYD-NWC-2026-0881',
      segmentId: 'SEW-MALQA-01',
      groundLevel: 624.50,
      invertLevel: 622.10,
      dropManhole: false,
      hydraulicSlope: 0.85,
      flowVelocity: 1.15,
      isCompliantSbc: true,
      path: [
        { x: 46.6110, y: 24.8120, z: 624.50 },
        { x: 46.6135, y: 24.8125, z: 624.20 },
        { x: 46.6160, y: 24.8130, z: 623.90 }
      ],
      originalLength: 520
    },
    // 2. Sewer Gravity Pipeline - Segment 2 (with Drop Manhole)
    {
      id: 'MH-102_to_MH-103',
      x: 46.6160,
      y: 24.8130,
      z: 623.90,
      type: 'LineString',
      layer: 'Sewer Network',
      description: 'خط انحدار صرف صحي (يحتوي على منهول هدار Drop Manhole) | القطر: 250 مم | المادة: uPVC',
      color: '#8b5cf6',
      diameter: '250',
      material: 'uPVC',
      street: 'شارع أنس بن مالك',
      district: 'حي الملقا - الرياض',
      permitNo: 'RYD-NWC-2026-0881',
      segmentId: 'SEW-MALQA-02',
      groundLevel: 623.90,
      invertLevel: 621.05,
      dropManhole: true, // Drop Manhole due to steep slope
      dropHeightM: 0.95,
      hydraulicSlope: 1.20,
      flowVelocity: 1.45,
      isCompliantSbc: true,
      path: [
        { x: 46.6160, y: 24.8130, z: 623.90 },
        { x: 46.6185, y: 24.8136, z: 622.80 },
        { x: 46.6210, y: 24.8142, z: 621.60 }
      ],
      originalLength: 540
    },
    // 3. Potable Water Main Distribution Pipe
    {
      id: 'W_MAIN_300_DI_MALQA',
      x: 46.6110,
      y: 24.8122,
      z: 624.50,
      type: 'LineString',
      layer: 'Water Network',
      description: 'خط مياه شرب رئيسي | القطر: 300 مم | المادة: حديد دكتايل Ductile Iron (DI) | خلوص رأسي آمن فوق الصرف',
      color: '#06b6d4',
      diameter: '300',
      material: 'Ductile Iron (DI)',
      street: 'شارع أنس بن مالك',
      district: 'حي الملقا - الرياض',
      permitNo: 'RYD-NWC-2026-0882',
      segmentId: 'WAT-MALQA-01',
      groundLevel: 624.50,
      invertLevel: 623.10, // Safe 1.0m above sewer invert level
      isCompliantSbc: true,
      path: [
        { x: 46.6110, y: 24.8122, z: 624.50 },
        { x: 46.6160, y: 24.8132, z: 623.90 },
        { x: 46.6210, y: 24.8144, z: 621.60 }
      ],
      originalLength: 1060
    },
    // 4. Stormwater Box Culvert
    {
      id: 'STORM_CULVERT_1200_RC',
      x: 46.6105,
      y: 24.8115,
      z: 624.60,
      type: 'LineString',
      layer: 'Stormwater Network',
      description: 'قناة تصريف سيول خرسانية | القطر: 1200 مم | المادة: خرسانة مسلحة RC | باتجاه وادي حنيفة',
      color: '#10b981',
      diameter: '1200',
      material: 'Reinforced Concrete',
      street: 'طريق الخير',
      district: 'حي الملقا - الرياض',
      permitNo: 'RYD-AMANAH-2026-0419',
      segmentId: 'STM-MALQA-01',
      groundLevel: 624.60,
      invertLevel: 621.50,
      isCompliantSbc: true,
      path: [
        { x: 46.6105, y: 24.8115, z: 624.60 },
        { x: 46.6130, y: 24.8120, z: 624.30 },
        { x: 46.6155, y: 24.8125, z: 623.80 },
        { x: 46.6180, y: 24.8130, z: 623.10 }
      ],
      originalLength: 820
    },
    // 5. Outfall Lift Station Manhole
    {
      id: 'OUTFALL_PUMP_STATION_01',
      x: 46.6210,
      y: 24.8142,
      z: 621.60,
      type: 'Point',
      layer: 'Sewer Outfall',
      description: 'نقطة المصب النهائي / محطة الرفع رقم 1 | السعة: 15,000 م3/يوم',
      color: '#ef4444',
      district: 'حي الملقا - الرياض',
      groundLevel: 621.60,
      invertLevel: 617.50
    }
  ];
}
