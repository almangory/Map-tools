const UniversalExportBar = ({
  data,
  filename,
  lang,
  onExcelExport,
  isExecuting
}: {
  data: GeoPoint[];
  filename: string;
  lang: Language;
  onExcelExport: () => void;
  isExecuting: boolean;
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      <button 
        disabled={isExecuting}
        onClick={() => downloadKMZ(data, filename, { mode: 'none' })} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <DownloadCloud className="w-4 h-4 text-blue-400" />
        {lang === 'ar' ? 'تصدير KMZ' : 'Export KMZ'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => downloadDXF(data, filename)} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <PenTool className="w-4 h-4 text-orange-400" />
        {lang === 'ar' ? 'تصدير DXF' : 'Export DXF'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={onExcelExport} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileSpreadsheet className="w-4 h-4 text-green-500" />
        {lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => downloadDataPDF(data, filename, lang)} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileText className="w-4 h-4 text-red-500" />
        {lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
      </button>
    </div>
  );
};
