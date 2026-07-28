const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// 1. Add grids to TEMPLATES
code = code.replace(
    /boundaries: \{\s*name: 'حدود ومساحة العقار \(Property Boundaries\)',\s*fields: \["الاتجاه", "الحدود حسب الطبيعة", "الطول \(حسب الطبيعة\)", "الحدود حسب الصك", "الطول \(حسب الصك\)", "الحدود حسب المخطط", "الطول \(حسب المخطط\)"\]\s*\}/,
    `boundaries: {
    name: 'حدود ومساحة العقار (Property Boundaries)',
    fields: ["الاتجاه", "الحدود حسب الطبيعة", "الطول (حسب الطبيعة)", "الحدود حسب الصك", "الطول (حسب الصك)", "الحدود حسب المخطط", "الطول (حسب المخطط)"]
  },
  grids: {
    name: 'شبكيات (Grids)',
    fields: ["اسم المشروع", "اسم المقاول", "الحي", "اسم الشارع", "نوع الشبكية", "اسم الشبكية", "وصف الاعمال", "مدة العزل بالساعة", "تاريخ بدأ التنفيذ حسب البرنامج الزمني", "تاريخ البدأ بعد التنسيق مع الجهات", "الملاحظات"]
  }`
);

// 2. Update useState type
code = code.replace(
    /useState\<'pipes' \| 'points' \| 'stations' \| 'polygons' \| 'boundaries' \| 'violations'\>\('pipes'\);/,
    `useState<'pipes' | 'points' | 'stations' | 'polygons' | 'boundaries' | 'violations' | 'grids'>('pipes');`
);

// 3. Add the button
const buttonCode = `                  <button onClick={() => setTargetTemplate('violations')} className={cn("flex-1 py-3 rounded-xl font-black text-xs transition-all", targetTemplate === 'violations' ? "bg-accent text-primary" : "bg-white/10 text-white/50 hover:bg-white/20")}>{TEMPLATES.violations.name}</button>
                  <button onClick={() => setTargetTemplate('grids')} className={cn("flex-1 py-3 rounded-xl font-black text-xs transition-all", targetTemplate === 'grids' ? "bg-accent text-primary" : "bg-white/10 text-white/50 hover:bg-white/20")}>{TEMPLATES.grids.name}</button>`;

code = code.replace(
    /\<button onClick=\{[(][)] =\> setTargetTemplate\('violations'\)\} className=\{cn\("flex-1 py-3 rounded-xl font-black text-xs transition-all", targetTemplate === 'violations' \? "bg-accent text-primary" : "bg-white\/10 text-white\/50 hover:bg-white\/20"\)\}>\{TEMPLATES\.violations\.name\}\<\/button>/,
    buttonCode
);

// 4. Update suffix
code = code.replace(
    /const suffix = targetTemplate === 'pipes' \? 'Lines' : targetTemplate === 'points' \? 'Points' : targetTemplate === 'stations' \? 'Stations' : targetTemplate === 'boundaries' \? 'Boundaries' : 'Polygons';/,
    `const suffix = targetTemplate === 'pipes' ? 'Lines' : targetTemplate === 'points' ? 'Points' : targetTemplate === 'stations' ? 'Stations' : targetTemplate === 'boundaries' ? 'Boundaries' : targetTemplate === 'grids' ? 'Grids' : targetTemplate === 'violations' ? 'Violations' : 'Polygons';`
);

fs.writeFileSync('components/DataFormatter.tsx', code);
