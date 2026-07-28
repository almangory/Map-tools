const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

const oldUI = `
              <div className="flex gap-2 flex-row-reverse">
                <button 
                  onClick={() => setKmzGroupOption('name')}
                  className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'name' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                >
                  {lang === 'ar' ? 'بالاسم' : 'By Name'}
                </button>
                <button 
                  onClick={() => setKmzGroupOption('color')}
                  className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'color' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                >
                  {lang === 'ar' ? 'باللون' : 'By Color'}
                </button>
                <button 
                  onClick={() => setKmzGroupOption('none')}
                  className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'none' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                >
                  {lang === 'ar' ? 'بدون' : 'None'}
                </button>
              </div>
`;

const newUI = `
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 flex-row-reverse">
                  <button 
                    onClick={() => setKmzGroupOption('name')}
                    className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'name' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                  >
                    {lang === 'ar' ? 'بالاسم' : 'By Name'}
                  </button>
                  <button 
                    onClick={() => setKmzGroupOption('color')}
                    className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'color' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                  >
                    {lang === 'ar' ? 'باللون' : 'By Color'}
                  </button>
                  <button 
                    onClick={() => setKmzGroupOption('column')}
                    className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'column' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                  >
                    {lang === 'ar' ? 'بالبيانات' : 'By Data'}
                  </button>
                  <button 
                    onClick={() => setKmzGroupOption('none')}
                    className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'none' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                  >
                    {lang === 'ar' ? 'بدون' : 'None'}
                  </button>
                </div>
                {kmzGroupOption === 'column' && (
                   <select 
                     value={selectedGroupColumn}
                     onChange={(e) => setSelectedGroupColumn(e.target.value)}
                     className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none focus:border-accent text-right"
                   >
                      <option value="" className="text-black">{lang === 'ar' ? 'اختر العمود للتجميع...' : 'Select column for grouping...'}</option>
                      {assetsHeaders.map(h => (
                         <option key={h} value={h} className="text-black">{h}</option>
                      ))}
                   </select>
                )}
              </div>
`;

code = code.replace(oldUI, newUI);

fs.writeFileSync('components/MapClassifier.tsx', code);
