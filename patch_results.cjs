const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "              <div className=\"flex gap-2\">\n                <button \n                  onClick={() => setKmzGroupOption('name')}",
  "              <div className=\"flex gap-2 flex-row-reverse\">\n                <button \n                  onClick={() => setKmzGroupOption('name')}"
);

// We need to change the style of the container to match the image exactly. 
// The image has a blue-ish dark background with a border.
code = code.replace(
  "className=\"bg-transparent border border-white/5 p-6 rounded-3xl space-y-6\"",
  "className=\"bg-[#0b2d3d]/80 border border-white/10 p-6 rounded-[2rem] space-y-6\""
);

// We need to change the styling of the two bottom buttons
// "إكسل مدمج (الكل)" and "KMZ للأصول فقط"
// In the image, they have a solid background matching the panel background but slightly lighter? 
// No, they look like outlined/ghost buttons or slightly raised.
code = code.replace(
  "className=\"bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl py-6 flex flex-col items-center justify-center gap-3 transition-colors group\"",
  "className=\"bg-[#0f3b4c]/50 hover:bg-[#124258] border border-white/5 rounded-3xl py-6 flex flex-col items-center justify-center gap-3 transition-colors group shadow-inner\""
);
code = code.replace(
  "className=\"bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl py-6 flex flex-col items-center justify-center gap-3 transition-colors group\"",
  "className=\"bg-[#0f3b4c]/50 hover:bg-[#124258] border border-white/5 rounded-3xl py-6 flex flex-col items-center justify-center gap-3 transition-colors group shadow-inner\""
);

// The title "خيارات تجميع KMZ (للأصول):" should have a yellow folder icon.
code = code.replace(
  "<FolderInput className=\"w-5 h-5 text-accent\" />",
  "<FolderSearch className=\"w-5 h-5 text-accent\" />"
);

// The export excel button icon is a green spreadsheet.
// I already used FileSpreadsheet text-[#2ecc71].

fs.writeFileSync('components/MapClassifier.tsx', code);
