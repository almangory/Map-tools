const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const oldCheck1 = `<h4 className="text-white font-black text-sm">{lang === 'ar' ? 'جلب أسماء الشوارع' : 'Fetch Street Names'}</h4>`;
const newCheck1 = `<h4 className="text-white font-black text-sm">{lang === 'ar' ? 'جلب أسماء الشوارع والأحياء' : 'Fetch Streets & Districts'}</h4>`;

const oldCheck2 = `<p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'جلب أسماء الشوارع تلقائياً لكل عنصر وإضافتها لحقل STREETNAME.' : 'Automatically fetch street names for each element and add them to STREETNAME.'}</p>`;
const newCheck2 = `<p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'جلب أسماء الشوارع والأحياء تلقائياً لكل عنصر وإضافتها لحقلي STREETNAME و DISTRICT.' : 'Automatically fetch street and district names for each element and add them to STREETNAME and DISTRICT.'}</p>`;

code = code.replace(oldCheck1, newCheck1);
code = code.replace(oldCheck2, newCheck2);

fs.writeFileSync('components/DataFormatter.tsx', code);
console.log("Patched checkbox text");
