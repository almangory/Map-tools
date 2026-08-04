import re

with open('components/DataFormatter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_func = r"""  const executeAction = async \(action: \(overridePoints\?: GeoPoint\[\]\) => void\) => \{
    try \{
        if \(autoFetchStreets && fetchStreets\) \{
          // In iframe, window.confirm can be blocked. 
          // We will just proceed since the user explicitly checked the box.
          const updatedPoints = await fetchStreets\(points, \['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'\]\);
          action\(updatedPoints\);
        \} else \{
          action\(\);
        \}
    \} catch \(err\) \{
        console\.error\("Export Action Error:", err\);
        alert\("حدث خطأ أثناء التصدير: " \+ \(err as Error\)\.message\);
    \}
  \};"""

new_func = """  const executeAction = async (action: (overridePoints?: GeoPoint[]) => void | Promise<void>) => {
    try {
        if (autoFetchStreets && fetchStreets) {
          // In iframe, window.confirm can be blocked. 
          // We will just proceed since the user explicitly checked the box.
          const updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي']);
          await action(updatedPoints);
        } else {
          await action();
        }
    } catch (err) {
        console.error("Export Action Error:", err);
        alert("حدث خطأ أثناء التصدير: " + (err as Error).message);
    }
  };"""

content = re.sub(old_func, new_func, content)

with open('components/DataFormatter.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done fixing await!")
