const fs = require('fs');

let appData = fs.readFileSync('App.tsx', 'utf8');

const exportComp = `
const UniversalExportBar = ({
  data,
  filename,
  lang,
  onExcelExport,
  isExecuting,
  onKmzExport
}: {
  data: GeoPoint[];
  filename: string;
  lang: Language;
  onExcelExport: () => void;
  isExecuting: boolean;
  onKmzExport: () => void;
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 w-full">
      <button 
        disabled={isExecuting}
        onClick={onKmzExport} 
        className="bg-[#0b2d3d] border border-accent/30 text-accent font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-accent hover:text-primary active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <DownloadCloud className="w-4 h-4" />
        {lang === 'ar' ? 'KMZ' : 'KMZ'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => downloadDXF(data, filename || 'Export')} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <PenTool className="w-4 h-4 text-orange-400" />
        {lang === 'ar' ? 'DXF' : 'DXF'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={onExcelExport} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileSpreadsheet className="w-4 h-4 text-green-500" />
        {lang === 'ar' ? 'إكسل' : 'Excel'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => downloadDataPDF(data, filename || 'Export', lang)} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileText className="w-4 h-4 text-[#D32F2F]" />
        {lang === 'ar' ? 'PDF' : 'PDF'}
      </button>
    </div>
  );
};
`;

// Insert the component before function App
appData = appData.replace('export default function App() {', exportComp + '\nexport default function App() {');

fs.writeFileSync('App.tsx', appData);
console.log('Component added');
