import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GeoPoint } from '../types';

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
