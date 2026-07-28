const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const settingsModal = `
         {showSettingsModal && (
             <div className="absolute inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                 <div className="bg-[#0b2d3d] border border-accent/40 rounded-[3rem] w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_20px_50px_rgba(220,177,60,0.15)] overflow-hidden">
                     <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/20">
                         <div className="flex items-center gap-3">
                             <Settings2 className="w-6 h-6 text-accent" />
                             <h2 className="text-xl font-black text-white">{lang === 'ar' ? 'إعدادات التطبيق' : 'App Settings'}</h2>
                         </div>
                         <button onClick={() => setShowSettingsModal(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-all"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="p-8 overflow-y-auto space-y-8 flex-1">
                         <div className="space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'نوع خريطة الأساس' : 'Base Map Type'}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                  { id: 'satellite', name: lang === 'ar' ? 'القمر الصناعي' : 'Satellite', icon: <Globe className="w-5 h-5" /> },
                                  { id: 'streets', name: lang === 'ar' ? 'شوارع' : 'Streets', icon: <MapIcon className="w-5 h-5" /> },
                                  { id: 'terrain', name: lang === 'ar' ? 'تضاريس' : 'Terrain', icon: <Square className="w-5 h-5" /> },
                                  { id: 'osm', name: lang === 'ar' ? 'المفتوحة (OSM)' : 'OpenStreetMap', icon: <Globe className="w-5 h-5 opacity-50" /> }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setGlobalBaseMap(type.id as import('./types').BaseMapType)}
                                        className={"flex flex-col items-center gap-3 p-4 rounded-2xl transition-all border group " + (globalBaseMap === type.id ? "bg-accent/10 border-accent text-accent" : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10 hover:text-white")}
                                    >
                                        <div className={"p-2 rounded-xl transition-all " + (globalBaseMap === type.id ? "bg-accent text-[#0b2d3d]" : "bg-white/10 text-white/40 group-hover:text-white")}>
                                            {type.icon}
                                        </div>
                                        <span className="text-[11px] font-black uppercase text-center leading-tight">{type.name}</span>
                                    </button>
                                ))}
                            </div>
                         </div>
                     </div>
                 </div>
             </div>
         )}
`;

code = code.replace(
    "{showOverlapModal && overlapResults && (",
    settingsModal + "\n         {showOverlapModal && overlapResults && ("
);

// MapIcon is already imported in App.tsx as MapIcon, Globe as Globe is not?
fs.writeFileSync('App.tsx', code);
