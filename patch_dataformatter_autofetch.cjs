const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// First, fix the templateFields filtering to include autofetched fields
code = code.replace(
    /const templateFields = TEMPLATES\[targetTemplate\]\.fields\.filter\(f => selectedFields\[targetTemplate\]\?\.includes\(f\) \?\? false\);/,
    `let templateFields = TEMPLATES[targetTemplate].fields.filter(f => selectedFields[targetTemplate]?.includes(f) ?? false);
    
    if (autoFetchStreets) {
        const fetchedFields = ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'];
        fetchedFields.forEach(f => {
            if (TEMPLATES[targetTemplate].fields.includes(f) && !templateFields.includes(f)) {
                templateFields.push(f);
            }
        });
    }`
);

// Second, fix the mapping logic inside templateFields.forEach
const oldLogic = `      templateFields.forEach(field => {
        const mapRules = mapping[field];
        if (mapRules?.sourceField) {
           let val = '';
           if (p.attributes && p.attributes[mapRules.sourceField] !== undefined) {
               val = p.attributes[mapRules.sourceField];
           } else if (p.originalRow && headers) {
               const idx = headers.indexOf(mapRules.sourceField);
               if (idx !== -1 && p.originalRow[idx] !== undefined) {
                   val = String(p.originalRow[idx]);
               }
           }
           
           mappedSourceFields.add(mapRules.sourceField);

           if ((field === 'Permit No' || field === 'ZONE') && val) {
               val = val.replace(/[^0-9]/g, '');
           }

           if (autoFetchStreets && (field.toLowerCase() === 'streetname' || field === 'اسم الشارع' || field === 'الشارع')) {
               newAttrs[field] = p.street || val || (lang === 'ar' ? 'غير معروف' : 'Unknown');
                      } else if (autoFetchStreets && (field.toLowerCase() === 'district' || field === 'الحي')) {
               newAttrs[field] = p.district || val || (lang === 'ar' ? 'غير معروف' : 'Unknown');
           } else if (val) {
               newAttrs[field] = val;
                   } else if (autoFetchStreets && (field.toLowerCase() === 'district' || field === 'الحي')) {
               newAttrs[field] = p.district || val || (lang === 'ar' ? 'غير معروف' : 'Unknown');
           } else {
               newAttrs[field] = mapRules.defaultValue || '';
           }
        } else {
           if (autoFetchStreets && (field.toLowerCase() === 'streetname' || field === 'اسم الشارع' || field === 'الشارع')) {
               newAttrs[field] = p.street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
           } else if (autoFetchStreets && (field.toLowerCase() === 'district' || field === 'الحي')) {
               newAttrs[field] = p.district || (lang === 'ar' ? 'غير معروف' : 'Unknown');
           } else {
               newAttrs[field] = mapRules?.defaultValue || '';
           }
        }
      });`;

// Replace the buggy loop body with the clean version
const regex = /templateFields\.forEach\(field => \{[\s\S]*?\}\);\n*      if \(retainUnmapped\)/;
const newLoop = `templateFields.forEach(field => {
        const mapRules = mapping[field];
        let val = '';
        if (mapRules?.sourceField) {
           if (p.attributes && p.attributes[mapRules.sourceField] !== undefined) {
               val = p.attributes[mapRules.sourceField];
           } else if (p.originalRow && headers) {
               const idx = headers.indexOf(mapRules.sourceField);
               if (idx !== -1 && p.originalRow[idx] !== undefined) {
                   val = String(p.originalRow[idx]);
               }
           }
           mappedSourceFields.add(mapRules.sourceField);

           if ((field === 'Permit No' || field === 'ZONE') && val) {
               val = val.replace(/[^0-9]/g, '');
           }
        }

        if (autoFetchStreets && (field.toLowerCase() === 'streetname' || field === 'اسم الشارع' || field === 'الشارع')) {
            newAttrs[field] = p.street || p.attributes?.['STREETNAME'] || p.attributes?.['اسم الشارع'] || val || (lang === 'ar' ? 'غير معروف' : 'Unknown');
        } else if (autoFetchStreets && (field.toLowerCase() === 'district' || field === 'الحي')) {
            newAttrs[field] = p.district || p.attributes?.['DISTRICT'] || p.attributes?.['الحي'] || val || (lang === 'ar' ? 'غير معروف' : 'Unknown');
        } else if (val) {
            newAttrs[field] = val;
        } else {
            newAttrs[field] = mapRules?.defaultValue || '';
        }
      });
      if (retainUnmapped)`;

code = code.replace(regex, newLoop);

fs.writeFileSync('components/DataFormatter.tsx', code);
