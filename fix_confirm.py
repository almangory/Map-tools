import re

with open('components/DataFormatter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_func = r"""  const executeAction = async \(action: \(overridePoints\?: GeoPoint\[\]\) => void\) => \{
    if \(autoFetchStreets && fetchStreets\) \{
      const confirmMsg = lang === 'ar' 
        \? 'لقد قمت بتفعيل خيار "جلب الشوارع"\. قد تستغرق هذه العملية بعض الوقت حسب عدد النقاط وسيتم استبدال قيم الشوارع الحالية\. هل أنت متأكد من رغبتك في الاستمرار وتصدير البيانات\؟'
        : 'You have enabled "Fetch Streets"\. This process may take some time depending on the number of points and will overwrite current street values\. Are you sure you want to continue and export\?';
      if \(window\.confirm\(confirmMsg\)\) \{
        const updatedPoints = await fetchStreets\(points, \['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'\]\);
        action\(updatedPoints\);
      \}
    \} else \{
      action\(\);
    \}
  \};"""

new_func = """  const executeAction = async (action: (overridePoints?: GeoPoint[]) => void) => {
    try {
        if (autoFetchStreets && fetchStreets) {
          const confirmMsg = lang === 'ar' 
            ? 'لقد قمت بتفعيل خيار "جلب الشوارع". قد تستغرق هذه العملية بعض الوقت حسب عدد النقاط وسيتم استبدال قيم الشوارع الحالية. هل أنت متأكد من رغبتك في الاستمرار وتصدير البيانات؟'
            : 'You have enabled "Fetch Streets". This process may take some time depending on the number of points and will overwrite current street values. Are you sure you want to continue and export?';
          
          let proceed = true;
          try {
             proceed = window.confirm(confirmMsg);
          } catch(e) {
             console.warn("window.confirm not supported, proceeding automatically");
             proceed = true;
          }

          if (proceed) {
            const updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي']);
            action(updatedPoints);
          }
        } else {
          action();
        }
    } catch (err) {
        console.error("Export Action Error:", err);
        alert("حدث خطأ أثناء التصدير: " + (err as Error).message);
    }
  };"""

content = re.sub(old_func, new_func, content, flags=re.MULTILINE)
with open('components/DataFormatter.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
