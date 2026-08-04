const fs = require('fs');
let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const target = `    try {
        if (autoFetchStreets && fetchStreets) {
          const updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي']);
          await action(updatedPoints);`;

const replacement = `    try {
        if (autoFetchStreets && fetchStreets) {
          const confirmMsg = lang === 'ar' 
            ? 'لقد قمت بتفعيل خيار "جلب الشوارع". قد تستغرق هذه العملية بعض الوقت حسب عدد النقاط وسيتم استبدال قيم الشوارع الحالية. هل أنت متأكد من رغبتك في الاستمرار وتصدير البيانات؟'
            : 'You have enabled "Fetch Streets". This process may take some time depending on the number of points and will overwrite current street values. Are you sure you want to continue and export?';
          
          let proceed = true;
          try {
             proceed = window.confirm(confirmMsg);
          } catch(e) {
             console.warn("window.confirm not supported, proceeding automatically");
             proceed = true;
          }

          if (proceed) {
             const updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي']);
             await action(updatedPoints);
          }
`;

content = content.replace(target, replacement);

fs.writeFileSync('components/DataFormatter.tsx', content, 'utf8');
console.log("Added confirm back");
