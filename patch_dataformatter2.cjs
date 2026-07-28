const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    `const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({
    pipes: [],`,
    `const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({
    violations: [],
    pipes: [],`
);

fs.writeFileSync('components/DataFormatter.tsx', code);
