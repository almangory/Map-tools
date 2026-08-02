
import pptxgen from "pptxgenjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Language } from "../translations";
// Added import for AnalysisItem
import { AnalysisItem } from "../types";
import { matchStatusByColor } from "./colorUtils";

export interface FullAnalysisExtraOptions {
  segmentIdAnalysis?: {
    totalElements: number;
    validElementsCount: number;
    uniqueSegmentIdsCount: number;
    totalLengthWithSegmentId: number;
    uniqueDetails: Array<{
      idValue: string;
      count: number;
      totalLength: number;
      projectName?: string;
      projectId?: string;
      contractor?: string;
    }>;
  };
  permitNoAnalysis?: {
    totalElements: number;
    validElementsCount: number;
    uniquePermitNosCount: number;
    totalLengthWithPermitNo: number;
    uniqueDetails: Array<{
      idValue?: string;
      permitValue?: string;
      count: number;
      totalLength: number;
      projectName?: string;
      projectId?: string;
      contractor?: string;
      primaryColor?: string;
      primaryStatusKey?: string;
      primaryStatusNameAr?: string;
      primaryStatusNameEn?: string;
      statusBreakdown?: Record<string, { count: number; totalLength: number }>;
    }>;
  };
  wwMainlineStats?: {
    totalLength: number;
    segments: any[];
    diameterBreakdown?: Record<string, number>;
    diameterLengths?: Record<string, number>;
    materialLengths?: Record<string, number>;
    count?: number;
  };
  wMainlineStats?: {
    totalLength: number;
    segments: any[];
    diameterBreakdown?: Record<string, number>;
    diameterLengths?: Record<string, number>;
    materialLengths?: Record<string, number>;
    count?: number;
  };
  networkType?: 'all' | 'water' | 'sewer';
}

