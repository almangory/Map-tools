import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_func = r"""  const executeWithStreetFetching = async \(
    points: GeoPoint\[\],
    headers: string\[\] \| undefined
  \): Promise<GeoPoint\[\]> => \{
    let newGlobalPoints = points\.map\(p => \(\{ \.\.\.p, attributes: \{ \.\.\.\(p\.attributes \|\| \{\}\) \} \}\)\);
    const hasStreetHeader = headers && headers\.some\(h => \['street', 'الشارع', 'اسم الشارع', 'streetname', 'district', 'الحي'\]\.includes\(String\(h \|\| ''\)\.toLowerCase\(\)\)\);
    if \(hasStreetHeader\) \{
      setLoading\(true\);
      try \{
        const total = newGlobalPoints\.length;
        const batchSize = geocodingMode === 'accurate' \? 3 : 8;
        for \(let i = 0; i < total; i \+= batchSize\) \{
            const processed = Math\.min\(i \+ batchSize, total\);
            const pct = Math\.round\(\(processed / total\) \* 100\);
            setProgressPercent\(pct\);
            setStatusMessage\(lang === 'ar'
                \? `جاري جلب أسماء الشوارع \(\$\{geocodingMode === 'accurate' \? 'نمط دقيق جداً 🎯' : 'نمط سريع ⚡'\}\): \(\$\{processed\} من \$\{total\}\)`
                : `Fetching Street Names \(\$\{geocodingMode === 'accurate' \? 'Accurate Mode 🎯' : 'Fast Mode ⚡'\}\): \(\$\{processed\} of \$\{total\}\)`
            \);
            const chunk = newGlobalPoints\.slice\(i, i \+ batchSize\);
            await Promise\.all\(chunk\.map\(async \(pt\) => \{
                let street = pt\.street;
                if \(!street \|\| street === "غير متوفر" \|\| street === "Unknown" \|\| street === "غير معروف"\) \{
                    try \{
                        const timeoutPromise = new Promise<\{street: string, district: string\}>\(\(resolve\) => \{
                          setTimeout\(\(\) => resolve\(\{ street: "غير متوفر", district: "غير متوفر" \}\), 4500\);
                        \}\);
                        const geoData = await Promise\.race\(\[
                          getReverseGeocode\(pt\.y, pt\.x, geocodingMode\),
                          timeoutPromise
                        \]\);
                        street = geoData\.street;
                        pt\.street = street;
                        pt\.district = geoData\.district;
                    \} catch \(err\) \{
                        street = "";
                    \}
                \}
                pt\.attributes = \{ \.\.\.\(pt\.attributes \|\| \{\}\) \};
                const matchStreet = headers\.find\(h => String\(h \|\| ''\)\.toLowerCase\(\) === 'street'\);
                const matchArabic = headers\.find\(h => h === 'الشارع' \|\| h === 'اسم الشارع'\);
                const matchStreetName = headers\.find\(h => String\(h \|\| ''\)\.toLowerCase\(\) === 'streetname'\);
                if \(matchStreet\) pt\.attributes\[matchStreet\] = street \|\| \(lang === 'ar' \? 'غير معروف' : 'Unknown'\);
                if \(matchArabic\) pt\.attributes\[matchArabic\] = street \|\| \(lang === 'ar' \? 'غير معروف' : 'Unknown'\);
                if \(matchStreetName\) pt\.attributes\[matchStreetName\] = street \|\| \(lang === 'ar' \? 'غير معروف' : 'Unknown'\);
                const matchDistrict = headers\.find\(h => String\(h \|\| ''\)\.toLowerCase\(\) === 'district'\);
                const matchArabicDistrict = headers\.find\(h => h === 'الحي'\);
                if \(matchDistrict\) pt\.attributes\[matchDistrict\] = pt\.district \|\| \(lang === 'ar' \? 'غير معروف' : 'Unknown'\);
                if \(matchArabicDistrict\) pt\.attributes\[matchArabicDistrict\] = pt\.district \|\| \(lang === 'ar' \? 'غير معروف' : 'Unknown'\);
            \}\)\);
            // Small delay between batches to respect network rate limits
            if \(i \+ batchSize < total\) \{
              await new Promise\(res => setTimeout\(res, 80\)\);
            \}
        \}
        setGlobalPoints\(newGlobalPoints\);
      \} catch \(err\) \{
        console\.error\("Error in executeWithStreetFetching:", err\);
      \} finally \{
        setLoading\(false\);
        setProgressPercent\(null\);
        setStatusMessage\(''\);
      \}
    \}
    return newGlobalPoints;
  \};"""

