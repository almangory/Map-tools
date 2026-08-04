const fs = require('fs');
let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// Add success state
content = content.replace('const [actionError, setActionError] = useState<string | null>(null);', 'const [actionError, setActionError] = useState<string | null>(null);\n  const [successMessage, setSuccessMessage] = useState<string | null>(null);');

// Update executeAction to clear success
content = content.replace('setActionError(null);', 'setActionError(null);\n    setSuccessMessage(null);');

// Add success to exports
content = content.replace('XLSX.writeFile(wb, `${getBaseFilename()}.xlsx`);', 'XLSX.writeFile(wb, `${getBaseFilename()}.xlsx`);\n      setSuccessMessage("تم تصدير ملف الإكسل بنجاح!");');
content = content.replace('doc.save(`${filename}.pdf`);', 'doc.save(`${filename}.pdf`);\n      setSuccessMessage("تم تصدير ملف PDF بنجاح!");');
content = content.replace('await downloadDXF(processedPoints, getBaseFilename());', 'await downloadDXF(processedPoints, getBaseFilename());\n      setSuccessMessage("تم تصدير ملف DXF بنجاح!");');
content = content.replace('}, templateFields, templateFields);', '}, templateFields, templateFields);\n      setSuccessMessage("تم تصدير ملف KMZ بنجاح!");');

// Add success UI
const errorDivIndex = content.indexOf('{actionError &&');
const injectPoint = content.indexOf('</div>}', errorDivIndex) + 7;
content = content.substring(0, injectPoint) + `\n      {successMessage && <div className="p-4 bg-green-500/20 border border-green-500 rounded-2xl text-green-100 font-bold mb-4">{successMessage}</div>}` + content.substring(injectPoint);

fs.writeFileSync('components/DataFormatter.tsx', content, 'utf8');
console.log("Added success UI");