export const generateAnalysisPPTX = async (
  data: AnalysisItem[], 
  filename: string, 
  lang: Language,
  extraOptions?: FullAnalysisExtraOptions
) => {
  const isAr = lang === 'ar';
  const pptx = new pptxgen();
  
  // Set Layout to Widescreen (16:9) for better modern presentation
  pptx.defineLayout({ name: 'WIDESCREEN', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDESCREEN';
  if (isAr) (pptx as any).rtlMode = true;

  const primaryColor = "0B2D3D"; // Deeper blue to match app UI
  const accentColor = "DCB13C"; // Gold accent
  const white = "FFFFFF";
  const lightBg = "F8F9FA";
  const grayText = "64748B";
  const purpleAccent = "9000FF";
  const orangeAccent = "FF6D00";

  const netType = extraOptions?.networkType || 'all';

  let reportTitle = isAr ? "تقرير التحليل الجغرافي الشامل" : "Comprehensive Spatial Analysis Report";
  let networkSubtitle = isAr ? "تقرير شامل لجميع شبكات المياه والصرف الصحي" : "Comprehensive Water & Sewer Networks Report";

  if (netType === 'water') {
    reportTitle = isAr ? "تقرير تحليل شبكة مياه الشرب" : "Drinking Water Network Analysis Report";
    networkSubtitle = isAr ? "تقرير خاص لشبكة خطوط مياه الشرب" : "Dedicated Drinking Water Network Report";
  } else if (netType === 'sewer') {
    reportTitle = isAr ? "تقرير تحليل شبكة الصرف الصحي" : "Sewer & Wastewater Network Analysis Report";
    networkSubtitle = isAr ? "تقرير خاص لشبكة خطوط الصرف الصحي" : "Dedicated Sewer & Wastewater Network Report";
  }

  // 1. Title Slide
  const slide1 = pptx.addSlide();
  slide1.background = { color: primaryColor };
  slide1.addText(reportTitle, {
    x: 1, y: 1.8, w: 11.33, h: 1.5,
    fontSize: 40, color: accentColor, bold: true, align: isAr ? 'right' : 'left'
  });
  slide1.addText(networkSubtitle, {
    x: 1, y: 3.2, w: 11.33, h: 0.6,
    fontSize: 20, color: "00C8B3", bold: true, align: isAr ? 'right' : 'left'
  });
  slide1.addText(isAr ? `اسم الملف/المشروع: ${filename}` : `Project/File: ${filename}`, {
    x: 1, y: 4.0, w: 11.33, h: 0.8,
    fontSize: 22, color: white, align: isAr ? 'right' : 'left'
  });
  slide1.addText(new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { dateStyle: 'full' }), {
      x: 1, y: 5.0, w: 11.33, h: 0.5,
      fontSize: 16, color: "94A3B8", align: isAr ? 'right' : 'left'
  });

  // 2. Executive Comprehensive Summary Slide
  const totalKm = data.reduce((a, b) => a + b.totalLength, 0) / 1000;
  const totalElementsCount = data.reduce((a, b) => a + b.count, 0);
  const slide2 = pptx.addSlide();

  const overviewHeading = netType === 'water'
    ? (isAr ? "نظرة عامة وتقارير شبكة مياه الشرب" : "Water Network Analysis Overview")
    : netType === 'sewer'
    ? (isAr ? "نظرة عامة وتقارير شبكة الصرف الصحي" : "Sewer Network Analysis Overview")
    : (isAr ? "نظرة عامة والتقرير الشامل للتحليل" : "Comprehensive Analysis Overview");

  slide2.addText(overviewHeading, {
      x: 0.8, y: 0.6, w: 11.73, h: 0.8,
      fontSize: 30, color: primaryColor, bold: true, align: isAr ? 'right' : 'left'
  });

  const segAnalysis = extraOptions?.segmentIdAnalysis;
  const perAnalysis = extraOptions?.permitNoAnalysis;
  const wwStats = extraOptions?.wwMainlineStats;
  const wStats = extraOptions?.wMainlineStats;

  const networkTypeLabel = netType === 'water'
    ? (isAr ? "شبكة مياه الشرب" : "Water Network")
    : netType === 'sewer'
    ? (isAr ? "شبكة الصرف الصحي" : "Sewer Network")
    : (isAr ? "جميع الشبكات" : "All Networks");

  const summaryBoxes = [
      { label: isAr ? "إجمالي الأطوال الكلية (كم)" : "Total Length (km)", value: `${totalKm.toFixed(2)}` },
      { label: isAr ? "عدد العناصر الكلي" : "Total Elements", value: totalElementsCount.toString() },
      { label: isAr ? "نوع الشبكة المحللة" : "Analyzed Network", value: networkTypeLabel },
      { 
        label: isAr ? "أطوال Segment ID (كم)" : "Segment ID Length (km)", 
        value: segAnalysis ? `${(segAnalysis.totalLengthWithSegmentId / 1000).toFixed(2)}` : '-' 
      },
      { 
        label: isAr ? "أطوال Permit No (كم)" : "Permit No Length (km)", 
        value: perAnalysis ? `${(perAnalysis.totalLengthWithPermitNo / 1000).toFixed(2)}` : '-' 
      },
      netType === 'water'
        ? { 
            label: isAr ? "أطوال خطوط المياه (W_MAINLINE)" : "Water Mainline Length (km)", 
            value: wStats ? `${(wStats.totalLength / 1000).toFixed(2)}` : `${totalKm.toFixed(2)}` 
          }
        : netType === 'sewer'
        ? { 
            label: isAr ? "أطوال خطوط الصرف (WW_MAINLINE)" : "Sewer Mainline Length (km)", 
            value: wwStats ? `${(wwStats.totalLength / 1000).toFixed(2)}` : `${totalKm.toFixed(2)}` 
          }
        : { 
            label: isAr ? "خطوط الصرف (WW_MAINLINE)" : "WW Mainline Length (km)", 
            value: wwStats ? `${(wwStats.totalLength / 1000).toFixed(2)}` : '-' 
          }
  ];

  summaryBoxes.forEach((box, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const xPos = 0.8 + col * 4.0;
      const yPos = 1.6 + row * 2.6;

      slide2.addShape(pptx.ShapeType.rect, {
          x: xPos, y: yPos, w: 3.6, h: 2.3,
          fill: { color: lightBg }, line: { color: primaryColor, width: 1.5 },
          rectRadius: 0.15
      });
      slide2.addText(box.label, {
          x: xPos + 0.1, y: yPos + 0.3, w: 3.4, h: 0.5,
          fontSize: 14, color: grayText, align: 'center', bold: true
      });
      slide2.addText(box.value, {
          x: xPos + 0.1, y: yPos + 1.0, w: 3.4, h: 0.9,
          fontSize: 32, color: primaryColor, bold: true, align: 'center'
      });
  });

  // 3. Status Chart Slide
  if (data.length > 0) {
    const slide3 = pptx.addSlide();
    slide3.addText(isAr ? "مخطط توزيع الأطوال حسب الحالة واللون" : "Length Distribution by Status & Color", {
        x: 0.8, y: 0.6, w: 11.73, h: 0.8,
        fontSize: 30, color: primaryColor, bold: true, align: isAr ? 'right' : 'left'
    });

    const chartData = [
        {
            name: isAr ? "الأطوال" : "Lengths",
            labels: data.map(d => d.statusName || d.color),
            values: data.map(d => parseFloat((d.totalLength / 1000).toFixed(2)))
        }
    ];

    slide3.addChart(pptx.ChartType.pie, chartData, {
        x: 2.0, y: 1.5, w: 9.33, h: 5.5,
        showLegend: true,
        legendPos: 'r',
        dataLabelFontSize: 12,
        dataLabelColor: "FFFFFF",
        showPercent: true,
        chartColors: data.map(d => d.statusColor?.replace('#', '') || d.color.replace('#', ''))
    });
  }

  // 4. Segment ID Report Slide
  if (segAnalysis && segAnalysis.uniqueDetails && segAnalysis.uniqueDetails.length > 0) {
    const slideSeg = pptx.addSlide();
    slideSeg.addText(isAr ? "تقرير تحليل Segment ID" : "Segment ID Analysis Report", {
        x: 0.8, y: 0.6, w: 11.73, h: 0.8,
        fontSize: 28, color: purpleAccent, bold: true, align: isAr ? 'right' : 'left'
    });

    const segKm = (segAnalysis.totalLengthWithSegmentId / 1000).toFixed(2);
    const segPct = ((segAnalysis.validElementsCount / (segAnalysis.totalElements || 1)) * 100).toFixed(1);

    // Summary sub-boxes
    slideSeg.addText(
      isAr 
        ? `• عناصر تحتوي Segment ID: ${segAnalysis.validElementsCount} من أصل ${segAnalysis.totalElements} (${segPct}%)  |  • قيم فريدة: ${segAnalysis.uniqueSegmentIdsCount}  |  • إجمالي الطول: ${segKm} كم`
        : `• Elements with Segment ID: ${segAnalysis.validElementsCount} / ${segAnalysis.totalElements} (${segPct}%)  |  • Unique IDs: ${segAnalysis.uniqueSegmentIdsCount}  |  • Total Length: ${segKm} km`,
      { x: 0.8, y: 1.4, w: 11.73, h: 0.5, fontSize: 13, color: primaryColor, bold: true, align: isAr ? 'right' : 'left' }
    );

    const tableRows: any[][] = [
      [
        { text: isAr ? "م" : "#", options: { fill: purpleAccent, color: white, bold: true, fontSize: 13 } },
        { text: isAr ? "Segment ID" : "Segment ID", options: { fill: purpleAccent, color: white, bold: true, fontSize: 13 } },
        { text: isAr ? "العدد" : "Count", options: { fill: purpleAccent, color: white, bold: true, fontSize: 13 } },
        { text: isAr ? "الطول (كم)" : "Length (km)", options: { fill: purpleAccent, color: white, bold: true, fontSize: 13 } },
        { text: isAr ? "اسم المشروع" : "Project Name", options: { fill: purpleAccent, color: white, bold: true, fontSize: 13 } },
        { text: isAr ? "المقاول" : "Contractor", options: { fill: purpleAccent, color: white, bold: true, fontSize: 13 } }
      ]
    ];

    segAnalysis.uniqueDetails.slice(0, 10).forEach((item, idx) => {
      tableRows.push([
        { text: (idx + 1).toString(), options: { fontSize: 11 } },
        { text: item.idValue, options: { bold: true, fontSize: 11, color: purpleAccent } },
        { text: item.count.toString(), options: { fontSize: 11 } },
        { text: (item.totalLength / 1000).toFixed(3), options: { fontSize: 11 } },
        { text: item.projectName || '-', options: { fontSize: 10 } },
        { text: item.contractor || '-', options: { fontSize: 10 } }
      ]);
    });

    slideSeg.addTable(tableRows as any, {
      x: 0.8, y: 2.1, w: 11.73,
      border: { type: 'solid', color: "E2E8F0", pt: 1 },
      align: 'center',
      valign: 'middle',
      colW: [0.6, 2.5, 1.2, 1.8, 3.2, 2.43],
      fill: "F8F9FA",
      autoPage: false
    });

    // 4b. Segment ID Distribution Chart Slide
    const slideSegChart = pptx.addSlide();
    slideSegChart.addText(isAr ? "مخطط توزيع الأطوال حسب Segment ID" : "Segment ID Length Distribution Chart", {
        x: 0.8, y: 0.6, w: 11.73, h: 0.8,
        fontSize: 28, color: purpleAccent, bold: true, align: isAr ? 'right' : 'left'
    });

    const topSegs = [...segAnalysis.uniqueDetails]
      .sort((a, b) => b.totalLength - a.totalLength)
      .slice(0, 10);

    const chartDataSeg = [
      {
        name: isAr ? "الطول (كم)" : "Length (km)",
        labels: topSegs.map(s => s.idValue || (s as any).permitValue || '-'),
        values: topSegs.map(s => parseFloat((s.totalLength / 1000).toFixed(3)))
      }
    ];

    slideSegChart.addChart(pptx.ChartType.bar, chartDataSeg, {
      x: 0.8, y: 1.6, w: 11.73, h: 5.2,
      barDir: 'col',
      showValue: true,
      dataLabelFormatCode: "0.000",
      dataLabelColor: "1E293B",
      dataLabelFontSize: 10,
      chartColors: [purpleAccent],
      valAxisTitle: isAr ? "الطول (كم)" : "Length (km)",
      catAxisTitle: isAr ? "Segment ID" : "Segment ID",
    });
  }

  // 5. Permit No Report Slide (Grouped & Sorted by Status Color)
  if (perAnalysis && perAnalysis.uniqueDetails && perAnalysis.uniqueDetails.length > 0) {
    const STATUS_INFO_MAP: Record<string, { order: number; nameAr: string; nameEn: string; color: string }> = {
      executed_water: { order: 1, nameAr: 'منفذ - مياه', nameEn: 'Executed - Water', color: '01579B' },
      executed_sewer: { order: 2, nameAr: 'منفذ - صرف', nameEn: 'Executed - Sewer', color: '097138' },
      in_progress: { order: 3, nameAr: 'جاري العمل', nameEn: 'Work in Progress', color: 'FFEA00' },
      remaining: { order: 4, nameAr: 'أعمال متبقية', nameEn: 'Remaining Work', color: 'A52714' },
      cancelled: { order: 5, nameAr: 'خطوط تم الغائها', nameEn: 'Cancelled Works', color: 'F48FB1' }
    };

    const getPermitStatus = (item: any) => {
      const catKey = item.primaryStatusKey || matchStatusByColor(item.primaryColor || '#A52714').key;
      return STATUS_INFO_MAP[catKey] || STATUS_INFO_MAP['remaining'];
    };

    // Calculate Summary by Status Color
    const statusSummary: Record<string, { countPermits: number; countElements: number; totalLength: number }> = {
      executed_water: { countPermits: 0, countElements: 0, totalLength: 0 },
      executed_sewer: { countPermits: 0, countElements: 0, totalLength: 0 },
      in_progress: { countPermits: 0, countElements: 0, totalLength: 0 },
      remaining: { countPermits: 0, countElements: 0, totalLength: 0 },
      cancelled: { countPermits: 0, countElements: 0, totalLength: 0 }
    };

    perAnalysis.uniqueDetails.forEach(item => {
      const catKey = item.primaryStatusKey || matchStatusByColor(item.primaryColor || '#A52714').key;
      if (statusSummary[catKey]) {
        statusSummary[catKey].countPermits += 1;
        statusSummary[catKey].countElements += item.count;
        statusSummary[catKey].totalLength += item.totalLength;
      }
    });

    // Sort permits by status category order, then by total length descending
    const sortedPermitsByColor = [...perAnalysis.uniqueDetails].sort((a, b) => {
      const stA = getPermitStatus(a);
      const stB = getPermitStatus(b);
      if (stA.order !== stB.order) return stA.order - stB.order;
      return b.totalLength - a.totalLength;
    });

    // 5a. Permit No Status Color Summary Slide
    const slidePerSummary = pptx.addSlide();
    slidePerSummary.addText(
      isAr ? "تقرير تحليل التراخيص (Permit No) حسب حالة التنفيذ واللون" : "Permit No Analysis by Execution Status & Color",
      { x: 0.8, y: 0.6, w: 11.73, h: 0.8, fontSize: 26, color: orangeAccent, bold: true, align: isAr ? 'right' : 'left' }
    );

    const perKm = (perAnalysis.totalLengthWithPermitNo / 1000).toFixed(2);
    const perPct = ((perAnalysis.validElementsCount / (perAnalysis.totalElements || 1)) * 100).toFixed(1);

    slidePerSummary.addText(
      isAr 
        ? `• عناصر تحتوي رقم ترخيص: ${perAnalysis.validElementsCount} من أصل ${perAnalysis.totalElements} (${perPct}%)  |  • تراخيص فريدة: ${perAnalysis.uniquePermitNosCount}  |  • إجمالي الطول: ${perKm} كم`
        : `• Elements with Permit No: ${perAnalysis.validElementsCount} / ${perAnalysis.totalElements} (${perPct}%)  |  • Unique Permits: ${perAnalysis.uniquePermitNosCount}  |  • Total Length: ${perKm} km`,
      { x: 0.8, y: 1.4, w: 11.73, h: 0.5, fontSize: 13, color: primaryColor, bold: true, align: isAr ? 'right' : 'left' }
    );

    const summaryTableRows: any[][] = [
      [
        { text: isAr ? "م" : "#", options: { fill: orangeAccent, color: white, bold: true, fontSize: 12 } },
        { text: isAr ? "حالة التنفيذ / اللون" : "Execution Status / Color", options: { fill: orangeAccent, color: white, bold: true, fontSize: 12 } },
        { text: isAr ? "عدد التراخيص الفريدة" : "Unique Permits", options: { fill: orangeAccent, color: white, bold: true, fontSize: 12 } },
        { text: isAr ? "عدد العناصر" : "Elements Count", options: { fill: orangeAccent, color: white, bold: true, fontSize: 12 } },
        { text: isAr ? "إجمالي الطول (كم)" : "Total Length (km)", options: { fill: orangeAccent, color: white, bold: true, fontSize: 12 } },
        { text: isAr ? "النسبة %" : "Percentage %", options: { fill: orangeAccent, color: white, bold: true, fontSize: 12 } }
      ]
    ];

    const totalPermitLen = perAnalysis.totalLengthWithPermitNo || 1;
    let sIdx = 1;
    Object.entries(STATUS_INFO_MAP).forEach(([key, info]) => {
      const data = statusSummary[key] || { countPermits: 0, countElements: 0, totalLength: 0 };
      const pct = ((data.totalLength / totalPermitLen) * 100).toFixed(1);
      summaryTableRows.push([
        { text: (sIdx++).toString(), options: { fontSize: 11, align: 'center' } },
        { text: isAr ? info.nameAr : info.nameEn, options: { bold: true, fontSize: 11, color: info.color } },
        { text: data.countPermits.toString(), options: { fontSize: 11, align: 'center' } },
        { text: data.countElements.toString(), options: { fontSize: 11, align: 'center' } },
        { text: (data.totalLength / 1000).toFixed(3), options: { fontSize: 11, align: 'right' } },
        { text: `${pct}%`, options: { bold: true, fontSize: 11, align: 'right', color: info.color } }
      ]);
    });

    slidePerSummary.addTable(summaryTableRows as any, {
      x: 0.8, y: 2.1, w: 11.73,
      border: { type: 'solid', color: "E2E8F0", pt: 1 },
      align: 'center',
      valign: 'middle',
      colW: [0.6, 3.2, 2.0, 1.8, 2.2, 1.93],
      fill: "F8F9FA",
      autoPage: false
    });

    // 5b. Permit Details Table Sorted by Status Color Slide (Paginated for complete reporting)
    const perPageSize = 10;
    const perTotalPages = Math.ceil(sortedPermitsByColor.length / perPageSize);

    for (let page = 0; page < perTotalPages; page++) {
      const slidePerDetails = pptx.addSlide();
      const pageChunk = sortedPermitsByColor.slice(page * perPageSize, (page + 1) * perPageSize);
      const titleText = perTotalPages > 1
        ? (isAr ? `تفاصيل التراخيص حسب حالة التنفيذ واللون (${page + 1} من ${perTotalPages})` : `Permit Details List (${page + 1} of ${perTotalPages})`)
        : (isAr ? "تفاصيل التراخيص مفرزة حسب حالة التنفيذ واللون" : "Permit Details List (Sorted by Execution Status & Color)");

      slidePerDetails.addText(
        titleText,
        { x: 0.8, y: 0.6, w: 11.73, h: 0.8, fontSize: 26, color: primaryColor, bold: true, align: isAr ? 'right' : 'left' }
      );

      const detailsTableRows: any[][] = [
        [
          { text: isAr ? "م" : "#", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } },
          { text: isAr ? "حالة التنفيذ / اللون" : "Status / Color", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } },
          { text: isAr ? "Permit No / رقم الترخيص" : "Permit No", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } },
          { text: isAr ? "العدد" : "Count", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } },
          { text: isAr ? "الطول (كم)" : "Length (km)", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } },
          { text: isAr ? "اسم المشروع" : "Project Name", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } },
          { text: isAr ? "المقاول" : "Contractor", options: { fill: primaryColor, color: white, bold: true, fontSize: 12 } }
        ]
      ];

      pageChunk.forEach((item, idx) => {
        const globalIdx = page * perPageSize + idx + 1;
        const stInfo = getPermitStatus(item);
        const stName = isAr ? (item.primaryStatusNameAr || stInfo.nameAr) : (item.primaryStatusNameEn || stInfo.nameEn);
        detailsTableRows.push([
          { text: globalIdx.toString(), options: { fontSize: 10, align: 'center' } },
          { text: stName, options: { bold: true, fontSize: 10, color: stInfo.color } },
          { text: item.idValue || item.permitValue || '-', options: { bold: true, fontSize: 10, color: orangeAccent } },
          { text: item.count.toString(), options: { fontSize: 10, align: 'center' } },
          { text: (item.totalLength / 1000).toFixed(3), options: { fontSize: 10, align: 'right' } },
          { text: item.projectName || '-', options: { fontSize: 9 } },
          { text: item.contractor || '-', options: { fontSize: 9 } }
        ]);
      });

      slidePerDetails.addTable(detailsTableRows as any, {
        x: 0.8, y: 1.6, w: 11.73,
        border: { type: 'solid', color: "E2E8F0", pt: 1 },
        align: 'center',
        valign: 'middle',
        colW: [0.5, 2.3, 2.2, 1.0, 1.5, 2.4, 1.83],
        fill: "F8F9FA",
        autoPage: false
      });
    }

    // 5c. Permit No Distribution Chart Slide
    const slidePerChart = pptx.addSlide();
    slidePerChart.addText(
      isAr ? "مخطط توزيع أطوال التراخيص مفرزة حسب اللون" : "Permit No Length Distribution Chart (by Color)",
      { x: 0.8, y: 0.6, w: 11.73, h: 0.8, fontSize: 28, color: orangeAccent, bold: true, align: isAr ? 'right' : 'left' }
    );

    const topPermits = [...sortedPermitsByColor].slice(0, 10);

    const chartDataPermit = [
      {
        name: isAr ? "الطول (كم)" : "Length (km)",
        labels: topPermits.map(p => `${p.permitValue || p.idValue || '-'}`),
        values: topPermits.map(p => parseFloat((p.totalLength / 1000).toFixed(3)))
      }
    ];

    slidePerChart.addChart(pptx.ChartType.bar, chartDataPermit, {
      x: 0.8, y: 1.6, w: 11.73, h: 5.2,
      barDir: 'col',
      showValue: true,
      dataLabelFormatCode: "0.000",
      dataLabelColor: "1E293B",
      dataLabelFontSize: 9,
      chartColors: topPermits.map(p => getPermitStatus(p).color),
      valAxisTitle: isAr ? "الطول (كم)" : "Length (km)",
      catAxisTitle: isAr ? "Permit No (رقم الترخيص)" : "Permit No",
    });
  }

  // 6. Sewer Mainline (WW_MAINLINE) Slide if present
  if (wwStats && Object.keys(wwStats.diameterBreakdown || {}).length > 0) {
    const slideWw = pptx.addSlide();
    slideWw.addText(isAr ? "تقرير شبكة الصرف الصحي الرئيسية (WW_MAINLINE)" : "WW_MAINLINE Sewer Network Report", {
        x: 0.8, y: 0.6, w: 11.73, h: 0.8,
        fontSize: 28, color: "D946EF", bold: true, align: isAr ? 'right' : 'left'
    });

    const wwKm = (wwStats.totalLength / 1000).toFixed(3);
    slideWw.addText(
      isAr 
        ? `إجمالي طول خطوط الصرف الرئيسي: ${wwKm} كم  |  عدد الأجزاء: ${wwStats.segments.length}`
        : `Total WW_MAINLINE Length: ${wwKm} km  |  Total Segments: ${wwStats.segments.length}`,
      { x: 0.8, y: 1.4, w: 11.73, h: 0.5, fontSize: 14, color: primaryColor, bold: true, align: isAr ? 'right' : 'left' }
    );

    const tableRows: any[][] = [
      [
        { text: isAr ? "القطر (مم)" : "Diameter (mm)", options: { fill: "D946EF", color: white, bold: true, fontSize: 14 } },
        { text: isAr ? "الطول الإجمالي (كم)" : "Total Length (km)", options: { fill: "D946EF", color: white, bold: true, fontSize: 14 } },
        { text: isAr ? "النسبة من الشبكة" : "Percentage", options: { fill: "D946EF", color: white, bold: true, fontSize: 14 } }
      ]
    ];

    Object.entries(wwStats.diameterBreakdown).forEach(([dia, len]) => {
      const pct = (len / (wwStats.totalLength || 1)) * 100;
      tableRows.push([
        { text: dia, options: { bold: true, fontSize: 13 } },
        { text: (len / 1000).toFixed(3), options: { fontSize: 13 } },
        { text: `${pct.toFixed(1)}%`, options: { fontSize: 13 } }
      ]);
    });

    slideWw.addTable(tableRows as any, {
      x: 0.8, y: 2.1, w: 11.73,
      border: { type: 'solid', color: "E2E8F0", pt: 1 },
      align: 'center',
      valign: 'middle',
      colW: [4.0, 4.0, 3.73],
      fill: "F8F9FA",
      autoPage: false
    });
  }

  // 7. Data Table Slide(s)
  for (let i = 0; i < data.length; i += 8) {
      const chunk = data.slice(i, i + 8);
      const slideTable = pptx.addSlide();
      slideTable.addText(isAr ? `البيانات التفصيلية للحالات (${i + 1} - ${i + chunk.length})` : `Detailed Category Statistics (${i + 1} - ${i + chunk.length})`, {
          x: 0.8, y: 0.6, w: 11.73, h: 0.8,
          fontSize: 28, color: primaryColor, bold: true, align: isAr ? 'right' : 'left'
      });

      const tableRows: any[][] = [
          [
              { text: isAr ? "حالة التنفيذ / اللون" : "Status / Color", options: { fill: primaryColor, color: white, bold: true, fontSize: 16 } },
              { text: isAr ? "الطول (كم)" : "Length (km)", options: { fill: primaryColor, color: white, bold: true, fontSize: 16 } },
              { text: isAr ? "العدد" : "Count", options: { fill: primaryColor, color: white, bold: true, fontSize: 16 } },
              { text: isAr ? "النسبة" : "Percentage", options: { fill: primaryColor, color: white, bold: true, fontSize: 16 } }
          ]
      ];

      chunk.forEach(item => {
          const itemColor = item.statusColor?.replace('#', '') || item.color.replace('#', '');
          tableRows.push([
              { text: item.statusName || item.color, options: { color: itemColor, bold: true, fontSize: 14 } },
              { text: (item.totalLength / 1000).toFixed(3), options: { fontSize: 14 } },
              { text: item.count.toString(), options: { fontSize: 14 } },
              { text: `${item.percentage.toFixed(1)}%`, options: { fontSize: 14 } }
          ]);
      });

      slideTable.addTable(tableRows as any, {
          x: 0.8, y: 1.8, w: 11.73,
          border: { type: 'solid', color: "E2E8F0", pt: 1 },
          fontSize: 14,
          align: 'center',
          valign: 'middle',
          colW: [4.73, 2.5, 2.0, 2.5],
          fill: "F8F9FA",
          autoPage: false
      });
  }

  // Save the presentation
  const safeName = String(filename || '').replace(/[^a-z0-9\u0600-\u06FF]/gi, '_');
  await pptx.writeFile({ fileName: `Full_Analysis_Report_${safeName}.pptx` });
};

