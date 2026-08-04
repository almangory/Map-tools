import re

with open('components/DataFormatter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace handleApplyExportKMZ
old_kmz = r"""  const handleApplyExportKMZ = \(pts\?: GeoPoint\[\]\) => \{
    const \{ processedPoints, templateFields \} = getProcessedPoints\(pts\);
    downloadKMZ\(processedPoints, getBaseFilename\(\), \{"""

new_kmz = """  const handleApplyExportKMZ = async (pts?: GeoPoint[]) => {
    try {
      const { processedPoints, templateFields } = getProcessedPoints(pts);
      await downloadKMZ(processedPoints, getBaseFilename(), {"""

content = re.sub(old_kmz, new_kmz, content)

old_kmz_end = r"""    \}, templateFields, templateFields\);
  \};"""
new_kmz_end = """    }, templateFields, templateFields);
    } catch (e: any) { alert("Error exporting KMZ: " + e.message); console.error(e); }
  };"""

content = re.sub(old_kmz_end, new_kmz_end, content)

# Replace handleApplyExportDXF
old_dxf = r"""  const handleApplyExportDXF = \(pts\?: GeoPoint\[\]\) => \{
    const \{ processedPoints \} = getProcessedPoints\(pts\);
    downloadDXF\(processedPoints, getBaseFilename\(\)\);
  \};"""
new_dxf = """  const handleApplyExportDXF = async (pts?: GeoPoint[]) => {
    try {
      const { processedPoints } = getProcessedPoints(pts);
      await downloadDXF(processedPoints, getBaseFilename());
    } catch (e: any) { alert("Error exporting DXF: " + e.message); console.error(e); }
  };"""
content = re.sub(old_dxf, new_dxf, content)

# Replace handleApplyExportPDF
old_pdf = r"""  const handleApplyExportPDF = \(pts\?: GeoPoint\[\]\) => \{
    const \{ processedPoints \} = getProcessedPoints\(pts\);
    downloadDataPDF\(processedPoints, getBaseFilename\(\), lang\);
  \};"""
new_pdf = """  const handleApplyExportPDF = async (pts?: GeoPoint[]) => {
    try {
      const { processedPoints } = getProcessedPoints(pts);
      await downloadDataPDF(processedPoints, getBaseFilename(), lang);
    } catch (e: any) { alert("Error exporting PDF: " + e.message); console.error(e); }
  };"""
content = re.sub(old_pdf, new_pdf, content)

# Replace handleApplyExportExcel
old_excel = r"""  const handleApplyExportExcel = \(pts\?: GeoPoint\[\]\) => \{
    const \{ processedPoints, templateFields \} = getProcessedPoints\(pts\);
    const data = processedPoints\.map\(p => \{"""
new_excel = """  const handleApplyExportExcel = async (pts?: GeoPoint[]) => {
    try {
      const { processedPoints, templateFields } = getProcessedPoints(pts);
      const data = processedPoints.map(p => {"""
content = re.sub(old_excel, new_excel, content)

old_excel_end = r"""    XLSX\.utils\.book_append_sheet\(wb, ws, "Formatted_Data"\);
    XLSX\.writeFile\(wb, `\$\{getBaseFilename\(\)\}\.xlsx`\);
  \};"""
new_excel_end = """    XLSX.utils.book_append_sheet(wb, ws, "Formatted_Data");
    XLSX.writeFile(wb, `${getBaseFilename()}.xlsx`);
    } catch (e: any) { alert("Error exporting Excel: " + e.message); console.error(e); }
  };"""
content = re.sub(old_excel_end, new_excel_end, content)

with open('components/DataFormatter.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done fixing buttons!")