new_func = """  const executeWithStreetFetching = async (
    points: GeoPoint[],
    headers: string[] | undefined
  ): Promise<GeoPoint[]> => {
    const hasStreetHeader = headers && headers.some(h => ['street', 'الشارع', 'اسم الشارع', 'streetname', 'district', 'الحي'].includes(String(h || '').toLowerCase()));
    
    if (!hasStreetHeader) {
      return points;
    }

    setLoading(true);
    let newGlobalPoints = points.map(p => ({ ...p, attributes: { ...(p.attributes || {}) } })); // Clone completely
    
    try {
      const total = newGlobalPoints.length;
      const batchSize = geocodingMode === 'accurate' ? 3 : 8;

      for (let i = 0; i < total; i += batchSize) {
          const processed = Math.min(i + batchSize, total);
          const pct = Math.round((processed / total) * 100);
          setProgressPercent(pct);
          setStatusMessage(lang === 'ar'
              ? `جاري جلب أسماء الشوارع (${geocodingMode === 'accurate' ? 'نمط دقيق جداً 🎯' : 'نمط سريع ⚡'}): (${processed} من ${total})`
              : `Fetching Street Names (${geocodingMode === 'accurate' ? 'Accurate Mode 🎯' : 'Fast Mode ⚡'}): (${processed} of ${total})`
          );
          
          const chunk = newGlobalPoints.slice(i, i + batchSize);
          const updatedChunk = await Promise.all(chunk.map(async (pt) => {
              let street = pt.street;
              let district = pt.district;
              
              if (!street || street === "غير متوفر" || street === "Unknown" || street === "غير معروف") {
                  try {
                      const timeoutPromise = new Promise<{street: string, district: string}>((resolve) => {
                        setTimeout(() => resolve({ street: "غير متوفر", district: "غير متوفر" }), 4500);
                      });
                      const geoData = await Promise.race([
                        getReverseGeocode(pt.y, pt.x, geocodingMode),
                        timeoutPromise
                      ]);
                      street = geoData.street;
                      district = geoData.district;
                  } catch (err) {
                      street = "";
                  }
              }

              const newAttributes = { ...(pt.attributes || {}) };
              
              const matchStreet = headers.find(h => String(h || '').toLowerCase() === 'street');
              const matchArabic = headers.find(h => h === 'الشارع' || h === 'اسم الشارع');
              const matchStreetName = headers.find(h => String(h || '').toLowerCase() === 'streetname');
              
              if (matchStreet) newAttributes[matchStreet] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              if (matchArabic) newAttributes[matchArabic] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              if (matchStreetName) newAttributes[matchStreetName] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              
              const matchDistrict = headers.find(h => String(h || '').toLowerCase() === 'district');
              const matchArabicDistrict = headers.find(h => h === 'الحي');
              
              if (matchDistrict) newAttributes[matchDistrict] = district || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              if (matchArabicDistrict) newAttributes[matchArabicDistrict] = district || (lang === 'ar' ? 'غير معروف' : 'Unknown');

              return {
                  ...pt,
                  street,
                  district,
                  attributes: newAttributes
              };
          }));

          for (let j = 0; j < updatedChunk.length; j++) {
              newGlobalPoints[i + j] = updatedChunk[j];
          }

          if (i + batchSize < total) {
            await new Promise(res => setTimeout(res, 80));
          }
      }
      setGlobalPoints(newGlobalPoints);
    } catch (err) {
      console.error("Error in executeWithStreetFetching:", err);
    } finally {
      setLoading(false);
      setProgressPercent(null);
      setStatusMessage('');
    }
    
    return newGlobalPoints;
  };"""

content = re.sub(old_func, new_func, content, flags=re.MULTILINE)
with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
