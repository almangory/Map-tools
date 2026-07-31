const fs = require('fs');
const file = 'components/FileComparator.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `import { cn } from 'clsx';`;
const replace = `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); };`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched cn in FileComparator.tsx');
