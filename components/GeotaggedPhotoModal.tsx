import React, { useState } from 'react';
import { Camera, Upload, Trash2, MapPin, Download, CheckCircle2, Image as ImageIcon, X, AlertCircle } from 'lucide-react';
import { extractExifFromPhoto, GeotaggedPhoto } from '../services/exifService';
import { GeoPoint } from '../types';
import * as XLSX from 'xlsx';

interface Props {
  lang: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  onAddPointsToMap: (points: GeoPoint[]) => void;
}

export const GeotaggedPhotoModal: React.FC<Props> = ({ lang, isOpen, onClose, onAddPointsToMap }) => {
  const [photos, setPhotos] = useState<GeotaggedPhoto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [noGpsCount, setNoGpsCount] = useState(0);

  if (!isOpen) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    let missingGps = 0;
    const newPhotos: GeotaggedPhoto[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const geotag = await extractExifFromPhoto(file);
      if (geotag) {
        newPhotos.push(geotag);
      } else {
        missingGps++;
      }
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    setNoGpsCount(prev => prev + missingGps);
    setIsProcessing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handlePlotOnMap = () => {
    if (photos.length === 0) return;

    const geoPoints: GeoPoint[] = photos.map(p => ({
      id: p.filename,
      x: p.lon,
      y: p.lat,
      z: p.altitude || 0,
      type: 'Point',
      layer: 'صور الموقع الميدانية (Photos)',
      color: '#ec4899',
      description: `📸 صورة ميدانية: ${p.filename} | التاريخ: ${p.dateTaken || 'غير محدد'} | الارتفاع: ${p.altitude ? p.altitude + ' م' : 'غير متوفر'}`,
      attr1: p.dateTaken ? `تاريخ: ${p.dateTaken}` : undefined,
      attr2: p.altitude ? `منسوب Z: ${p.altitude}m` : undefined,
      iconUrl: p.previewUrl
    }));

    onAddPointsToMap(geoPoints);
    onClose();
  };

  const exportExcel = () => {
    if (photos.length === 0) return;
    const rows = photos.map((p, idx) => ({
      "م": idx + 1,
      "اسم الصورة": p.filename,
      "خط العرض (Latitude)": p.lat,
      "خط الطول (Longitude)": p.lon,
      "الارتفاع (Altitude Z)": p.altitude || "-",
      "تاريخ وتوقيت الالتقاط": p.dateTaken || "-",
      "رابط خرائط جوجل": `https://maps.google.com/?q=${p.lat},${p.lon}`
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Geotagged Photos");
    XLSX.writeFile(wb, "سجل_الصور_الميدانية_الموثقة_GPS.xlsx");
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-pink-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {lang === 'ar' ? 'توثيق وإسقاط الصور الميدانية (EXIF GPS)' : 'Geotagged Photo Inspector'}
                <span className="text-xs bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full border border-pink-500/30">
                  {photos.length} {lang === 'ar' ? 'صورة موثقة' : 'Photos'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' 
                  ? 'ارفع صور الموبايل لقراءة إحداثيات الـ GPS والارتفاع وإسقاطها فورياً كنقاط على الخريطة'
                  : 'Upload smartphone photos to extract GPS EXIF coordinates & plot them on map'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Upload Area */}
          <div 
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-pink-500/40 hover:border-pink-400 bg-pink-950/10 hover:bg-pink-950/20 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
            onClick={() => document.getElementById('photo-input')?.click()}
          >
            <input 
              id="photo-input" 
              type="file" 
              multiple 
              accept="image/*,.heic,.jpg,.jpeg,.png" 
              className="hidden" 
              onChange={e => handleFiles(e.target.files)} 
            />
            <div className="w-14 h-14 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-500/30">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <div className="text-base font-bold text-white">
                {lang === 'ar' ? 'اسحب وأفلت صور الموقع الميدانية هنا، أو انقر للاختيار' : 'Drag & drop field photos here or click to browse'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {lang === 'ar' ? 'يدعم صور كاميرات الهواتف (iPhone / Android / GPS Cameras) مع قراءة الـ GPS تلقائياً' : 'Supports iPhone, Android & GPS camera photos'}
              </div>
            </div>
          </div>

          {noGpsCount > 0 && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                {lang === 'ar' 
                  ? `ملاحظة: تم تجاهل ${noGpsCount} صورة لعدم احتوائها على إحداثيات GPS في بيانات EXIF (تأكد من تفعيل حفظ الموقع في إعدادات كاميرا هاتفك).`
                  : `Notice: ${noGpsCount} photos skipped because they do not contain GPS metadata.`}
              </span>
            </div>
          )}

          {/* Photo Cards Grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map(p => (
                <div key={p.id} className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden flex flex-col group relative">
                  <div className="h-36 bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    <img src={p.previewUrl} alt={p.filename} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    <button 
                      onClick={() => removePhoto(p.id)} 
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/80 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {p.altitude && (
                      <span className="absolute bottom-2 left-2 bg-slate-900/80 text-xs px-2 py-0.5 rounded text-cyan-300 font-mono">
                        Z: {p.altitude}m
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between text-xs">
                    <div className="font-semibold text-slate-200 truncate" title={p.filename}>
                      {p.filename}
                    </div>
                    <div className="text-slate-400 mt-1 space-y-0.5 font-mono text-[11px]">
                      <div>Lat: {p.lat.toFixed(6)}</div>
                      <div>Lon: {p.lon.toFixed(6)}</div>
                      {p.dateTaken && <div className="text-pink-300/80">{p.dateTaken}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {photos.length > 0 && (
              <span>{photos.length} {lang === 'ar' ? 'صورة جاهزة للإسقاط والتصدير' : 'photos ready'}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {photos.length > 0 && (
              <button 
                onClick={exportExcel}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 flex items-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                {lang === 'ar' ? 'تصدير جدول إكسل' : 'Export Excel'}
              </button>
            )}
            <button 
              disabled={photos.length === 0 || isProcessing}
              onClick={handlePlotOnMap}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-pink-600/30 flex items-center gap-2 transition"
            >
              <MapPin className="w-4 h-4" />
              {lang === 'ar' ? 'إسقاط الصور على الخريطة مباشرة 📌' : 'Plot Photos on Map 📌'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
