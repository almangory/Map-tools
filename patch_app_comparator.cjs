const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// Add import
code = code.replace(
    "import { DataFormatter } from './components/DataFormatter';",
    "import { DataFormatter } from './components/DataFormatter';\nimport { FileComparator } from './components/FileComparator';"
);

// Add to GitCompare import if not there
if (!code.includes("GitCompare,")) {
    code = code.replace(
        "import { clsx, type ClassValue } from 'clsx';",
        "import { GitCompare } from 'lucide-react';\nimport { clsx, type ClassValue } from 'clsx';"
    );
}

// Add state type
code = code.replace(
    "useState<'converter' | 'splitter' | 'analyzer' | 'street-planner' | 'polygon-converter' | 'attribute-formatter'>('converter')",
    "useState<'converter' | 'splitter' | 'analyzer' | 'street-planner' | 'polygon-converter' | 'attribute-formatter' | 'comparator'>('converter')"
);

// Add tab
code = code.replace(
    "{ id: 'attribute-formatter', icon: <Database />, label: lang === 'ar' ? 'تنسيق البيانات' : 'Format Data' }",
    "{ id: 'attribute-formatter', icon: <Database />, label: lang === 'ar' ? 'تنسيق البيانات' : 'Format Data' },\n               { id: 'comparator', icon: <GitCompare />, label: lang === 'ar' ? 'مقارنة' : 'Compare' }"
);

// Render component
code = code.replace(
    `                {activeTab === 'attribute-formatter' && (
                  <DataFormatter points={globalPoints} headers={activeFile?.headers} lang={lang} fetchStreets={executeWithStreetFetching} />
                )}`,
    `                {activeTab === 'attribute-formatter' && (
                  <DataFormatter points={globalPoints} headers={activeFile?.headers} lang={lang} fetchStreets={executeWithStreetFetching} />
                )}
                {activeTab === 'comparator' && (
                  <FileComparator lang={lang} setGlobalPoints={setGlobalPoints} setDataId={setDataId} />
                )}`
);

fs.writeFileSync('App.tsx', code);
