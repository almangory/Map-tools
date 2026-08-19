export interface GeotaggedPhoto {
  id: string;
  filename: string;
  fileSize: number;
  lat: number;
  lon: number;
  altitude?: number;
  dateTaken?: string;
  cameraModel?: string;
  previewUrl: string;
  notes?: string;
}

/**
 * Pure JavaScript EXIF parser to extract GPS coordinates from JPEG / HEIC images client-side
 */
export async function extractExifFromPhoto(file: File): Promise<GeotaggedPhoto | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    // Check for JPEG SOI marker (0xFFD8)
    if (dataView.getUint16(0, false) !== 0xFFD8) {
      return null;
    }

    let offset = 2;
    const length = dataView.byteLength;
    let exifOffset = -1;

    while (offset < length - 4) {
      const marker = dataView.getUint16(offset, false);
      offset += 2;

      if (marker === 0xFFE1) { // APP1 marker (EXIF)
        const app1Length = dataView.getUint16(offset, false);
        const header = dataView.getUint32(offset + 2, false);
        if (header === 0x45786966) { // "Exif"
          exifOffset = offset + 8;
          break;
        }
        offset += app1Length;
      } else if ((marker & 0xFF00) === 0xFF00) {
        if (marker === 0xFFDA || marker === 0xFFD9) break;
        const markerLength = dataView.getUint16(offset, false);
        offset += markerLength;
      } else {
        break;
      }
    }

    if (exifOffset === -1) return null;

    // Read TIFF header
    const isLittleEndian = dataView.getUint16(exifOffset, false) === 0x4949;
    const firstIFDOffset = dataView.getUint32(exifOffset + 4, isLittleEndian);

    let gpsIFDOffset = -1;
    let dateTaken: string | undefined;
    let cameraModel: string | undefined;

    // Parse IFD0
    const ifd0Start = exifOffset + firstIFDOffset;
    if (ifd0Start < length - 2) {
      const entriesCount = dataView.getUint16(ifd0Start, isLittleEndian);
      for (let i = 0; i < entriesCount; i++) {
        const entryOffset = ifd0Start + 2 + (i * 12);
        if (entryOffset + 12 > length) break;
        const tag = dataView.getUint16(entryOffset, isLittleEndian);

        if (tag === 0x8825) { // GPS Info IFD Pointer
          gpsIFDOffset = exifOffset + dataView.getUint32(entryOffset + 8, isLittleEndian);
        } else if (tag === 0x9003 || tag === 0x0132) { // DateTimeOriginal
          const valOffset = exifOffset + dataView.getUint32(entryOffset + 8, isLittleEndian);
          if (valOffset < length - 20) {
            let str = '';
            for (let c = 0; c < 19; c++) {
              str += String.fromCharCode(dataView.getUint8(valOffset + c));
            }
            dateTaken = str.trim();
          }
        }
      }
    }

    if (gpsIFDOffset === -1 || gpsIFDOffset >= length - 2) return null;

    // Parse GPS IFD
    const gpsEntriesCount = dataView.getUint16(gpsIFDOffset, isLittleEndian);
    let latRef: string | null = null;
    let latValues: number[] = [];
    let lonRef: string | null = null;
    let lonValues: number[] = [];
    let altitude: number | undefined;

    for (let i = 0; i < gpsEntriesCount; i++) {
      const entryOffset = gpsIFDOffset + 2 + (i * 12);
      if (entryOffset + 12 > length) break;
      const tag = dataView.getUint16(entryOffset, isLittleEndian);

      if (tag === 0x0001) { // GPSLatitudeRef
        latRef = String.fromCharCode(dataView.getUint8(entryOffset + 8));
      } else if (tag === 0x0002) { // GPSLatitude
        const valOffset = exifOffset + dataView.getUint32(entryOffset + 8, isLittleEndian);
        latValues = readRationalArray(dataView, valOffset, 3, isLittleEndian);
      } else if (tag === 0x0003) { // GPSLongitudeRef
        lonRef = String.fromCharCode(dataView.getUint8(entryOffset + 8));
      } else if (tag === 0x0004) { // GPSLongitude
        const valOffset = exifOffset + dataView.getUint32(entryOffset + 8, isLittleEndian);
        lonValues = readRationalArray(dataView, valOffset, 3, isLittleEndian);
      } else if (tag === 0x0006) { // GPSAltitude
        const valOffset = exifOffset + dataView.getUint32(entryOffset + 8, isLittleEndian);
        const altRats = readRationalArray(dataView, valOffset, 1, isLittleEndian);
        if (altRats.length > 0) altitude = Math.round(altRats[0] * 10) / 10;
      }
    }

    if (latValues.length === 3 && lonValues.length === 3) {
      let lat = latValues[0] + (latValues[1] / 60) + (latValues[2] / 3600);
      let lon = lonValues[0] + (lonValues[1] / 60) + (lonValues[2] / 3600);

      if (latRef === 'S') lat = -lat;
      if (lonRef === 'W') lon = -lon;

      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        const previewUrl = URL.createObjectURL(file);
        return {
          id: `PHOTO_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          filename: file.name,
          fileSize: file.size,
          lat: Number(lat.toFixed(6)),
          lon: Number(lon.toFixed(6)),
          altitude,
          dateTaken,
          cameraModel,
          previewUrl
        };
      }
    }

    return null;
  } catch (err) {
    console.warn("EXIF extraction error for file:", file.name, err);
    return null;
  }
}

function readRationalArray(view: DataView, offset: number, count: number, isLittleEndian: boolean): number[] {
  const result: number[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const pos = offset + (i * 8);
      if (pos + 8 > view.byteLength) break;
      const num = view.getUint32(pos, isLittleEndian);
      const den = view.getUint32(pos + 4, isLittleEndian);
      result.push(den !== 0 ? num / den : 0);
    }
  } catch (e) {
    // Ignore
  }
  return result;
}
