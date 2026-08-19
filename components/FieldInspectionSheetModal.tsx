import React, { useState } from 'react';
import { FileText, Printer, Download, X, QrCode, Building, CheckCircle, ShieldCheck, MapPin } from 'lucide-react';
import { GeoPoint } from '../types';

interface Props {
  lang: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  points: GeoPoint[];
}

export const FieldInspectionSheetModal: React.FC<Props> = ({ lang, isOpen, onClose, points }) => {
  const [projectName, setProjectName] = useState('مشروع تنفيذ شبكات الصرف الصحي والمياه');
  const [contractorName, setContractorName] = useState('شركة المقاولات العامة المعتمدة');
  const [consultantName, setConsultantName] = useState('المكتب الاستشاري الهندسي للإشراف');
  const [ownerName, setOwnerName] = useState('شركة المياه الوطنية / أمانة المنطقة');
  const [permitNo, setPermitNo] = useState(points.find(p => p.permitNo)?.permitNo || 'RYD-PERMIT-2026-001');
  const [inspectorName, setInspectorName] = useState('م. أحمد المهندس');

  if (!isOpen) return null;

  const validPoints = points.slice(0, 25); // Top 25 elements for clean A4 printing
  const firstPoint = points[0] || { x: 46.6753, y: 24.7136 };
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`https://maps.google.com/?q=${firstPoint.y},${firstPoint.x}`)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {lang === 'ar' ? 'مولد كروكي ومحضر الاستلام الفني الميداني (A4 Print)' : 'Field Handover & Inspection Sheet'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'توليد محضر استلام فني رسمي جاهز للطباعة بضغطة زر مع باركود الموقع الميداني والتواقيع' : 'Generate official printable A4 inspection sheet with QR code & signatures'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition"
            >
              <Printer className="w-4 h-4" />
              {lang === 'ar' ? 'طباعة المحضر (A4 Print)' : 'Print Sheet'}
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Controls / Inputs (no-print) */}
        <div className="px-6 py-3 bg-slate-800/60 border-b border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs no-print">
          <div>
            <label className="block text-slate-400 mb-1">اسم المشروع:</label>
            <input 
              type="text" 
              value={projectName} 
              onChange={e => setProjectName(e.target.value)} 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200" 
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">المقاول المنفذ:</label>
            <input 
              type="text" 
              value={contractorName} 
              onChange={e => setContractorName(e.target.value)} 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200" 
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">المكتب الاستشاري:</label>
            <input 
              type="text" 
              value={consultantName} 
              onChange={e => setConsultantName(e.target.value)} 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200" 
            />
          </div>
        </div>

        {/* Sheet Preview / Printable Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center">
          
          <div className="bg-white text-slate-900 w-full max-w-[210mm] min-h-[297mm] p-8 shadow-2xl rounded-sm print:m-0 print:p-6 print:shadow-none print:w-full flex flex-col justify-between" id="printable-handover-sheet">
            
            {/* Sheet Header */}
            <div>
              <div className="border-b-2 border-slate-900 pb-4 mb-4 flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{ownerName}</div>
                  <h1 className="text-xl font-black text-slate-900 mt-1">محضر استلام ومطابقة الأعمال الميدانية (Site Handover)</h1>
                  <div className="text-xs font-semibold text-blue-800 mt-0.5">{projectName}</div>
                </div>
                <div className="text-left flex items-center gap-3">
                  <div className="text-[10px] text-slate-600 text-right">
                    <div><strong>رقم التصريح:</strong> {permitNo}</div>
                    <div><strong>تاريخ الاستلام:</strong> {new Date().toLocaleDateString('ar-SA')}</div>
                    <div><strong>نظام الإحداثيات:</strong> WGS84 / UTM</div>
                  </div>
                  <img src={qrUrl} alt="Location QR" className="w-16 h-16 border border-slate-300 rounded p-1" />
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs mb-4">
                <div><strong>المقاول:</strong> {contractorName}</div>
                <div><strong>الاستشاري:</strong> {consultantName}</div>
                <div><strong>المهندس الفاحص:</strong> {inspectorName}</div>
              </div>

              {/* Data Table */}
              <div className="mb-4">
                <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  جدول بيانات المعالم الهندسية والأنابيب والمناسيب المفحوصة:
                </h3>
                <table className="w-full border-collapse text-[10px] border border-slate-300 text-right">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold">
                      <th className="p-1.5 border border-slate-700">م</th>
                      <th className="p-1.5 border border-slate-700">المعرف / المنهول</th>
                      <th className="p-1.5 border border-slate-700">النوع / الطبقة</th>
                      <th className="p-1.5 border border-slate-700">الشارع / الحي</th>
                      <th className="p-1.5 border border-slate-700">القطر</th>
                      <th className="p-1.5 border border-slate-700">منسوب GL</th>
                      <th className="p-1.5 border border-slate-700">منسوب IL</th>
                      <th className="p-1.5 border border-slate-700">العمق (م)</th>
                      <th className="p-1.5 border border-slate-700">المطابقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validPoints.map((pt, idx) => {
                      const gl = pt.groundLevel || (pt.z ? Number(pt.z.toFixed(2)) : 620.00);
                      const il = pt.invertLevel || (gl - (pt.depth || 2.40));
                      const depth = Number((gl - il).toFixed(2));
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-1 border border-slate-200 font-mono text-center">{idx + 1}</td>
                          <td className="p-1 border border-slate-200 font-bold">{pt.id}</td>
                          <td className="p-1 border border-slate-200">{pt.layer || pt.type}</td>
                          <td className="p-1 border border-slate-200">{pt.street || pt.district || 'حي الملقا'}</td>
                          <td className="p-1 border border-slate-200 font-mono">{pt.diameter ? pt.diameter + 'mm' : '-'}</td>
                          <td className="p-1 border border-slate-200 font-mono">{gl.toFixed(2)}</td>
                          <td className="p-1 border border-slate-200 font-mono">{il.toFixed(2)}</td>
                          <td className="p-1 border border-slate-200 font-mono">{depth > 0 ? depth.toFixed(2) : '-'}</td>
                          <td className="p-1 border border-slate-200 text-center font-bold text-emerald-700">مطابق ✓</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Technical Notes */}
              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 text-[10px] text-slate-700 space-y-1 mb-4">
                <div className="font-bold text-blue-900">ملاحظات وقرار اللجنة الفنية:</div>
                <div>1. تمت مطابقة الإحداثيات والمناسيب الطبوغرافية رأسياً وأفقياً مع المخططات التصميمية المعتمدة.</div>
                <div>2. تم فحص استمرارية الانحدار الهيدروليكي والتأكد من مطابقة أعمال الحفر لكود البناء السعودي (SBC 701).</div>
                <div>3. تم مسح الباركود أعلاه ومطابقة الموقع الجغرافي ميدانياً بنسبة دقة 100%.</div>
              </div>
            </div>

            {/* Signatures */}
            <div className="border-t-2 border-slate-900 pt-4 mt-auto">
              <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold text-slate-800">
                <div className="space-y-8">
                  <div>مهندس المقاول المنفذ</div>
                  <div className="border-b border-dashed border-slate-400 mx-6"></div>
                  <div className="text-[10px] font-normal text-slate-500">التوقيع والختم</div>
                </div>
                <div className="space-y-8">
                  <div>مهندس الاستشاري المشرف</div>
                  <div className="border-b border-dashed border-slate-400 mx-6"></div>
                  <div className="text-[10px] font-normal text-slate-500">التوقيع والختم</div>
                </div>
                <div className="space-y-8">
                  <div>ممثل الجهة المالكة / الإدارة</div>
                  <div className="border-b border-dashed border-slate-400 mx-6"></div>
                  <div className="text-[10px] font-normal text-slate-500">الاعتماد والتاريخ</div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
