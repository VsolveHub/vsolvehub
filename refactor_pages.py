import os
import glob
import re

directory = "/Users/rapakasaketh/Downloads/vsolve/frontend/apps/admin/app/(operations)"
for filepath in glob.glob(directory + '/**/page.tsx', recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()

    # Remove force-dynamic
    content = re.sub(r'export const dynamic\s*=\s*"force-dynamic";\n?', '', content)

    # Remove OperationsShell import
    content = re.sub(r'import\s*{\s*OperationsShell\s*}\s*from\s*"[^"]+";\n?', '', content)

    # Remove <OperationsShell> wrapper
    content = re.sub(r'<OperationsShell>\s*(.*?)\s*</OperationsShell>', r'\1', content, flags=re.DOTALL)

    # Convert "use client" pages to server components with island
    # (Leaving this to manual for the 8 pages or doing it generally if possible)

    with open(filepath, 'w') as f:
        f.write(content)

print("Done stripping OperationsShell")