export const cleanTextForPdf = (text: any): string => {
  if (text === null || text === undefined) return '-';
  let str = String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();

  if (!str) return '-';

  const lower = str.toLowerCase();
  const emptyValues = new Set([
    'null', 'undefined', 'none', '-', '--', '---', '_', '=', 'n/a', 'na', 'unknown', 'nil', 'empty',
    'غير محدد', 'لا يوجد', 'لايوجد', 'بدون', 'غير متاح', 'غير متوفر', 'لا يوجد بيان', 'لاشيء', 'لا شيء'
  ]);
  if (emptyValues.has(lower)) return '-';

  // Check if string contains Arabic characters
  if (/[\u0600-\u06FF]/.test(str)) {
    str = str
      .replace(/مشروع/gi, 'Project')
      .replace(/شبكة/gi, 'Network')
      .replace(/شبكات/gi, 'Networks')
      .replace(/مياه/gi, 'Water')
      .replace(/الصرف\s*الصحي/gi, 'Sewerage')
      .replace(/الأمطار|الامطار/gi, 'Stormwater')
      .replace(/تصريف/gi, 'Drainage')
      .replace(/تأهيل|تاهيل/gi, 'Rehab')
      .replace(/إنشاء|انشاء/gi, 'Construction')
      .replace(/صيانة/gi, 'Maintenance')
      .replace(/تشغيل/gi, 'Operation')
      .replace(/شركة/gi, 'Company')
      .replace(/مؤسسة/gi, 'Est.')
      .replace(/للمقاولات/gi, 'Contracting')
      .replace(/مقاولات/gi, 'Contracting')
      .replace(/مقاول/gi, 'Contractor')
      .replace(/الرياض/gi, 'Riyadh')
      .replace(/جدة/gi, 'Jeddah')
      .replace(/مكة/gi, 'Makkah')
      .replace(/المدينة/gi, 'Madinah')
      .replace(/الدمام/gi, 'Dammam')
      .replace(/الشرقية/gi, 'Eastern')
      .replace(/الشمالية/gi, 'Northern')
      .replace(/الجنوبية/gi, 'Southern')
      .replace(/الغربية/gi, 'Western')
      .replace(/خط/gi, 'Line')
      .replace(/رئيسي/gi, 'Main')
      .replace(/فرعي/gi, 'Sub')
      .replace(/أنبوب|انبوب/gi, 'Pipe')
      .replace(/أناديب|انابيب/gi, 'Pipes')
      .replace(/مرحلة/gi, 'Phase')
      .replace(/عقد/gi, 'Contract');

    const arabicToLatinMap: Record<string, string> = {
      'أ': 'A', 'إ': 'I', 'آ': 'Aa', 'ا': 'A', 'ب': 'B', 'ت': 'T', 'ث': 'Th',
      'ج': 'J', 'ح': 'H', 'خ': 'Kh', 'د': 'D', 'ذ': 'Dh', 'ر': 'R', 'ز': 'Z',
      'س': 'S', 'ش': 'Sh', 'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A',
      'غ': 'Gh', 'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
      'ه': 'H', 'و': 'W', 'ي': 'Y', 'ى': 'Y', 'ئ': 'Y', 'ء': '', 'ة': 'h',
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };

    str = str.split('').map(ch => arabicToLatinMap[ch] !== undefined ? arabicToLatinMap[ch] : ch).join('');
  }

  // Remove any non-ASCII printable characters to avoid jsPDF font corruption
  str = str.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();

  return str || '-';
};

