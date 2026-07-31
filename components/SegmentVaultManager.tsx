import React, { useState, useEffect } from 'react';
import {
  Database,
  Save,
  Trash2,
  FileSpreadsheet,
  CheckSquare,
  Square,
  HardDrive,
  FolderOpen,
  Calendar,
  Layers,
  MapPin,
  Sparkles,
  RefreshCw,
  PlusCircle,
  AlertCircle,
  FileText
} from 'lucide-react';
import {
  SavedProject,
  getAllSavedProjects,
  saveProjectToDB,
  deleteProjectFromDB,
  clearAllProjectsFromDB,
  exportAggregatedSegmentIdReport,
  extractAttrValue,
  getMapLinkForPoints
} from '../services/storageService';
import { GeoPoint } from '../types';

interface SegmentVaultManagerProps {
  lang: 'ar' | 'en';
  activePoints: GeoPoint[];
  activeFileName?: string;
  onLoadProjectToMap: (points: GeoPoint[], name: string) => void;
}

export const SegmentVaultManager: React.FC<SegmentVaultManagerProps> = ({
  lang,
  activePoints,
  activeFileName,
  onLoadProjectToMap,
}) => {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCurrent, setSavingCurrent] = useState<boolean>(false);
  const [customProjectName, setCustomProjectName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const loadSavedProjectsFromDB = async () => {
    setLoading(true);
    try {
      const data = await getAllSavedProjects();
      setProjects(data);
      // Auto select all by default if none selected yet
      setSelectedIds(new Set(data.map((p) => p.id)));
    } catch (e) {
      console.error('Failed to load saved projects', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSavedProjectsFromDB();
  }, []);

  // Compute stats for active points to be saved
  const activeSegmentIdCount = React.useMemo(() => {
    if (!activePoints || activePoints.length === 0) return 0;
    const SEGMENT_KEYS = ['SEGMENTID', 'SEGMENT_ID', 'SEGMENT ID', 'SegmentID', 'Segment Id', 'segment id', 'Segment_Id', 'SEGMENT'];
    const SEGMENT_REGEXES = [
      /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
      /(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id)\s*[:=]\s*([^\r\n,;<>&|]+)/i
    ];
    let count = 0;
    activePoints.forEach((pt) => {
      if (extractAttrValue([pt], SEGMENT_KEYS, SEGMENT_REGEXES)) count++;
    });
    return count;
  }, [activePoints]);

  const handleSaveCurrentProject = async () => {
    if (!activePoints || activePoints.length === 0) {
      setStatusMsg(lang === 'ar' ? 'لا توجد بيانات مفتوحة حالياً للحفظ.' : 'No active data points to save.');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    setSavingCurrent(true);
    try {
      const SEGMENT_KEYS = ['SEGMENTID', 'SEGMENT_ID', 'SEGMENT ID', 'SegmentID', 'Segment Id', 'segment id', 'Segment_Id', 'SEGMENT'];
      const SEGMENT_REGEXES = [
        /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
        /(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id)\s*[:=]\s*([^\r\n,;<>&|]+)/i
      ];

      const projNameExt = extractAttrValue(activePoints, ['PROJECTNAME', 'PROJECT_NAME', 'PROJECT NAME', 'ProjectName', 'اسم المشروع', 'المشروع'], []);
      const projIdExt = extractAttrValue(activePoints, ['PROJECTID', 'PROJECT_ID', 'PROJECT ID', 'ProjectId', 'رقم المشروع', 'رمز المشروع', 'كود المشروع'], []);
      const contractorExt = extractAttrValue(activePoints, ['CONTRACTOR', 'Contractor', 'المقاول', 'اسم المقاول'], []);

      const uniqueSegs = new Set<string>();
      let totalLen = 0;
      let validSegsCount = 0;

      activePoints.forEach((pt) => {
        const segId = extractAttrValue([pt], SEGMENT_KEYS, SEGMENT_REGEXES);
        if (segId) {
          validSegsCount++;
          uniqueSegs.add(segId);
          let len = pt.originalLength || 0;
          if (len === 0 && pt.type === 'LineString' && pt.path) {
            let dist = 0;
            for (let i = 0; i < pt.path.length - 1; i++) {
              const p1 = pt.path[i];
              const p2 = pt.path[i + 1];
              const dx = (p2.x - p1.x) * (Math.PI / 180) * 6371000 * Math.cos(((p1.y + p2.y) / 2) * (Math.PI / 180));
              const dy = (p2.y - p1.y) * (Math.PI / 180) * 6371000;
              dist += Math.sqrt(dx * dx + dy * dy);
            }
            len = dist;
          }
          totalLen += len;
        }
      });

      const finalTitle = customProjectName.trim() || projNameExt || activeFileName || `مشروع ${new Date().toLocaleDateString('ar-SA')}`;

      const newSavedProject: SavedProject = {
        id: `proj_${Date.now()}`,
        name: finalTitle,
        projectId: projIdExt || undefined,
        contractor: contractorExt || undefined,
        filename: activeFileName || undefined,
        savedAt: new Date().toISOString(),
        totalElementsCount: activePoints.length,
        validSegmentIdsCount: validSegsCount,
        uniqueSegmentIdsCount: uniqueSegs.size,
        totalSegmentedLength: totalLen,
        points: activePoints
      };

      await saveProjectToDB(newSavedProject);
      await loadSavedProjectsFromDB();
      setShowSaveModal(false);
      setCustomProjectName('');
      setStatusMsg(lang === 'ar' ? 'تم حفظ المشروع بنجاح بذاكرة الجهاز!' : 'Project saved successfully to device storage!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (e) {
      console.error('Save failed', e);
      setStatusMsg(lang === 'ar' ? 'حدث خطأ أثناء الحفظ.' : 'Failed to save project.');
    } finally {
      setSavingCurrent(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm(lang === 'ar' ? 'هل أنت تأكد من حذف هذا المشروع من ذاكرة الجهاز؟' : 'Are you sure you want to delete this project from device memory?')) {
      await deleteProjectFromDB(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadSavedProjectsFromDB();
    }
  };

  const handleClearAll = async () => {
    if (confirm(lang === 'ar' ? 'هل تريد مسح جميع المشاريع المحفوظة بذاكرة الجهاز؟' : 'Clear all saved projects from device memory?')) {
      await clearAllProjectsFromDB();
      setSelectedIds(new Set());
      await loadSavedProjectsFromDB();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleExportAggregated = () => {
    const selectedProjects = projects.filter((p) => selectedIds.has(p.id));
    if (selectedProjects.length === 0) {
      alert(lang === 'ar' ? 'يرجى تحديد مشروع واحد على الأقل لتصدير التقرير المجمع.' : 'Please select at least one project.');
      return;
    }
    exportAggregatedSegmentIdReport(selectedProjects, lang);
  };

  const selectedProjectsList = projects.filter((p) => selectedIds.has(p.id));
  const aggregatedStats = React.useMemo(() => {
    let totalKm = 0;
    let totalUniqueSegs = new Set<string>();
    let totalValidItems = 0;

    const SEGMENT_KEYS = ['SEGMENTID', 'SEGMENT_ID', 'SEGMENT ID', 'SegmentID', 'Segment Id', 'segment id', 'Segment_Id', 'SEGMENT'];
    const SEGMENT_REGEXES = [
      /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
      /(?:SEGMENTID|SEGMENT_ID|SEGMENT\s*ID|SegmentID|Segment\s*Id)\s*[:=]\s*([^\r\n,;<>&|]+)/i
    ];

    selectedProjectsList.forEach((proj) => {
      totalKm += (proj.totalSegmentedLength || 0) / 1000;
      (proj.points || []).forEach((pt) => {
        const segId = extractAttrValue([pt], SEGMENT_KEYS, SEGMENT_REGEXES);
        if (segId) {
          totalUniqueSegs.add(segId);
          totalValidItems++;
        }
      });
    });

    return {
      projectsCount: selectedProjectsList.length,
      totalKm: totalKm.toFixed(3),
      uniqueSegCount: totalUniqueSegs.size,
      totalValidItems
    };
  }, [selectedProjectsList]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-r from-[#032330] to-[#09435b] rounded-[2.5rem] border border-[#9000FF]/40 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-[#9000FF]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-start justify-between relative z-10 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#9000FF]/20 rounded-xl text-[#d8b4fe] border border-[#9000FF]/40">
                <HardDrive className="w-5 h-5" />
              </span>
              <h2 className="text-white font-black text-base sm:text-lg">
                {lang === 'ar' ? 'حافظة وتجميع مشاريع Segment ID' : 'Segment ID Project Vault & Aggregator'}
              </h2>
            </div>
            <p className="text-[11px] text-white/70 font-bold leading-relaxed max-w-xl">
              {lang === 'ar'
                ? 'تخزين أعمالك ومشاريعك السابقة تلقائياً في ذاكرة جهازك المحلية (IndexedDB). يمكنك استعراض جميع المشاريع، اختيار مشاريع متعددة، وتصدير تقرير Segment ID مجمع وشامل بصيغة Excel.'
                : 'Save your projects in your device local memory (IndexedDB). Select multiple projects to generate an aggregated multi-project Segment ID Excel report.'}
            </p>
          </div>

          <span className="shrink-0 text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {lang === 'ar' ? 'تخزين محلي آمن' : 'Safe Local Memory'}
          </span>
        </div>

        {/* Action Button to Save Current Workspace */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black text-white/80">
            <MapPin className="w-4 h-4 text-accent" />
            <span>
              {lang === 'ar' ? 'المشروع النشط حالياً:' : 'Active Loaded Workspace:'}
            </span>
            <span className="text-accent bg-accent/10 px-2.5 py-0.5 rounded-lg border border-accent/20">
              {activeFileName || (activePoints.length > 0 ? (lang === 'ar' ? 'بيانات الخريطة الحالية' : 'Current Map Data') : (lang === 'ar' ? 'لا يوجد' : 'None'))}
            </span>
            {activePoints.length > 0 && (
              <span className="text-[10px] text-emerald-400 font-bold">
                ({activePoints.length} {lang === 'ar' ? 'عنصر' : 'items'} | {activeSegmentIdCount} Segment IDs)
              </span>
            )}
          </div>

          <button
            onClick={() => {
              if (activePoints.length === 0) {
                alert(lang === 'ar' ? 'يرجى رفع ملف أو تحميل بيانات في الخريطة أولاً لتتمكن من حفظ المشروع.' : 'Please upload or load data into the map first.');
                return;
              }
              setShowSaveModal(true);
            }}
            disabled={activePoints.length === 0}
            className={React.useMemo(() => {
              return activePoints.length > 0
                ? "bg-[#9000FF] hover:bg-[#a62eff] text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all"
                : "bg-white/5 text-white/30 border border-white/10 px-4 py-2.5 rounded-xl text-xs cursor-not-allowed";
            }, [activePoints])}
          >
            <Save className="w-4 h-4" />
            <span>{lang === 'ar' ? 'حفظ العمل الحالي في ذاكرة الجهاز 💾' : 'Save Active Workspace to Memory 💾'}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-accent/10 border border-accent/30 text-accent p-3 rounded-xl text-xs font-black text-center animate-in slide-in-from-top">
          {statusMsg}
        </div>
      )}

      {/* Save Modal Dialog */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b2d3d] border border-white/20 p-6 rounded-3xl max-w-md w-full space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <Save className="w-6 h-6 text-accent" />
              <h3 className="text-white font-black text-base">
                {lang === 'ar' ? 'حفظ المشروع في ذاكرة الجهاز' : 'Save Project to Device Memory'}
              </h3>
            </div>

            <p className="text-xs text-white/70 font-bold leading-relaxed">
              {lang === 'ar'
                ? 'أدخل اسماً مخصصاً للمشروع ليتم حفظه بجميع عناصره وSegment IDs بذاكرة المتصفح للرجوع إليه وتضمينه في التقرير المجمع.'
                : 'Enter a custom title for this project to save all features and Segment IDs locally.'}
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-white/80 block">
                {lang === 'ar' ? 'اسم المشروع أو الملاحظات:' : 'Project Title:'}
              </label>
              <input
                type="text"
                value={customProjectName}
                onChange={(e) => setCustomProjectName(e.target.value)}
                placeholder={activeFileName || (lang === 'ar' ? 'مثال: مشروع مياه حي العليا' : 'e.g., Olaya Water Network Project')}
                className="w-full bg-[#031d28] border border-white/15 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-accent"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveCurrentProject}
                disabled={savingCurrent}
                className="flex-1 bg-accent text-primary font-black py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-95 transition-all"
              >
                {savingCurrent ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{lang === 'ar' ? 'حفظ الآن' : 'Save Now'}</span>
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-all"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Project Consolidated Aggregator Toolbar */}
      {projects.length > 0 && (
        <div className="p-5 bg-[#0e3f53]/70 rounded-3xl border border-accent/30 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black transition-all border border-white/10"
              >
                {selectedIds.size === projects.length ? (
                  <CheckSquare className="w-4 h-4 text-accent" />
                ) : (
                  <Square className="w-4 h-4 text-white/40" />
                )}
                <span>
                  {selectedIds.size === projects.length
                    ? (lang === 'ar' ? 'إلغاء تحديد الكل' : 'Deselect All')
                    : (lang === 'ar' ? 'تحديد جميع المشاريع' : 'Select All Projects')}
                </span>
              </button>

              <span className="text-xs font-bold text-white/60">
                ({selectedIds.size} {lang === 'ar' ? 'محدد من أصل' : 'selected out of'} {projects.length})
              </span>
            </div>

            {projects.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'مسح جميع المشاريع المحفوظة' : 'Clear All Projects'}</span>
              </button>
            )}
          </div>

          {/* Aggregated Stats Summary Box */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/30 p-4 rounded-2xl border border-white/10">
            <div className="text-center">
              <span className="text-[9px] font-black text-white/40 block">
                {lang === 'ar' ? 'المشاريع المحددة' : 'Selected Projects'}
              </span>
              <span className="text-base font-black text-accent">{aggregatedStats.projectsCount}</span>
            </div>
            <div className="text-center">
              <span className="text-[9px] font-black text-white/40 block">
                {lang === 'ar' ? 'إجمالي الأطوال المجمعة' : 'Total Aggregated Length'}
              </span>
              <span className="text-base font-black text-emerald-400">
                {aggregatedStats.totalKm} <span className="text-[10px]">km</span>
              </span>
            </div>
            <div className="text-center">
              <span className="text-[9px] font-black text-white/40 block">
                {lang === 'ar' ? 'Segment IDs بدون تكرار' : 'Unique Segment IDs'}
              </span>
              <span className="text-base font-black text-[#d8b4fe]">{aggregatedStats.uniqueSegCount}</span>
            </div>
            <div className="text-center">
              <span className="text-[9px] font-black text-white/40 block">
                {lang === 'ar' ? 'إجمالي عناصر الخطوط' : 'Total Line Elements'}
              </span>
              <span className="text-base font-black text-white">{aggregatedStats.totalValidItems}</span>
            </div>
          </div>

          {/* Primary Action Button: Consolidated Excel Export */}
          <button
            onClick={handleExportAggregated}
            disabled={selectedIds.size === 0}
            className={React.useMemo(() => {
              return selectedIds.size > 0
                ? "w-full bg-[#9000FF] hover:bg-[#a62eff] text-white font-black py-4 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-3 shadow-2xl hover:scale-[1.01] active:scale-95 transition-all border border-[#d8b4fe]/30"
                : "w-full bg-white/5 text-white/20 border border-white/5 font-black py-4 rounded-2xl text-xs cursor-not-allowed";
            }, [selectedIds.size])}
          >
            <FileSpreadsheet className="w-5 h-5 text-[#d8b4fe]" />
            <span>
              {lang === 'ar'
                ? `تصدير تقرير Segment ID مجمع للمشاريع المحددة (${selectedIds.size}) إلى Excel`
                : `Export Consolidated Segment ID Excel Report for (${selectedIds.size}) Projects`}
            </span>
          </button>
        </div>
      )}

      {/* Saved Projects List */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-white/60 uppercase tracking-widest flex items-center gap-2 px-1">
          <FolderOpen className="w-4 h-4 text-accent" />
          <span>{lang === 'ar' ? 'قائمة المشاريع المحفوظة بذاكرة الجهاز:' : 'Saved Projects in Device Storage:'}</span>
        </h3>

        {loading ? (
          <div className="text-center py-10 bg-white/5 rounded-3xl border border-white/10">
            <RefreshCw className="w-8 h-8 text-accent animate-spin mx-auto mb-2" />
            <p className="text-xs text-white/50 font-bold">{lang === 'ar' ? 'جاري تحميل المشاريع...' : 'Loading saved projects...'}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center p-8 sm:p-12 bg-white/5 rounded-3xl border border-dashed border-white/10 space-y-3">
            <Database className="w-12 h-12 text-white/20 mx-auto" />
            <h4 className="text-white font-black text-sm">
              {lang === 'ar' ? 'لا توجد مشاريع محفوظة حالياً' : 'No saved projects found'}
            </h4>
            <p className="text-xs text-white/40 font-bold max-w-sm mx-auto leading-relaxed">
              {lang === 'ar'
                ? 'قم برفع ملفات البيانات على الخريطة ثم انقر على "حفظ العمل الحالي في ذاكرة الجهاز" لتخزين المشاريع وبناء تقارير مجمعة.'
                : 'Upload files and click "Save Active Workspace" to store projects on your device.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {projects.map((proj, idx) => {
              const isSelected = selectedIds.has(proj.id);
              return (
                <div
                  key={proj.id}
                  className={React.useMemo(() => {
                    return isSelected
                      ? "p-5 bg-[#0c3647]/90 border-2 border-accent rounded-3xl shadow-xl transition-all space-y-4"
                      : "p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-3xl transition-all space-y-4";
                  }, [isSelected])}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleSelect(proj.id)}
                        className="mt-1 text-accent transition-transform active:scale-95"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-accent" />
                        ) : (
                          <Square className="w-5 h-5 text-white/30" />
                        )}
                      </button>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-white/40">#{idx + 1}</span>
                          <h4 className="text-sm font-black text-white">{proj.name}</h4>
                          {proj.filename && (
                            <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-md font-bold">
                              {proj.filename}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/60 font-bold">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-accent" />
                            {new Date(proj.savedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                          </span>
                          {proj.projectId && (
                            <span className="bg-white/10 text-amber-300 px-2 py-0.5 rounded border border-white/10">
                              ID: {proj.projectId}
                            </span>
                          )}
                          {proj.contractor && (
                            <span className="bg-white/10 text-cyan-300 px-2 py-0.5 rounded border border-white/10">
                              {proj.contractor}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteProject(proj.id)}
                      className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                      title={lang === 'ar' ? 'حذف هذا المشروع' : 'Delete Project'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Project Quick Metrics */}
                  <div className="grid grid-cols-3 gap-2 bg-black/20 p-3 rounded-2xl border border-white/5 text-center">
                    <div>
                      <span className="text-[9px] font-bold text-white/40 block">
                        {lang === 'ar' ? 'إجمالي العناصر' : 'Total Items'}
                      </span>
                      <span className="text-xs font-black text-white">{proj.totalElementsCount}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-white/40 block">
                        {lang === 'ar' ? 'Segment IDs الفريدة' : 'Unique Segments'}
                      </span>
                      <span className="text-xs font-black text-[#d8b4fe]">{proj.uniqueSegmentIdsCount}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-white/40 block">
                        {lang === 'ar' ? 'الطول الإجمالي' : 'Total Length'}
                      </span>
                      <span className="text-xs font-black text-emerald-400">
                        {((proj.totalSegmentedLength || 0) / 1000).toFixed(3)} km
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                    <button
                      onClick={() => onLoadProjectToMap(proj.points, proj.name)}
                      className="flex-1 bg-accent/20 hover:bg-accent/30 text-accent font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-accent/30"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'فتح واستعراض بالخريطة 🗺️' : 'Load to Map 🗺️'}</span>
                    </button>

                    <button
                      onClick={() => exportAggregatedSegmentIdReport([proj], lang)}
                      className="flex-1 bg-[#9000FF]/20 hover:bg-[#9000FF]/30 text-[#d8b4fe] font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-[#9000FF]/40"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'تصدير Excel للمشروع' : 'Export Excel Report'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
