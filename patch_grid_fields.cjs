const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    /"اسم الشبكية العاقدي"/g,
    '"اسم الشبكية التعاقدي"'
);

code = code.replace(
    /"التاريخ المتوقع للانتهاء", "الملاحظات"/g,
    '"التاريخ المتوقع للانتهاء", "طول الشبكية", "اعمق نقطة للشبكية", "عرض الشبكية", "الادارة الاشرافية", "الملاحظات"'
);

fs.writeFileSync('components/DataFormatter.tsx', code);
