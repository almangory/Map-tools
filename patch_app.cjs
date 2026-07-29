const fs = require('fs');

let appCode = fs.readFileSync('App.tsx', 'utf8');

const oldVerifyFuncRegex = /const verifyPermitAndSegmentId = \(\) => \{[\s\S]*?\n  \};/;

const newVerifyFunc = `const verifyPermitAndSegmentId = () => {
    setLoading(true);
    setStatusMessage(lang === 'ar' ? 'جاري فحص (Permit No / segment id)...' : 'Verifying Permit No & segment id...');

    setTimeout(() => {
      let matchedCount = 0;

      const isValidValue = (val: any): boolean => {
        if (val === undefined || val === null) return false;
        const str = String(val).trim();
        if (!str) return false;
        const lower = str.toLowerCase();
        if (
          lower === '0' ||
          lower === '0.0' ||
          lower === 'null' ||
          lower === 'undefined' ||
          lower === 'none' ||
          lower === '-' ||
          lower === '--' ||
          lower === 'n/a' ||
          lower === 'na' ||
          lower === 'no' ||
          lower === 'false' ||
          lower === 'unknown' ||
          lower === 'غير محدد' ||
          lower === 'لا يوجد'
        ) {
          return false;
        }
        return true;
      };

      const normalizeKey = (key: string): string => key.toLowerCase().replace(/[\\s_#-]/g, '');

      const isPermitOrSegmentKey = (key: string): boolean => {
        const norm = normalizeKey(key);
        // Explicit Permit No keys
        if (
          norm === 'permitno' ||
          norm === 'permitnumber' ||
          norm === 'permitid' ||
          norm === 'رقمالرخصة' ||
          norm === 'رقمالتصريح' ||
          norm === 'رخصة' ||
          norm === 'تصريح'
        ) {
          return true;
        }
        // Explicit Segment ID keys (MUST contain id/no/number/code - NOT generic 'segment' alone)
        if (
          norm === 'segmentid' ||
          norm === 'segmentno' ||
          norm === 'segmentnumber' ||
          norm === 'segid' ||
          norm === 'segno' ||
          norm === 'رقمالشريحة' ||
          norm === 'كودالشريحة' ||
          norm === 'شريحةid'
        ) {
          return true;
        }
        return false;
      };

      const textRegex = /(?:permit\\s*no|permit_no|permit\\s*number|permit\\s*id|رقم\\s*الرخصة|رقم\\s*التصريح|segment\\s*id|segment_id|segment\\s*no|segment\\s*number|seg\\s*id|رقم\\s*الشريحة|كود\\s*الشريحة)\\s*[:=]\\s*([^\\r\\n,;|\/]+)/i;

      const processPoints = (pts: GeoPoint[]) => {
        return pts.map(pt => {
          let hasData = false;

          // 1. Check attributes dictionary
          if (pt.attributes) {
            for (const [key, val] of Object.entries(pt.attributes)) {
              if (isPermitOrSegmentKey(key) && isValidValue(val)) {
                hasData = true;
                break;
              }
            }
          }

          // 2. Check description ONLY if explicit key:value pair exists
          if (!hasData && pt.description) {
            const match = pt.description.match(textRegex);
            if (match && match[1] && isValidValue(match[1])) {
              hasData = true;
            }
          }

          if (hasData) {
            matchedCount++;
            return {
              ...pt,
              color: '#9000FF' // Vivid Electric Purple
            };
          }

          return pt;
        });
      };

      if (globalPoints.length > 0) {
        const nextGlobal = processPoints(globalPoints);
        setGlobalPoints(nextGlobal);
      }
      if (plannedStreets.length > 0) {
        const nextPlanned = processPoints(plannedStreets);
        setPlannedStreets(nextPlanned);
      }

      setDataId(\`permit-check-\${Date.now()}\`);
      setLoading(false);

      if (matchedCount > 0) {
        setStatusMessage(
          lang === 'ar'
            ? \`تم تلوين \${matchedCount} عنصراً باللون البنفسجي لوجود بيانات (Permit No / segment id).\`
            : \`Colored \${matchedCount} elements in vivid purple with Permit No / segment id data.\`
        );
      } else {
        setStatusMessage(
          lang === 'ar'
            ? 'لم يتم العثور على أي عناصر تحتوي على (Permit No / segment id).'
            : 'No elements found containing Permit No or segment id.'
        );
      }
      setTimeout(() => setStatusMessage(''), 5000);
    }, 500);
  };`;

if (oldVerifyFuncRegex.test(appCode)) {
  appCode = appCode.replace(oldVerifyFuncRegex, newVerifyFunc);
  fs.writeFileSync('App.tsx', appCode);
  console.log("Updated verifyPermitAndSegmentId in App.tsx successfully.");
} else {
  console.log("Could not find regex match in App.tsx.");
}
