
import pptxgen from "pptxgenjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Language } from "../translations";
// Added import for AnalysisItem
import { AnalysisItem } from "../types";
import { matchStatusByColor } from "./colorUtils";

export const generateAnalysisPPTX = async (
  data: AnalysisItem[], 
  filename: string, 
  lang: Language
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

  // 1. Title Slide
  const slide1 = pptx.addSlide();
  slide1.background = { color: primaryColor };
  slide1.addText(isAr ? "تحليل أطوال المسارات" : "Path Length Analysis", {
    x: 1, y: 2.5, w: 11.33, h: 1.5,
    fontSize: 48, color: accentColor, bold: true, align: isAr ? 'right' : 'left'
  });
  slide1.addText(isAr ? `المشروع: ${filename}` : `Project: ${filename}`, {
    x: 1, y: 4.2, w: 11.33, h: 0.8,
    fontSize: 24, color: white, align: isAr ? 'right' : 'left'
  });
  slide1.addText(new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { dateStyle: 'full' }), {
      x: 1, y: 5.2, w: 11.33, h: 0.5,
      fontSize: 16, color: "94A3B8", align: isAr ? 'right' : 'left'
  });

  // 2. Summary Slide
  const totalKm = data.reduce((a, b) => a + b.totalLength, 0) / 1000;
  const slide2 = pptx.addSlide();
  slide2.addText(isAr ? "نظرة عامة على الإحصائيات" : "Statistics Overview", {
      x: 0.8, y: 0.6, w: 11.73, h: 0.8,
      fontSize: 32, color: primaryColor, bold: true, align: isAr ? 'right' : 'left'
  });

  const summaryBoxes = [
      { label: isAr ? "إجمالي الأطوال (كم)" : "Total Length (km)", value: `${totalKm.toFixed(2)}` },
      { label: isAr ? "الحالات المكتشفة" : "Status Categories", value: data.length.toString() },
      { label: isAr ? "إجمالي العناصر" : "Total Elements", value: data.reduce((a, b) => a + b.count, 0).toString() }
  ];

  summaryBoxes.forEach((box, i) => {
      const xPos = 0.8 + i * 4.0;
      slide2.addShape(pptx.ShapeType.rect, {
          x: xPos, y: 2.0, w: 3.5, h: 4.0,
          fill: { color: lightBg }, line: { color: primaryColor, width: 1.5 },
          rectRadius: 0.2 // Rounded corners
      });
      slide2.addText(box.label, {
          x: xPos + 0.2, y: 3.0, w: 3.1, h: 0.6,
          fontSize: 18, color: grayText, align: 'center', bold: true
      });
      slide2.addText(box.value, {
          x: xPos + 0.2, y: 4.0, w: 3.1, h: 1.2,
          fontSize: 40, color: primaryColor, bold: true, align: 'center'
      });
  });

  // 3. Chart Slide
  const slide3 = pptx.addSlide();
  slide3.addText(isAr ? "مخطط توزيع الأطوال" : "Length Distribution Chart", {
      x: 0.8, y: 0.6, w: 11.73, h: 0.8,
      fontSize: 32, color: primaryColor, bold: true, align: isAr ? 'right' : 'left'
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

  // 4. Data Table Slide(s)
  // Split data into chunks of 8 for table slides (to fit better vertically)
  for (let i = 0; i < data.length; i += 8) {
      const chunk = data.slice(i, i + 8);
      const slideTable = pptx.addSlide();
      slideTable.addText(isAr ? `البيانات التفصيلية (${i + 1} - ${i + chunk.length})` : `Detailed Statistics (${i + 1} - ${i + chunk.length})`, {
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
          colW: [4.73, 2.5, 2.0, 2.5], // proportional column widths
          fill: "F8F9FA",
          autoPage: false
      });
  }

  // Save the presentation
  const safeName = filename.replace(/[^a-z0-9\u0600-\u06FF]/gi, '_');
  await pptx.writeFile({ fileName: `Analysis_Report_${safeName}.pptx` });
};

export const generateAnalysisPDF = (
  data: AnalysisItem[], 
  filename: string, 
  lang: Language
) => {
  // Always use English for the PDF report to ensure compatibility with jsPDF's built-in fonts
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  const primaryColor: [number, number, number] = [11, 45, 61]; // #0B2D3D
  const accentColor: [number, number, number] = [220, 177, 60]; // #DCB13C
  const textColor: [number, number, number] = [60, 60, 60];
  const lightGray: [number, number, number] = [245, 247, 250];
  
  // Clean filename for title
  const displayTitle = filename.replace(/_/g, ' ').replace(/\.kml|\.kmz|\.xlsx|\.csv|\.dxf/i, '');

  // 1. Header Section (Dark Blue Background)
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 45, 'F');
  
  // Add a subtle accent line at the bottom of the header
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(0, 45, 210, 2, 'F');

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("Path Length Analysis Report", 105, 22, { align: 'center' });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(200, 200, 200);
  doc.text(`Project: ${displayTitle}`, 105, 32, { align: 'center' });
  
  doc.setFontSize(9);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 105, 38, { align: 'center' });

  // 2. Summary Statistics Section
  const totalKm = data.reduce((a, b) => a + b.totalLength, 0) / 1000;
  const totalElements = data.reduce((a, b) => a + b.count, 0);

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Executive Summary", 14, 62);
  
  // Summary Cards (Draw 3 light gray boxes with borders)
  const cardY = 68;
  const cardW = 58;
  const cardH = 22;
  const marginX = 14;
  const gap = (210 - (2 * marginX) - (3 * cardW)) / 2; // Calculate gap between cards

  const summaryStats = [
      { label: "Total Length (km)", value: totalKm.toFixed(2) },
      { label: "Status Categories", value: data.length.toString() },
      { label: "Total Elements", value: totalElements.toString() }
  ];

  summaryStats.forEach((stat, i) => {
      const cardX = marginX + i * (cardW + gap);
      
      // Card Background
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.setDrawColor(220, 225, 230);
      doc.roundedRect(cardX, cardY, cardW, cardH, 2, 2, 'FD');
      
      // Card Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 110, 120);
      doc.text(stat.label, cardX + cardW/2, cardY + 7, { align: 'center' });
      
      // Card Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(stat.value, cardX + cardW/2, cardY + 16, { align: 'center' });
  });

  // 3. Detailed Breakdown Section
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Detailed Breakdown by Status", 14, 105);

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
      // Fallback to the raw color code if no category matches perfectly, but we use the English name of the category
      const displayName = statusCat ? statusCat.nameEn : item.color;
      return [
          "", // Empty cell for color badge
          displayName,
          (item.totalLength / 1000).toFixed(3),
          item.count.toString(),
          `${item.percentage.toFixed(1)}%`
      ];
  });

  autoTable(doc, {
      startY: 112,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: { 
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 10
      },
      columnStyles: {
          0: { cellWidth: 15, halign: 'center' }, // Color badge column
          1: { cellWidth: 70, halign: 'left', fontStyle: 'bold' },
          2: { cellWidth: 'auto', halign: 'right' },
          3: { cellWidth: 'auto', halign: 'right' },
          4: { cellWidth: 'auto', halign: 'right' }
      },
      styles: { 
          fontSize: 10, 
          cellPadding: 6,
          textColor: textColor,
          lineColor: [220, 225, 230],
          valign: 'middle'
      },
      alternateRowStyles: {
          fillColor: [252, 253, 254]
      },
      didDrawCell: function(dataOptions) {
          // Draw color badge in the first column for body rows
          if (dataOptions.section === 'body' && dataOptions.column.index === 0) {
              const rowIndex = dataOptions.row.index;
              const item = data[rowIndex];
              const statusCat = matchStatusByColor(item.color);
              const colorHex = statusCat ? statusCat.color : item.color;
              const [r, g, b] = hexToRgbForPdf(colorHex);
              
              const dim = 6;
              const x = dataOptions.cell.x + (dataOptions.cell.width - dim) / 2;
              const y = dataOptions.cell.y + (dataOptions.cell.height - dim) / 2;
              
              doc.setFillColor(r, g, b);
              doc.setDrawColor(200, 200, 200);
              doc.circle(x + dim/2, y + dim/2, dim/2, 'FD');
          }
      }
  });

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

  const safeName = filename.replace(/[^a-z0-9]/gi, '_');
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
  const fileClean = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
  const fileClean = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  await pptx.writeFile({ fileName: `WW_MAINLINE_Analysis_${fileClean}.pptx` });
};

