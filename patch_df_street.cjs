const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// 1. Update onExportClick
code = code.replace(
    "fetchStreets(points, ['STREETNAME'], () => {",
    "fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'], () => {"
);

// 2. Update field checking in handleApplyExport
code = code.replace(
    "if (autoFetchStreets && field.toLowerCase() === 'streetname') {",
    "if (autoFetchStreets && (field.toLowerCase() === 'streetname' || field === 'اسم الشارع' || field === 'الشارع')) {"
);

code = code.replace(
    "} else if (autoFetchStreets && field.toLowerCase() === 'streetname') {",
    "} else if (autoFetchStreets && (field.toLowerCase() === 'streetname' || field === 'اسم الشارع' || field === 'الشارع')) {"
);

const districtReplacement = `           } else if (autoFetchStreets && (field.toLowerCase() === 'district' || field === 'الحي')) {
               newAttrs[field] = p.district || val || (lang === 'ar' ? 'غير معروف' : 'Unknown');
           } else if (val) {`;

code = code.replace(
    "} else if (val) {",
    districtReplacement
);

const districtReplacementElse = `        } else if (autoFetchStreets && (field.toLowerCase() === 'district' || field === 'الحي')) {
          newAttrs[field] = p.district || (lang === 'ar' ? 'غير معروف' : 'Unknown');
        } else if (mapRules?.defaultValue !== undefined && mapRules?.defaultValue !== '') {`;

code = code.replace(
    "} else if (mapRules?.defaultValue !== undefined && mapRules?.defaultValue !== '') {",
    districtReplacementElse
);

fs.writeFileSync('components/DataFormatter.tsx', code);
