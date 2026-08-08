import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GeoPoint } from '../types';
import { NetworkGap } from './geometryService';

export const downloadDataPDF = (data: GeoPoint[], filename: string, lang: 'en' | 'ar') => {
  const isAr = lang === 'ar';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const primaryColor: [number, number, number] = [11, 45, 61]; 
  
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 297, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Spatial Data Report", 148.5, 18, { align: 'center' });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text(`File: ${filename}`, 148.5, 25, { align: 'center' });

  const tableHead = [
    ["ID", "Type", "Layer", "Lat / Y", "Lon / X", "Length (m)", "Color"]
  ];
  
  const tableBody = data.map(item => [
    item.id || "-",
    item.type || "Point",
    item.layer || "-",
    item.y.toFixed(6),
    item.x.toFixed(6),
    item.originalLength ? item.originalLength.toFixed(2) : "-",
    item.color || "-"
  ]);

  autoTable(doc, {
    startY: 40,
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
    styles: { 
        fontSize: 8, 
        cellPadding: 3,
        textColor: [60, 60, 60],
        halign: 'center'
    }
  });

  const safeName = filename.replace(/[^a-z0-9]/gi, '_');
  doc.save(`${safeName}_Data.pdf`);
};

/**
 * دالة لتوليد صورة مصغرة خريطة خفيفة على Canvas لإحدى الفجوات الشبكية
 */
const generateGapMapThumbnail = (gap: NetworkGap): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Fill dark navy map background
    ctx.fillStyle = '#0b2d3d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw coordinate grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // If nearest line point exists, draw connecting gap line
    if (gap.endCoord) {
      const scale = 80000;
      let dx = (gap.endCoord.x - gap.startCoord.x) * scale;
      let dy = -(gap.endCoord.y - gap.startCoord.y) * scale;

      // Normalize distance to stay inside canvas view
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const targetLen = Math.min(Math.max(len, 35), 75);
        dx = (dx / len) * targetLen;
        dy = (dy / len) * targetLen;
      }

      const endX = centerX + dx;
      const endY = centerY + dy;

      // Connection dashed vector
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#FF3300';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Nearest candidate node
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(endX, endY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Distance tag
      if (gap.gapDistanceMeters) {
        const midX = (centerX + endX) / 2;
        const midY = (centerY + endY) / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(midX - 18, midY - 14, 36, 14);
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#fde047';
        ctx.textAlign = 'center';
        ctx.fillText(`${gap.gapDistanceMeters.toFixed(1)}m`, midX, midY - 4);
      }
    }

    // Gap Endpoint Pin (Start Point)
    ctx.fillStyle = 'rgba(255, 51, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FF3300';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Map Header text
    ctx.textAlign = 'left';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#DCB13C';
    ctx.fillText(`GAP #${gap.lineId}`, 8, 16);

    // Coordinates footer overlay
    ctx.font = '8px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`Y: ${gap.startCoord.y.toFixed(6)}`, 8, canvas.height - 16);
    ctx.fillText(`X: ${gap.startCoord.x.toFixed(6)}`, 8, canvas.height - 5);

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('Failed to generate map thumbnail:', e);
    return '';
  }
};

/**
 * تصدير تقرير الفجوات الشبكية PDF مع صور الخريطة المصغرة
 */
export const downloadNetworkGapsPDF = (gaps: NetworkGap[], filename: string, lang: 'en' | 'ar' = 'ar') => {
  const isAr = lang === 'ar';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const primaryColor: [number, number, number] = [11, 45, 61]; 
  const gapColor: [number, number, number] = [255, 51, 0];
  const goldColor: [number, number, number] = [220, 177, 60];

  // Document Header
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 297, 34, 'F');
  
  doc.setFillColor(gapColor[0], gapColor[1], gapColor[2]);
  doc.rect(0, 34, 297, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(isAr ? "Network Gaps Audit Report" : "Network Gaps Audit Report", 148.5, 16, { align: 'center' });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.text(`Project File: ${filename || 'Network'} | Gaps Count: ${gaps.length}`, 148.5, 25, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 148.5, 31, { align: 'center' });

  // Pre-generate map thumbnails for each gap
  const gapThumbnails = gaps.map(g => generateGapMapThumbnail(g));

  const tableHead = [
    ["#", "Line ID", "Layer", "Endpoint", "Gap Start (Y, X)", "Gap Distance", "Nearest Line ID", "Location Map Thumbnail"]
  ];

  const tableBody = gaps.map((gap, index) => [
    String(index + 1),
    String(gap.lineId),
    String(gap.layer || 'Default'),
    gap.endpointType === 'start' ? 'Start Point' : 'End Point',
    `${gap.startCoord.y.toFixed(5)}, ${gap.startCoord.x.toFixed(5)}`,
    gap.gapDistanceMeters ? `${gap.gapDistanceMeters.toFixed(1)} m` : '> 35 m',
    String(gap.nearestLineId || '-'),
    "" // Placeholder for thumbnail image
  ]);

  autoTable(doc, {
    startY: 40,
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
    styles: { 
      fontSize: 8, 
      cellPadding: 3,
      textColor: [50, 50, 50],
      halign: 'center',
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 28 },
      2: { cellWidth: 32 },
      3: { cellWidth: 25 },
      4: { cellWidth: 45 },
      5: { cellWidth: 25 },
      6: { cellWidth: 28 },
      7: { cellWidth: 48, minCellHeight: 24 }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const gapIdx = data.row.index;
        const imgData = gapThumbnails[gapIdx];
        if (imgData) {
          doc.addImage(imgData, 'PNG', data.cell.x + 2, data.cell.y + 2, 44, 20);
        }
      }
    }
  });

  const safeName = (filename || 'Network').replace(/[^a-z0-9]/gi, '_');
  doc.save(`Network_Gaps_PDF_Report_${safeName}.pdf`);
};

