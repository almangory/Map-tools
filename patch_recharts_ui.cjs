const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const chartsUI = `                            {/* Interactive Charts */}
                            <div className="p-6 bg-[#0b2d3d]/80 rounded-[2.5rem] border border-white/5 shadow-xl space-y-6 animate-in slide-in-from-bottom duration-700">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <BarChart3 className="w-4 h-4 text-accent" />
                                    <h3 className="text-white font-black text-[11px] uppercase tracking-wider">
                                        {lang === 'ar' ? 'توزيع الأطوال (كم) حسب المادة والقطر' : 'Length Distribution (km) by Material & Diameter'}
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <h4 className="text-white/60 text-[10px] font-bold uppercase text-center">{lang === 'ar' ? 'حسب المادة' : 'By Material'}</h4>
                                        <div className="h-[200px] w-full">
                                            {materialDistribution.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RechartsPieChart>
                                                        <Pie data={materialDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, percent}) => \`\${name} (\${(percent * 100).toFixed(0)}%)\`}>
                                                            {materialDistribution.map((entry, index) => (
                                                                <Cell key={\`cell-\${index}\`} fill={PALETTE[index % PALETTE.length]} />
                                                            ))}
                                                        </Pie>
                                                        <RechartsTooltip contentStyle={{ backgroundColor: '#0b2d3d', borderColor: '#ffffff20', color: '#fff', fontSize: '10px' }} itemStyle={{ color: '#06b6d4' }} />
                                                    </RechartsPieChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-white/20 text-xs font-black">
                                                    <PieChart className="w-8 h-8 mb-2 opacity-20" />
                                                    {lang === 'ar' ? 'لا يوجد بيانات مواد' : 'No material data'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <h4 className="text-white/60 text-[10px] font-bold uppercase text-center">{lang === 'ar' ? 'حسب القطر' : 'By Diameter'}</h4>
                                        <div className="h-[200px] w-full">
                                            {diameterDistribution.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={diameterDistribution}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                                        <XAxis dataKey="name" tick={{ fill: '#ffffff60', fontSize: 9 }} axisLine={{ stroke: '#ffffff20' }} />
                                                        <YAxis tick={{ fill: '#ffffff60', fontSize: 9 }} axisLine={{ stroke: '#ffffff20' }} />
                                                        <RechartsTooltip contentStyle={{ backgroundColor: '#0b2d3d', borderColor: '#ffffff20', color: '#fff', fontSize: '10px' }} itemStyle={{ color: '#06b6d4' }} cursor={{ fill: '#ffffff05' }} />
                                                        <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-white/20 text-xs font-black">
                                                    <BarChart3 className="w-8 h-8 mb-2 opacity-20" />
                                                    {lang === 'ar' ? 'لا يوجد بيانات قطر' : 'No diameter data'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Spatial Overlap Detection */}`;

code = code.replace(
    /\{\/\* Spatial Overlap Detection \*\/\}/,
    chartsUI
);

fs.writeFileSync('App.tsx', code);
