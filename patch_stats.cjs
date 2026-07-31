const fs = require('fs');
const file = 'components/FileComparator.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `const [stats, setStats] = useState<{added: number, deleted: number, modified: number, unchanged: number} | null>(null);`;
const replace1 = `const [stats, setStats] = useState<{added: number, deleted: number, modified: number, unchanged: number, diameterDiff?: number} | null>(null);`;

const target2 = `        const resultPoints: GeoPoint[] = [];
        let added = 0, deleted = 0, modified = 0, unchanged = 0;`;
const replace2 = `        const resultPoints: GeoPoint[] = [];
        let added = 0, deleted = 0, modified = 0, unchanged = 0, diameterDiff = 0;`;

const target3 = `                if (diameterChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#9c27b0', layer: lang === 'ar' ? 'اختلاف القطر' : 'Diameter Diff'}); 
                } else if (geomChanged || attrsChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#f59e0b', layer: lang === 'ar' ? 'تعديل' : 'Modified'}); 
                }`;
const replace3 = `                if (diameterChanged) {
                    diameterDiff++;
                    resultPoints.push({...p2, color: '#9c27b0', layer: lang === 'ar' ? 'اختلاف القطر' : 'Diameter Diff'}); 
                } else if (geomChanged || attrsChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#f59e0b', layer: lang === 'ar' ? 'تعديل' : 'Modified'}); 
                }`;

const target4 = `        setStats({ added, deleted, modified, unchanged });`;
const replace4 = `        setStats({ added, deleted, modified, unchanged, diameterDiff });`;

const target5 = `                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-black/30 p-4 rounded-2xl border border-green-500/20 flex flex-col items-center justify-center text-center">
                            <PlusCircle className="w-6 h-6 text-green-500 mb-2" />
                            <span className="text-2xl font-black text-green-500">{stats.added}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'تمت إضافتها' : 'Added'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-red-500/20 flex flex-col items-center justify-center text-center">
                            <XCircle className="w-6 h-6 text-red-500 mb-2" />
                            <span className="text-2xl font-black text-red-500">{stats.deleted}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'تم حذفها' : 'Deleted'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-orange-500/20 flex flex-col items-center justify-center text-center">
                            <PenTool className="w-6 h-6 text-orange-500 mb-2" />
                            <span className="text-2xl font-black text-orange-500">{stats.modified}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'تم تعديلها' : 'Modified'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-slate-500/20 flex flex-col items-center justify-center text-center">
                            <CheckCircle className="w-6 h-6 text-slate-400 mb-2" />
                            <span className="text-2xl font-black text-slate-400">{stats.unchanged}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'بدون تغيير' : 'Unchanged'}</span>
                        </div>
                    </div>`;
const replace5 = `                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-black/30 p-4 rounded-2xl border border-green-500/20 flex flex-col items-center justify-center text-center">
                            <PlusCircle className="w-6 h-6 text-green-500 mb-2" />
                            <span className="text-2xl font-black text-green-500">{stats.added}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'إضافة' : 'Added'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-black/50 flex flex-col items-center justify-center text-center shadow-lg">
                            <XCircle className="w-6 h-6 text-white/60 mb-2" />
                            <span className="text-2xl font-black text-white/80">{stats.deleted}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'نقص خطوط' : 'Missing'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-purple-500/20 flex flex-col items-center justify-center text-center">
                            <Info className="w-6 h-6 text-purple-500 mb-2" />
                            <span className="text-2xl font-black text-purple-500">{stats.diameterDiff || 0}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'اختلاف القطر' : 'Dia. Diff'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-orange-500/20 flex flex-col items-center justify-center text-center">
                            <PenTool className="w-6 h-6 text-orange-500 mb-2" />
                            <span className="text-2xl font-black text-orange-500">{stats.modified}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'تعديل آخر' : 'Modified'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-slate-500/20 flex flex-col items-center justify-center text-center">
                            <CheckCircle className="w-6 h-6 text-slate-400 mb-2" />
                            <span className="text-2xl font-black text-slate-400">{stats.unchanged}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'متطابق' : 'Matched'}</span>
                        </div>
                    </div>`;

content = content.replace(target1, replace1)
                 .replace(target2, replace2)
                 .replace(target3, replace3)
                 .replace(target4, replace4)
                 .replace(target5, replace5);
fs.writeFileSync(file, content, 'utf8');
console.log('patched stats view');
