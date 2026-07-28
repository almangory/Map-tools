const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    /"تاريخ البدأ بعد التنسيق مع الجهات", "الملاحظات"/,
    '"تاريخ البدأ بعد التنسيق مع الجهات", "التاريخ المتوقع للانتهاء", "الملاحظات"'
);

fs.writeFileSync('components/DataFormatter.tsx', code);