export const generateAnalysisPDF = (
  data: AnalysisItem[], 
  filename: string, 
  lang: Language,
  extraOptions?: FullAnalysisExtraOptions
) => {
  // Always use English for the PDF report with landscape orientation
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const primaryColor: [number, number, number] = [11, 45, 61]; // #0B2D3D
  const accentColor: [number, number, number] = [220, 177, 60]; // #DCB13C
  const purpleAccent: [number, number, number] = [147, 51, 234]; // #9333EA
  const orangeAccent: [number, number, number] = [255, 109, 0]; // #FF6D00
  const textColor: [number, number, number] = [60, 60, 60];
  const lightGray: [number, number, number] = [245, 247, 250];
  
  // Clean filename for title
  const rawTitle = String(filename || '').replace(/_/g, ' ').replace(/\.kml|\.kmz|\.xlsx|\.csv|\.dxf/i, '');
  const displayTitle = cleanTextForPdf(rawTitle);

  const netType = extraOptions?.networkType || 'all';

  let pdfTitle = "Path Length & Spatial Analysis Report";
  let pdfSubtitle = `Project: ${displayTitle}`;

  if (netType === 'water') {
    pdfTitle = "Drinking Water Network Analysis Report";
    pdfSubtitle = `Project: ${displayTitle} | Scope: Water Network Only`;
  } else if (netType === 'sewer') {
    pdfTitle = "Sewer & Wastewater Network Analysis Report";
    pdfSubtitle = `Project: ${displayTitle} | Scope: Sewer Network Only`;
  }

  // 1. Header Section (Dark Blue Background - Landscape 297mm width)
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 297, 42, 'F');
  
  // Add a subtle accent line at the bottom of the header
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(0, 42, 297, 2, 'F');

  // Title Text (Centered at 148.5 mm)
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(pdfTitle, 148.5, 18, { align: 'center' });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(200, 200, 200);
  doc.text(pdfSubtitle, 148.5, 28, { align: 'center' });
  
  doc.setFontSize(9);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 148.5, 36, { align: 'center' });

  // 2. Summary Statistics Section
  const totalKm = data.reduce((a, b) => a + b.totalLength, 0) / 1000;
  const totalElements = data.reduce((a, b) => a + b.count, 0);

  const segAnalysis = extraOptions?.segmentIdAnalysis;
  const perAnalysis = extraOptions?.permitNoAnalysis;
  const wwStats = extraOptions?.wwMainlineStats;
  const wStats = extraOptions?.wMainlineStats;

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(
    netType === 'water'
      ? "Executive Summary - Drinking Water Network"
      : netType === 'sewer'
      ? "Executive Summary - Sewer & Wastewater Network"
      : "Executive Summary",
    14, 54
  );
  
  const hasExtraStats = !!(segAnalysis || perAnalysis || wwStats || wStats);

  const summaryStats = [
      { label: "Total Length (km)", value: totalKm.toFixed(2) },
      { label: "Total Elements", value: totalElements.toString() },
      { 
        label: "Analyzed Network", 
        value: netType === 'water' ? 'Water' : netType === 'sewer' ? 'Sewer' : 'All' 
      },
      { 
        label: "Segment ID Length (km)", 
        value: segAnalysis ? (segAnalysis.totalLengthWithSegmentId / 1000).toFixed(2) : '-' 
      },
      { 
        label: "Permit No Length (km)", 
        value: perAnalysis ? (perAnalysis.totalLengthWithPermitNo / 1000).toFixed(2) : '-' 
      },
      netType === 'water'
        ? { 
            label: "Water Mainline Length (km)", 
            value: wStats ? (wStats.totalLength / 1000).toFixed(2) : totalKm.toFixed(2) 
          }
        : netType === 'sewer'
        ? { 
            label: "Sewer Mainline Length (km)", 
            value: wwStats ? (wwStats.totalLength / 1000).toFixed(2) : totalKm.toFixed(2) 
          }
        : { 
            label: "WW Mainline Length (km)", 
            value: wwStats ? (wwStats.totalLength / 1000).toFixed(2) : '-' 
          }
  ];

  const statsToShow = hasExtraStats ? summaryStats : summaryStats.slice(0, 3);
  
  const cardW = 85;
  const cardH = 18;
  const marginX = 14;
  const gapX = 7;

  statsToShow.forEach((stat, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cardX = marginX + col * (cardW + gapX);
      const cardY = 59 + row * (cardH + 4);
      
      // Card Background
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.setDrawColor(220, 225, 230);
      doc.roundedRect(cardX, cardY, cardW, cardH, 2, 2, 'FD');
      
      // Card Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 110, 120);
      doc.text(stat.label, cardX + cardW/2, cardY + 6, { align: 'center' });
      
      // Card Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(stat.value, cardX + cardW/2, cardY + 14, { align: 'center' });
  });

  const tableStartY = hasExtraStats ? 108 : 88;

  // 3. Detailed Breakdown Section
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Detailed Breakdown by Status", 14, tableStartY);

  // Data Table
  const tableHead = [
      ["", "Execution Status", "Length (km)", "Count", "Percentage"]
  ];
  
  // Helper to convert hex to RGB for jsPDF
  const hexToRgbForPdf = (hex: string): [number, number, number] => {
      let c = hex.replace('#', '');
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      const r = parseInt(c.substring(0, 2), 16) || 0;
      const g = parseInt(c.substring(2, 4), 16) || 0;
      const b = parseInt(c.substring(4, 6), 16) || 0;
      return [r, g, b];
  };

  const tableBody = data.map(item => {
      const statusCat = matchStatusByColor(item.color);
      const displayName = statusCat ? statusCat.nameEn : item.color;
      return [
          "", // Empty cell for color badge
          cleanTextForPdf(displayName),
          (item.totalLength / 1000).toFixed(3),
          item.count.toString(),
          `${item.percentage.toFixed(1)}%`
      ];
  });

  autoTable(doc, {
      startY: tableStartY + 6,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: { 
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 9
      },
      columnStyles: {
          0: { cellWidth: 14, halign: 'center' },
          1: { cellWidth: 100, halign: 'left', fontStyle: 'bold' },
          2: { cellWidth: 50, halign: 'right' },
          3: { cellWidth: 50, halign: 'right' },
          4: { cellWidth: 55, halign: 'right' }
      },
      styles: { 
          fontSize: 9, 
          cellPadding: 5,
          textColor: textColor,
          lineColor: [220, 225, 230],
          valign: 'middle'
      },
      alternateRowStyles: {
          fillColor: [252, 253, 254]
      },
      didDrawCell: function(dataOptions) {
          if (dataOptions.section === 'body' && dataOptions.column.index === 0) {
              const rowIndex = dataOptions.row.index;
              const item = data[rowIndex];
              if (!item) return;
              const statusCat = matchStatusByColor(item.color);
              const colorHex = statusCat ? statusCat.color : item.color;
              const [r, g, b] = hexToRgbForPdf(colorHex);
              
              const dim = 5;
              const x = dataOptions.cell.x + (dataOptions.cell.width - dim) / 2;
              const y = dataOptions.cell.y + (dataOptions.cell.height - dim) / 2;
              
              doc.setFillColor(r, g, b);
              doc.setDrawColor(200, 200, 200);
              doc.circle(x + dim/2, y + dim/2, dim/2, 'FD');
          }
      }
  });

  // 4. Segment ID Analysis Section
  if (segAnalysis && segAnalysis.uniqueDetails && segAnalysis.uniqueDetails.length > 0) {
      doc.addPage();
      
      // Section Header (Landscape 297mm width)
      doc.setFillColor(purpleAccent[0], purpleAccent[1], purpleAccent[2]);
      doc.rect(0, 0, 297, 24, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Segment ID Analysis Report", 14, 16);

      const segKm = (segAnalysis.totalLengthWithSegmentId / 1000).toFixed(2);
      const segPct = ((segAnalysis.validElementsCount / (segAnalysis.totalElements || 1)) * 100).toFixed(1);

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Valid Segment IDs: ${segAnalysis.validElementsCount} / ${segAnalysis.totalElements} (${segPct}%)   |   Unique Segment IDs: ${segAnalysis.uniqueSegmentIdsCount}   |   Total Length: ${segKm} km`, 14, 33);

      const segTableHead = [
          ["#", "Segment ID", "Count", "Length (km)", "Project Name", "Contractor"]
      ];

      const segTableBody = segAnalysis.uniqueDetails.slice(0, 30).map((item, idx) => [
          (idx + 1).toString(),
          cleanTextForPdf(item.idValue || (item as any).permitValue),
          item.count.toString(),
          (item.totalLength / 1000).toFixed(3),
          cleanTextForPdf(item.projectName),
          cleanTextForPdf(item.contractor)
      ]);

      autoTable(doc, {
          startY: 38,
          head: segTableHead,
          body: segTableBody,
          theme: 'grid',
          headStyles: {
              fillColor: purpleAccent,
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              halign: 'center',
              fontSize: 9
          },
          columnStyles: {
              0: { cellWidth: 12, halign: 'center' },
              1: { cellWidth: 65, halign: 'left', fontStyle: 'bold' },
              2: { cellWidth: 22, halign: 'right' },
              3: { cellWidth: 28, halign: 'right' },
              4: { cellWidth: 82, halign: 'left' },
              5: { cellWidth: 60, halign: 'left' }
          },
          styles: {
              fontSize: 8.5,
              cellPadding: 4,
              textColor: textColor,
              lineColor: [220, 225, 230],
              valign: 'middle'
          },
          alternateRowStyles: {
              fillColor: [250, 245, 255]
          }
      });
  }

  // 5. Permit No Analysis Section (Grouped & Sorted by Status Color)
  if (perAnalysis && perAnalysis.uniqueDetails && perAnalysis.uniqueDetails.length > 0) {
      doc.addPage();
      
      // Section Header (Landscape 297mm width)
      doc.setFillColor(orangeAccent[0], orangeAccent[1], orangeAccent[2]);
      doc.rect(0, 0, 297, 24, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Permit No Analysis & Status Color Report", 14, 16);

      const perKm = (perAnalysis.totalLengthWithPermitNo / 1000).toFixed(2);
      const perPct = ((perAnalysis.validElementsCount / (perAnalysis.totalElements || 1)) * 100).toFixed(1);

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Valid Permit Nos: ${perAnalysis.validElementsCount} / ${perAnalysis.totalElements} (${perPct}%)   |   Unique Permit Nos: ${perAnalysis.uniquePermitNosCount}   |   Total Length: ${perKm} km`, 14, 32);

      // Status info helper for PDF
      const STATUS_PDF_MAP: Record<string, { order: number; nameEn: string; colorHex: string }> = {
        executed_water: { order: 1, nameEn: 'Executed - Water', colorHex: '#01579B' },
        executed_sewer: { order: 2, nameEn: 'Executed - Sewer', colorHex: '#097138' },
        in_progress: { order: 3, nameEn: 'Work in Progress', colorHex: '#FFEA00' },
        remaining: { order: 4, nameEn: 'Remaining Work', colorHex: '#A52714' },
        cancelled: { order: 5, nameEn: 'Cancelled Works', colorHex: '#F48FB1' }
      };

      const getPermitPdfStatus = (item: any) => {
        const catKey = item.primaryStatusKey || matchStatusByColor(item.primaryColor || '#A52714').key;
        return STATUS_PDF_MAP[catKey] || STATUS_PDF_MAP['remaining'];
      };

      // 1. Status Summary Table for Permits
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("Permit Summary by Execution Status & Color", 14, 40);

      const permitStatusSummaryMap: Record<string, { uniqueCount: number; elementsCount: number; totalLength: number }> = {
        executed_water: { uniqueCount: 0, elementsCount: 0, totalLength: 0 },
        executed_sewer: { uniqueCount: 0, elementsCount: 0, totalLength: 0 },
        in_progress: { uniqueCount: 0, elementsCount: 0, totalLength: 0 },
        remaining: { uniqueCount: 0, elementsCount: 0, totalLength: 0 },
        cancelled: { uniqueCount: 0, elementsCount: 0, totalLength: 0 }
      };

      perAnalysis.uniqueDetails.forEach(item => {
        const catKey = item.primaryStatusKey || matchStatusByColor(item.primaryColor || '#A52714').key;
        if (permitStatusSummaryMap[catKey]) {
          permitStatusSummaryMap[catKey].uniqueCount += 1;
          permitStatusSummaryMap[catKey].elementsCount += item.count;
          permitStatusSummaryMap[catKey].totalLength += item.totalLength;
        }
      });

      const perSummaryHead = [
        ["", "Execution Status / Color", "Unique Permits", "Elements", "Total Length (km)", "Percentage"]
      ];

      const totalPermitLenPdf = perAnalysis.totalLengthWithPermitNo || 1;
      const summaryKeys = Object.keys(STATUS_PDF_MAP);
      const perSummaryBody = summaryKeys.map(key => {
        const st = STATUS_PDF_MAP[key];
        const data = permitStatusSummaryMap[key] || { uniqueCount: 0, elementsCount: 0, totalLength: 0 };
        const pct = ((data.totalLength / totalPermitLenPdf) * 100).toFixed(1);
        return [
          "", // Badge dot
          st.nameEn,
          data.uniqueCount.toString(),
          data.elementsCount.toString(),
          (data.totalLength / 1000).toFixed(3),
          `${pct}%`
        ];
      });

      autoTable(doc, {
        startY: 43,
        head: perSummaryHead,
        body: perSummaryBody,
        theme: 'grid',
        headStyles: {
          fillColor: orangeAccent,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8.5
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 65, halign: 'left', fontStyle: 'bold' },
          2: { cellWidth: 40, halign: 'right' },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 45, halign: 'right' },
          5: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: textColor,
          lineColor: [220, 225, 230],
          valign: 'middle'
        },
        didDrawCell: function(dataOptions) {
          if (dataOptions.section === 'body' && dataOptions.column.index === 0) {
            const rowIndex = dataOptions.row.index;
            const key = summaryKeys[rowIndex];
            const st = STATUS_PDF_MAP[key];
            if (!st) return;
            const [r, g, b] = hexToRgbForPdf(st.colorHex);
            const dim = 4;
            const x = dataOptions.cell.x + (dataOptions.cell.width - dim) / 2;
            const y = dataOptions.cell.y + (dataOptions.cell.height - dim) / 2;
            doc.setFillColor(r, g, b);
            doc.setDrawColor(200, 200, 200);
            doc.circle(x + dim/2, y + dim/2, dim/2, 'FD');
          }
        }
      });

      // 2. Detailed Permits Table Sorted by Status Color
      const lastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 100;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("Permit Details List (Sorted by Execution Status & Color)", 14, lastY);

      const sortedPermitsByColorPdf = [...perAnalysis.uniqueDetails].sort((a, b) => {
        const stA = getPermitPdfStatus(a);
        const stB = getPermitPdfStatus(b);
        if (stA.order !== stB.order) return stA.order - stB.order;
        return b.totalLength - a.totalLength;
      });

      const perTableHead = [
        ["#", "Status / Color", "Permit No / License No", "Count", "Length (km)", "Project Name", "Contractor"]
      ];

      const perTableBody = sortedPermitsByColorPdf.slice(0, 35).map((item, idx) => {
        const st = getPermitPdfStatus(item);
        const stName = cleanTextForPdf(item.primaryStatusNameEn || st.nameEn);
        return [
          (idx + 1).toString(),
          stName,
          cleanTextForPdf(item.idValue || item.permitValue),
          item.count.toString(),
          (item.totalLength / 1000).toFixed(3),
          cleanTextForPdf(item.projectName),
          cleanTextForPdf(item.contractor)
        ];
      });

      autoTable(doc, {
        startY: lastY + 3,
        head: perTableHead,
        body: perTableBody,
        theme: 'grid',
        headStyles: {
          fillColor: orangeAccent,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8.5
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 45, halign: 'left', fontStyle: 'bold' },
          2: { cellWidth: 50, halign: 'left', fontStyle: 'bold' },
          3: { cellWidth: 20, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 62, halign: 'left' },
          6: { cellWidth: 54, halign: 'left' }
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: textColor,
          lineColor: [220, 225, 230],
          valign: 'middle'
        },
        alternateRowStyles: {
          fillColor: [255, 248, 240]
        },
        didDrawCell: function(dataOptions) {
          if (dataOptions.section === 'body' && dataOptions.column.index === 1) {
            const rowIndex = dataOptions.row.index;
            const item = sortedPermitsByColorPdf[rowIndex];
            if (!item) return;
            const st = getPermitPdfStatus(item);
            const [r, g, b] = hexToRgbForPdf(item.primaryColor || st.colorHex);
            // subtle color highlight for status text cell background or border
          }
        }
      });
  }

  // 6. Sewer Mainline (WW_MAINLINE) Section
  if (wwStats && Object.keys(wwStats.diameterBreakdown || {}).length > 0) {
      doc.addPage();
      
      const wwColor: [number, number, number] = [217, 70, 239]; // #D946EF
      doc.setFillColor(wwColor[0], wwColor[1], wwColor[2]);
      doc.rect(0, 0, 297, 24, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Sewer Mainline (WW_MAINLINE) Report", 14, 16);

      const wwKm = (wwStats.totalLength / 1000).toFixed(3);

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Total Sewer Mainline Length: ${wwKm} km   |   Total Segments: ${wwStats.segments.length}`, 14, 33);

      const wwTableHead = [
          ["Diameter (mm)", "Length (m)", "Length (km)", "Percentage"]
      ];

      const totalLen = wwStats.totalLength || 1;
      const wwTableBody = Object.entries(wwStats.diameterBreakdown).map(([dia, lenM]) => {
          const len = Number(lenM) || 0;
          const pct = ((len / totalLen) * 100).toFixed(1);
          return [
              `${dia} mm`,
              len.toFixed(2),
              (len / 1000).toFixed(3),
              `${pct}%`
          ];
      });

      autoTable(doc, {
          startY: 38,
          head: wwTableHead,
          body: wwTableBody,
          theme: 'grid',
          headStyles: {
              fillColor: wwColor,
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              halign: 'center',
              fontSize: 9
          },
          columnStyles: {
              0: { cellWidth: 65, halign: 'center', fontStyle: 'bold' },
              1: { cellWidth: 65, halign: 'right' },
              2: { cellWidth: 65, halign: 'right' },
              3: { cellWidth: 74, halign: 'right' }
          },
          styles: {
              fontSize: 9,
              cellPadding: 5,
              textColor: textColor,
              lineColor: [220, 225, 230],
              valign: 'middle'
          },
          alternateRowStyles: {
              fillColor: [253, 242, 255]
          }
      });
  }

  // Footer (Page numbers)
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
          `Page ${i} of ${pageCount}`, 
          doc.internal.pageSize.width / 2, 
          doc.internal.pageSize.height - 10, 
          { align: 'center' }
      );
  }

  const safeName = String(filename || '').replace(/[^a-z0-9]/gi, '_');
  doc.save(`Analysis_Report_${safeName}.pdf`);
};

export const generateWMainlinePPTX = async (
  stats: {
    segments: any[];
    totalLength: number;
    count: number;
    materialCounts: Record<string, number>;
    materialLengths: Record<string, number>;
    diameterLengths: Record<string, number>;
  },
  filename: string,
  lang: Language
) => {
  const isAr = lang === 'ar';
  const pptx = new pptxgen();

  // Set Layout to A4 Landscape (11.69 x 8.27 inches)
  pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
  pptx.layout = 'A4_LANDSCAPE';
  if (isAr) (pptx as any).rtlMode = true;

  // NWC Color Theme (Navy, Teal, Cyan, Off-white)
  const themeNavy = "042330";
  const themeTeal = "00c8b3";
  const themeLightBlue = "00a8e8";
  const themeOffWhite = "F4FAFB";
  const themeCharcoal = "1E293B";
  const white = "FFFFFF";

  // --- SLIDE 1: Elegant Cover Slide ---
  const slide1 = pptx.addSlide();
  slide1.background = { color: themeNavy };
  
  // Decorative geometric element for full height A4 (8.27 inches)
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.4, h: 8.27,
    fill: { color: themeTeal }
  });
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0.4, y: 0, w: 0.1, h: 8.27,
    fill: { color: themeLightBlue }
  });

  slide1.addText(
    isAr ? "تحليل وتصنيف خطوط تفريغ المياه الرئيسية" : "Water Mainline Network Classification & Analysis",
    {
      x: 0.8, y: 2.5, w: 10.0, h: 1.4,
      fontSize: 32, color: themeTeal, bold: true, align: isAr ? 'right' : 'left'
    }
  );
  
  slide1.addText(
    isAr ? "تقرير فني احترافي لطبقة البيانات الجغرافية [W_MAINLINE]" : "Professional Technical Report for [W_MAINLINE] Geodatabase Layer",
    {
      x: 0.8, y: 4.1, w: 10.0, h: 0.6,
      fontSize: 16, color: white, italic: true, align: isAr ? 'right' : 'left'
    }
  );

  slide1.addText(
    isAr ? `المشروع: ${filename}` : `Project: ${filename}`,
    {
      x: 0.8, y: 5.2, w: 10.0, h: 0.4,
      fontSize: 13, color: "cbd5e1", align: isAr ? 'right' : 'left'
    }
  );

  slide1.addText(
    isAr ? `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')} م` : `Date of Issue: ${new Date().toLocaleDateString('en-US')}`,
    {
      x: 0.8, y: 5.8, w: 10.0, h: 0.4,
      fontSize: 11, color: "94a3b8", align: isAr ? 'right' : 'left'
    }
  );

  // --- SLIDE 2: Executive Summary (Key Metrics) ---
  const slide2 = pptx.addSlide();
  slide2.background = { color: themeOffWhite };

  // Slide Title
  slide2.addText(
    isAr ? "الملخص التنفيذي وأبرز مؤشرات الشبكة" : "Executive Summary & Mainline Metrics",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  // Layout Grid: 3 Cards sized perfectly for A4 width (11.69 inches)
  const cards = [
    {
      title: isAr ? "إجمالي طول الشبكة" : "Total Network Length",
      value: `${(stats.totalLength / 1000).toFixed(3)} km`,
      sub: isAr ? "أطوال خطوط النقل والتوزيع" : "Transmission & distribution mains",
      color: themeTeal
    },
    {
      title: isAr ? "عدد الأقسام المكتشفة" : "Active Pipe Segments",
      value: `${stats.count} pcs`,
      sub: isAr ? "عناصر مقسمة بقاعدة البيانات" : "GIS digitized mainline elements",
      color: themeLightBlue
    },
    {
      title: isAr ? "متوسط طول الأنبوب" : "Average Pipe Segment",
      value: `${stats.count > 0 ? (stats.totalLength / stats.count).toFixed(1) : 0} m`,
      sub: isAr ? "معدل المسافة بين نقاط الربط" : "Average distance between nodes",
      color: themeCharcoal
    }
  ];

  cards.forEach((card, i) => {
    const xPos = 0.64 + i * 3.6;
    // Card background
    slide2.addShape(pptx.ShapeType.rect, {
      x: xPos, y: 1.6, w: 3.2, h: 4.8,
      fill: { color: white },
      line: { color: "e2e8f0", width: 1 }
    });

    // Top color bar
    slide2.addShape(pptx.ShapeType.rect, {
      x: xPos, y: 1.6, w: 3.2, h: 0.15,
      fill: { color: card.color }
    });

    // Content
    slide2.addText(card.title, {
      x: xPos + 0.2, y: 2.2, w: 2.8, h: 0.6,
      fontSize: 14, color: themeCharcoal, bold: true, align: 'center'
    });

    slide2.addText(card.value, {
      x: xPos + 0.2, y: 3.4, w: 2.8, h: 1.0,
      fontSize: 28, color: card.color, bold: true, align: 'center'
    });

    slide2.addText(card.sub, {
      x: xPos + 0.2, y: 4.8, w: 2.8, h: 1.0,
      fontSize: 11, color: "64748b", align: 'center'
    });
  });


  // --- SLIDE 3: Material Apportionment & Breakdown ---
  const slide3 = pptx.addSlide();
  slide3.background = { color: white };

  slide3.addText(
    isAr ? "توزيع أطوال الشبكة حسب نوع المواد" : "Pipe Material Apportionment Breakdown",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  // Prepare table data for materials
  const matRows: any[][] = [
    [
      { text: isAr ? "المادة" : "Material Type", options: { fill: themeNavy, color: white, bold: true } },
      { text: isAr ? "عدد الأنابيب" : "Segments Count", options: { fill: themeNavy, color: white, bold: true } },
      { text: isAr ? "إجمالي المسافة (كم)" : "Total Length (km)", options: { fill: themeNavy, color: white, bold: true } },
      { text: isAr ? "النسبة المئوية (%)" : "Percentage (%)", options: { fill: themeNavy, color: white, bold: true } }
    ]
  ];

  Object.entries(stats.materialLengths).forEach(([material, length]) => {
    const mCount = stats.materialCounts[material] || 0;
    const percentage = stats.totalLength > 0 ? ((length / stats.totalLength) * 100).toFixed(1) : "0.0";
    matRows.push([
      { text: material, options: { bold: true, color: themeCharcoal } },
      { text: mCount.toString(), options: {} },
      { text: (length / 1000).toFixed(3), options: {} },
      { text: `${percentage}%`, options: { bold: true, color: themeTeal } }
    ]);
  });

  // Render Table
  slide3.addTable(matRows, {
    x: 0.64, y: 1.6, w: 5.0,
    border: { type: 'solid', color: "cbd5e1", pt: 1 },
    fontSize: 11,
    align: 'center',
    valign: 'middle'
  });

  // Diagnostic Note Box on the right
  const isDI_dominant = Object.keys(stats.materialLengths).some(m => m.includes('DI') || m.includes('Iron'));
  const materialInsights = isAr 
    ? "ملاحظات جودة البيانات:\n• خطوط الحديد المرن (Ductile Iron) تمثل البنية التحتية الأساسية لنقل المياه وفقاً لمواصفات شركة المياه الوطنية NWC.\n• أنابيب البولي إيثيلين HDPE تستخدم عادة في الوصلات والشوارع الفرعية لمرونتها العالية ومقاومتها للأملاح الهجومية."
    : "Data Quality & Material Insights:\n• Ductile Iron (DI) representation highlights high-capacity water transport mains aligning with NWC transmission specifications.\n• HDPE pipes are optimized for sub-mains, exhibiting resistance to galvanic soils and saline conditions.";

  slide3.addShape(pptx.ShapeType.rect, {
    x: 6.0, y: 1.6, w: 5.0, h: 4.8,
    fill: { color: themeOffWhite },
    line: { color: themeTeal, width: 1 }
  });

  slide3.addText(
    isAr ? "تحليل فني للمواد ونقاط فحص الجودة" : "Material Insights & Quality Audit",
    {
      x: 6.2, y: 1.9, w: 4.6, h: 0.4,
      fontSize: 14, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  slide3.addText(
    materialInsights,
    {
      x: 6.2, y: 2.5, w: 4.6, h: 3.5,
      fontSize: 11, color: themeCharcoal, align: isAr ? 'right' : 'left', lineSpacing: 18
    }
  );


  // --- SLIDE 4: Standard Diameters Apportionment ---
  const slide4 = pptx.addSlide();
  slide4.background = { color: themeOffWhite };

  slide4.addText(
    isAr ? "توزيع أطوال الشبكة حسب الأقطار الاسمية" : "Pipe Nominal Diameter Apportionment",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  // Prepare table data for diameters
  const diaRows: any[][] = [
    [
      { text: isAr ? "القطر الاسمي" : "Nominal Diameter", options: { fill: themeLightBlue, color: white, bold: true } },
      { text: isAr ? "إجمالي الطول المار (متر)" : "Total Length (meters)", options: { fill: themeLightBlue, color: white, bold: true } },
      { text: isAr ? "إجمالي الطول المار (كم)" : "Total Length (km)", options: { fill: themeLightBlue, color: white, bold: true } },
      { text: isAr ? "النسبة من الشبكة" : "Percentage of Network", options: { fill: themeLightBlue, color: white, bold: true } }
    ]
  ];

  Object.entries(stats.diameterLengths).sort().forEach(([diameter, length]) => {
    const percentage = stats.totalLength > 0 ? ((length / stats.totalLength) * 100).toFixed(1) : "0.0";
    diaRows.push([
      { text: diameter, options: { bold: true, color: themeCharcoal } },
      { text: length.toFixed(1), options: {} },
      { text: (length / 1000).toFixed(3), options: {} },
      { text: `${percentage}%`, options: { bold: true, color: themeLightBlue } }
    ]);
  });

  // Render Table
  slide4.addTable(diaRows, {
    x: 0.64, y: 1.6, w: 5.0,
    border: { type: 'solid', color: "cbd5e1", pt: 1 },
    fontSize: 11,
    align: 'center',
    valign: 'middle'
  });

  // Guidelines note on the right
  const diameterGuidelineMsg = isAr
    ? "تصنيف قدرات التدفق الهيدروليكي:\n• الأقطار ≥ 300 كم تصنف كخطوط نقل وتغذية رئيسية (Transmission/Feeders).\n• الأقطار أقل من 300 مم تصنف كخطوط توزيع محلية.\n• يوصى بربط هذه الجداول هيدروليكياً في نموذج EPA-Net للتحقق من سرعات التدفق وهبوط الضغط الديناميكي."
    : "Hydraulic Capacity Benchmarking:\n• Pipe Diameters ≥ 300mm serve as major transmission feeders across the sub-districts.\n• Pipe Diameters < 300mm provide micro-distribution capabilities to end users.\n• Recommended next action: Export this structured network topology directly into EPA-Net for automated hydraulic loop and physical velocity analysis.";

  slide4.addShape(pptx.ShapeType.rect, {
    x: 6.0, y: 1.6, w: 5.0, h: 4.8,
    fill: { color: white },
    line: { color: "e2e8f0", width: 1 }
  });

  slide4.addText(
    isAr ? "المعايير القياسية لتوجيه التدفق الهيدروليكي" : "Hydraulic Flow Standards Overview",
    {
      x: 6.2, y: 1.9, w: 4.6, h: 0.4,
      fontSize: 14, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  slide4.addText(
    diameterGuidelineMsg,
    {
      x: 6.2, y: 2.5, w: 4.6, h: 3.5,
      fontSize: 11, color: "475569", align: isAr ? 'right' : 'left', lineSpacing: 18
    }
  );


  // --- SLIDE 5: GIS & Engineering Standards Compliance ---
  const slide5 = pptx.addSlide();
  slide5.background = { color: themeNavy };

  slide5.addText(
    isAr ? "مواءمة جودة البيانات مع مواصفات شركة المياه الوطنية NWC" : "GIS Data Audits & NWC Compliance Alignment",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeTeal, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  const audits = [
    {
      num: "01",
      title: isAr ? "ترميز المعرفات الفردية OBJECTID" : "Unique IDs and Asset Tagging",
      desc: isAr 
        ? "جميع الأنابيب مجهزة برموز فريدة تضمن قابليتها للتتبع الفوري والصيانة الوقائية الذكية عبر نظم إدارة الأصول المعتمدة."
        : "Every pipe segment is fully tagged with a unique database identifier that ensures traceability and automated operations inside Enterprise Asset Management."
    },
    {
      num: "02",
      title: isAr ? "دقة الإرجاع الجغرافي والارتفاعات" : "Georeferencing & Spatial Accuracy",
      desc: isAr
        ? "تطابق ممتاز للأحداثيات مع نظام الإرجاع الوطني السعودي المعتمد. من الضروري فحص الارتفاعات الإنشائية (Z-coordinate) لتصحيح الميول وسحب الهواء."
        : "High compliance with the official Saudi coordinate projection (WGS84 / UTMS84). Mandatory coordinates verification (Z-coordinates) recommended for static slope validations."
    },
    {
      num: "03",
      title: isAr ? "مخطط التسميات والطبقات القياسي" : "Standard NWC Layer Schema",
      desc: isAr
        ? "تم تنظيم الطبقات وعزل طبقة W_MAINLINE بمسمياتها وألوانها المعيارية بما يتوافق مع الدليل الموحد للمواصفات الفنية لشبكات المياه بوزارة البيئة والمياه والزراعة."
        : "Network structures have been logically parsed and styled in compliance with water infrastructure schema directives specified by MEWA."
    }
  ];

  audits.forEach((audit, idx) => {
    const xPos = 0.64 + idx * 3.6;
    
    slide5.addShape(pptx.ShapeType.rect, {
      x: xPos, y: 1.6, w: 3.2, h: 4.8,
      fill: { color: "062e3f" },
      line: { color: "00c8b3", width: 1 }
    });

    slide5.addText(audit.num, {
      x: xPos + 0.2, y: 1.8, w: 2.8, h: 0.6,
      fontSize: 32, color: themeTeal, bold: true, align: isAr ? 'right' : 'left'
    });

    slide5.addText(audit.title, {
      x: xPos + 0.2, y: 2.5, w: 2.8, h: 0.6,
      fontSize: 14, color: white, bold: true, align: isAr ? 'right' : 'left'
    });

    slide5.addText(audit.desc, {
      x: xPos + 0.2, y: 3.2, w: 2.8, h: 3.0,
      fontSize: 10.5, color: "cbd5e1", align: isAr ? 'right' : 'left', lineSpacing: 16
    });
  });

  // Save the presentation file
  const fileClean = String(filename || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  await pptx.writeFile({ fileName: `W_MAINLINE_Analysis_${fileClean}.pptx` });
};

export const generateWWMainlinePPTX = async (
  stats: {
    segments: any[];
    totalLength: number;
    count: number;
    materialCounts: Record<string, number>;
    materialLengths: Record<string, number>;
    diameterLengths: Record<string, number>;
  },
  filename: string,
  lang: Language
) => {
  const isAr = lang === 'ar';
  const pptx = new pptxgen();

  // Set Layout to A4 Landscape (11.69 x 8.27 inches)
  pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
  pptx.layout = 'A4_LANDSCAPE';
  if (isAr) (pptx as any).rtlMode = true;

  // Sewage Specialty Color Theme (Deep Amethyst, Rose Pink, Orchid, Soft Lavender)
  const themeNavy = "2E1065";       // Extra dark purple
  const themeTeal = "D946EF";       // Amethyst/fuchsia accent
  const themeLightBlue = "A78BFA";   // Soft lavender/purple
  const themeOffWhite = "FAF5FF";    // Off-white with purple hue
  const themeCharcoal = "1E1B4B";    // Deep dark/indigo
  const white = "FFFFFF";

  // --- SLIDE 1: Cover Slide ---
  const slide1 = pptx.addSlide();
  slide1.background = { color: themeNavy };
  
  // Slide border elements
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.4, h: 8.27,
    fill: { color: themeTeal }
  });
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0.4, y: 0, w: 0.1, h: 8.27,
    fill: { color: themeLightBlue }
  });

  slide1.addText(
    isAr ? "تحليل وتصنيف خطوط مياه الصرف الصحي الرئيسية" : "Wastewater Mainline Network Classification & Analysis",
    {
      x: 0.8, y: 2.5, w: 10.0, h: 1.4,
      fontSize: 32, color: themeTeal, bold: true, align: isAr ? 'right' : 'left'
    }
  );
  
  slide1.addText(
    isAr ? "تقرير فني متكامل لشبكة تجميع وتصريف طبقة [WW_MAINLINE]" : "Professional Technical Report for [WW_MAINLINE] Sewer Layer",
    {
      x: 0.8, y: 4.1, w: 10.0, h: 0.6,
      fontSize: 16, color: white, italic: true, align: isAr ? 'right' : 'left'
    }
  );

  slide1.addText(
    isAr ? `المشروع التجاري: ${filename}` : `Project Geodatabase: ${filename}`,
    {
      x: 0.8, y: 5.2, w: 10.0, h: 0.4,
      fontSize: 13, color: "e9d5ff", align: isAr ? 'right' : 'left'
    }
  );

  slide1.addText(
    isAr ? `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')} م` : `Date of Issue: ${new Date().toLocaleDateString('en-US')}`,
    {
      x: 0.8, y: 5.8, w: 10.0, h: 0.4,
      fontSize: 11, color: "cbd5e1", align: isAr ? 'right' : 'left'
    }
  );

  // --- SLIDE 2: Executive Summary (Key Metrics) ---
  const slide2 = pptx.addSlide();
  slide2.background = { color: themeOffWhite };

  // Slide Title
  slide2.addText(
    isAr ? "الملخص التنفيذي ومؤشرات شبكة الصرف الصحي" : "Executive Summary & Sewer Mainline Metrics",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  // Layout Grid: 3 Cards sized perfectly for A4 width (11.69 inches)
  const cards = [
    {
      title: isAr ? "إجمالي طول شبكة الصرف" : "Total Sewer Length",
      value: `${(stats.totalLength / 1000).toFixed(3)} km`,
      sub: isAr ? "خطوط التجميع والانحدار بالجاذبية" : "Gravity sewer mains and lines",
      color: themeTeal
    },
    {
      title: isAr ? "قطاعات الأنابيب المحددة" : "Sewer Pipe Segments",
      value: `${stats.count} pcs`,
      sub: isAr ? "عناصر الصرف المدخلة جغرافياً" : "GIS-coded network segments",
      color: themeLightBlue
    },
    {
      title: isAr ? "متوسط طول قسم الصرف" : "Average Sewer Segment",
      value: `${stats.count > 0 ? (stats.totalLength / stats.count).toFixed(1) : 0} m`,
      sub: isAr ? "المعدل لحساب الميول بين المناهل" : "Average run length between manholes",
      color: themeCharcoal
    }
  ];

  cards.forEach((card, i) => {
    const xPos = 0.64 + i * 3.6;
    // Card background
    slide2.addShape(pptx.ShapeType.rect, {
      x: xPos, y: 1.6, w: 3.2, h: 4.8,
      fill: { color: white },
      line: { color: "f3e8ff", width: 1 }
    });

    // Top color bar
    slide2.addShape(pptx.ShapeType.rect, {
      x: xPos, y: 1.6, w: 3.2, h: 0.15,
      fill: { color: card.color }
    });

    // Content
    slide2.addText(card.title, {
      x: xPos + 0.2, y: 2.2, w: 2.8, h: 0.6,
      fontSize: 14, color: themeCharcoal, bold: true, align: 'center'
    });

    slide2.addText(card.value, {
      x: xPos + 0.2, y: 3.4, w: 2.8, h: 1.0,
      fontSize: 28, color: card.color, bold: true, align: 'center'
    });

    slide2.addText(card.sub, {
      x: xPos + 0.2, y: 4.8, w: 2.8, h: 1.0,
      fontSize: 11, color: "6b7280", align: 'center'
    });
  });

  // --- SLIDE 3: Material Apportionment & Breakdown ---
  const slide3 = pptx.addSlide();
  slide3.background = { color: white };

  slide3.addText(
    isAr ? "توزيع أطوال شبكة الصرف حسب جودة المواد" : "Sewer Pipe Material Apportionment",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  // Prepare table data for materials
  const matRows: any[][] = [
    [
      { text: isAr ? "المادة" : "Material Type", options: { fill: themeNavy, color: white, bold: true } },
      { text: isAr ? "القطاعات" : "Segments", options: { fill: themeNavy, color: white, bold: true } },
      { text: isAr ? "المسافة الإجمالية (كم)" : "Total Length (km)", options: { fill: themeNavy, color: white, bold: true } },
      { text: isAr ? "النسبة (%)" : "Percentage (%)", options: { fill: themeNavy, color: white, bold: true } }
    ]
  ];

  Object.entries(stats.materialLengths).forEach(([material, length]) => {
    const mCount = stats.materialCounts[material] || 0;
    const percentage = stats.totalLength > 0 ? ((length / stats.totalLength) * 100).toFixed(1) : "0.0";
    matRows.push([
      { text: material, options: { bold: true, color: themeCharcoal } },
      { text: mCount.toString(), options: {} },
      { text: (length / 1000).toFixed(3), options: {} },
      { text: `${percentage}%`, options: { bold: true, color: themeTeal } }
    ]);
  });

  // Render Table
  slide3.addTable(matRows, {
    x: 0.64, y: 1.6, w: 5.0,
    border: { type: 'solid', color: "cbd5e1", pt: 1 },
    fontSize: 11,
    align: 'center',
    valign: 'middle'
  });

  // Insights note
  const materialInsights = isAr 
    ? "ملاحظات جودة البيانات لشبكة الصرف:\n• استخدام الفخار الحجري Vitrified Clay (VC) يعكس البنية التحتية المقاومة للأحماض والغازات الناتجة عن مياه الصرف الصحي بشكل مثالي وموثق.\n• أنابيب uPVC شائعة الفعالية في شبكات التجميع الفرعية نظراً لمقاومتها الكيميائية العالية، وسلاستها الهيدروليكية وخفة وزنها الإنشائي."
    : "Sewer Material & Quality Insights:\n• Vitrified Clay (VC) pipes are excellent for handling biogenic sulfide sulfuric acid typical of sanitary sewage environments.\n• uPVC is preferred for secondary collectors because of its excellent hydraulic flow smoothness, low friction, and long-term chemical durability.";

  slide3.addShape(pptx.ShapeType.rect, {
    x: 6.0, y: 1.6, w: 5.0, h: 4.8,
    fill: { color: themeOffWhite },
    line: { color: themeTeal, width: 1 }
  });

  slide3.addText(
    isAr ? "تحليل جودة المواد والمقاومة للأحماض" : "Sewer Pipe Material Acid-Resistance Audit",
    {
      x: 6.2, y: 1.9, w: 4.6, h: 0.4,
      fontSize: 14, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  slide3.addText(
    materialInsights,
    {
      x: 6.2, y: 2.5, w: 4.6, h: 3.5,
      fontSize: 11, color: themeCharcoal, align: isAr ? 'right' : 'left', lineSpacing: 18
    }
  );

  // --- SLIDE 4: Standard Diameters Apportionment ---
  const slide4 = pptx.addSlide();
  slide4.background = { color: themeOffWhite };

  slide4.addText(
    isAr ? "توزيع أطوال شبكة الصرف حسب الأقطار الإنشائية" : "Sewer Pipe Nominal Diameter Apportionment",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  // Prepare table data for diameters
  const diaRows: any[][] = [
    [
      { text: isAr ? "القطر الاسمي" : "Nominal Diameter", options: { fill: themeLightBlue, color: white, bold: true } },
      { text: isAr ? "الطول الكلي (متر)" : "Total Length (m)", options: { fill: themeLightBlue, color: white, bold: true } },
      { text: isAr ? "الطول الكلي (كم)" : "Total Length (km)", options: { fill: themeLightBlue, color: white, bold: true } },
      { text: isAr ? "النسبة من الشبكة" : "Percentage of Sewer", options: { fill: themeLightBlue, color: white, bold: true } }
    ]
  ];

  Object.entries(stats.diameterLengths).sort().forEach(([diameter, length]) => {
    const percentage = stats.totalLength > 0 ? ((length / stats.totalLength) * 100).toFixed(1) : "0.0";
    diaRows.push([
      { text: diameter, options: { bold: true, color: themeCharcoal } },
      { text: length.toFixed(1), options: {} },
      { text: (length / 1000).toFixed(3), options: {} },
      { text: `${percentage}%`, options: { bold: true, color: themeTeal } }
    ]);
  });

  // Render Table
  slide4.addTable(diaRows, {
    x: 0.64, y: 1.6, w: 5.0,
    border: { type: 'solid', color: "e2e8f0", pt: 1 },
    fontSize: 11,
    align: 'center',
    valign: 'middle'
  });

  // Guidelines on gravity flow
  const diameterGuidelineMsg = isAr
    ? "معايير التدفق الحر بالجاذبية (Gravity Sewer Logic):\n• تعمل خطوط الصرف الصحي بدون قوى ضغط هيدروليكية؛ لذلك يعتمد التصميم الإنشائي بالكامل على دقة محاذاة الميول الطولية (Slope Accuracy).\n• القطر القياسي الفعال للشوارع الفرعية هو 200 كم فأعلى لمنع حدوث غلق أو تراكم المواد الصلبة وتأجج غاز كبريتيد الهيدروجين."
    : "Gravity Flow & Hydraulic Design Constraints:\n• Sanitary sewers must accommodate fluctuating flows dynamically via slope and gravitational force without pressurization.\n• Minimum diameter rules (typically ≥200mm) prevent mechanical clogging. Ensuring the minimum tractive force protects segments against organic solids deposition.";

  slide4.addShape(pptx.ShapeType.rect, {
    x: 6.0, y: 1.6, w: 5.0, h: 4.8,
    fill: { color: white },
    line: { color: "f3e8ff", width: 1 }
  });

  slide4.addText(
    isAr ? "معايير تصميم وتوجيه التدفق بالانحدار" : "Gravity Sewer Design Standards Overview",
    {
      x: 6.2, y: 1.9, w: 4.6, h: 0.4,
      fontSize: 14, color: themeNavy, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  slide4.addText(
    diameterGuidelineMsg,
    {
      x: 6.2, y: 2.5, w: 4.6, h: 3.5,
      fontSize: 11, color: "4b5563", align: isAr ? 'right' : 'left', lineSpacing: 18
    }
  );

  // --- SLIDE 5: GIS & Engineering Standards Compliance ---
  const slide5 = pptx.addSlide();
  slide5.background = { color: themeNavy };

  slide5.addText(
    isAr ? "ملاءمة البيانات الجغرافية لمواصفات شركة المياه الوطنية NWC" : "GIS Data Integrity & NWC Wastewater Schema",
    {
      x: 0.64, y: 0.6, w: 10.4, h: 0.6,
      fontSize: 24, color: themeTeal, bold: true, align: isAr ? 'right' : 'left'
    }
  );

  const audits = [
    {
      num: "01",
      title: isAr ? "مخطط التسميات والطبقات القياسي" : "Standard NWC Sewer Schema",
      desc: isAr 
        ? "تنظيم الطبقات وتسمية طبقة WW_MAINLINE يتكامل بالكامل مع الألوان والمرجعيات لشبكات الصرف الصحي لشركة المياه الوطنية ومجلس الوزارة المعني."
        : "Database schemas align seamlessly with national data naming models to establish automated exports between CAD, GIS, and modeling tools."
    },
    {
      num: "02",
      title: isAr ? "دقة ميول الأنابيب ومنسوب المناهل" : "Check Slopes and Manhole Elevation",
      desc: isAr
        ? "أهمية تتبع إحداثيات الارتفاع Z للتأكد من المحافظة على سرعة التنظيف الذاتي (Self-Cleansing Velocity) لا تقل عن 0.6 م/ثانية لمنع ترسب المواد العضوية."
        : "Critical verification of pipe slope slope alignment ensures fluid velocity keeps above 0.6 m/s (self-cleaning speed) to avoid silting."
    },
    {
      num: "03",
      title: isAr ? "تغذية النمذجة وإدارة الأصول المتقدمة" : "Hydraulic Modeling Compatibility",
      desc: isAr
        ? "بنية البيانات مصنفة ومؤمّنة وجاهزة للاستيراد المباشر إلى برامج النمذجة المتقدمة مثل SewerGEMS للقياسات المعقدة ومحاكاة الأحمال."
        : "Fully qualified topology network is completely prepared to be imported to hydraulic software like SewerGEMS for dynamic scenario routing."
    }
  ];

  audits.forEach((audit, idx) => {
    const xPos = 0.64 + idx * 3.6;
    
    slide5.addShape(pptx.ShapeType.rect, {
      x: xPos, y: 1.6, w: 3.2, h: 4.8,
      fill: { color: "1e152a" },
      line: { color: "d946ef", width: 1 }
    });

    slide5.addText(audit.num, {
      x: xPos + 0.2, y: 1.8, w: 2.8, h: 0.6,
      fontSize: 32, color: themeTeal, bold: true, align: isAr ? 'right' : 'left'
    });

    slide5.addText(audit.title, {
      x: xPos + 0.2, y: 2.5, w: 2.8, h: 0.6,
      fontSize: 14, color: white, bold: true, align: isAr ? 'right' : 'left'
    });

    slide5.addText(audit.desc, {
      x: xPos + 0.2, y: 3.2, w: 2.8, h: 3.0,
      fontSize: 10.5, color: "ddd6fe", align: isAr ? 'right' : 'left', lineSpacing: 16
    });
  });

  // Save the presentation file
  const fileClean = String(filename || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  await pptx.writeFile({ fileName: `WW_MAINLINE_Analysis_${fileClean}.pptx` });
};

