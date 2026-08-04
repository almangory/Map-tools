const headers = ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'];
const hasStreetHeader = headers && headers.some(h => ['street', 'الشارع', 'اسم الشارع', 'streetname', 'district', 'الحي'].includes(String(h || '').toLowerCase()));
console.log("hasStreetHeader:", hasStreetHeader);
