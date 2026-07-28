const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
    /const hasStreetHeader = headers && headers\.some\(h => \['street', 'الشارع', 'streetname'\]\.includes\(h\.toLowerCase\(\)\)\);/,
    "const hasStreetHeader = headers && headers.some(h => ['street', 'الشارع', 'streetname', 'district', 'الحي'].includes(h.toLowerCase()));"
);

code = code.replace(
    /if \(matchStreetName\) pt\.attributes\[matchStreetName\] = street \|\| \(lang === 'ar' \? 'غير معروف' : 'Unknown'\);/,
    `if (matchStreetName) pt.attributes[matchStreetName] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
          
          const matchDistrict = headers.find(h => h.toLowerCase() === 'district');
          const matchArabicDistrict = headers.find(h => h === 'الحي');
          if (matchDistrict) pt.attributes[matchDistrict] = pt.district || (lang === 'ar' ? 'غير معروف' : 'Unknown');
          if (matchArabicDistrict) pt.attributes[matchArabicDistrict] = pt.district || (lang === 'ar' ? 'غير معروف' : 'Unknown');`
);

fs.writeFileSync('App.tsx', code);
