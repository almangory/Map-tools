import re

with open('components/DataFormatter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

print("Found getProcessedPoints:", "const getProcessedPoints" in content)
