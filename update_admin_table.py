import re

path = 'frontend/apps/admin/features/listings/view/listings-table.tsx'

with open(path, 'r') as f:
    content = f.read()

# Add formatMoney import
if 'formatMoney' not in content:
    content = content.replace('} from "lucide-react";', '} from "lucide-react";\nimport { formatMoney } from "@vsolve/ui";')

# Replace pay_range logic
pay_logic = """
                        {listing.salary_min_paise > 0 ? (
                          <span className="font-semibold text-slate-800">
                            {formatMoney(listing.salary_min_paise)}
                            {listing.salary_max_paise > listing.salary_min_paise ? ` - ${formatMoney(listing.salary_max_paise)}` : ""}
                            {listing.salary_period ? ` / ${listing.salary_period.toLowerCase()}` : ""}
                          </span>
                        ) : listing.salary_display || fields.salary_range || fields.pay_range ? (
                          <span className="font-semibold text-slate-800">
                            {String(listing.salary_display || fields.salary_range || fields.pay_range)}
                          </span>
                        ) : null}
"""

content = re.sub(
    r'\{fields\.pay_range && \(\s*<span className="font-semibold text-slate-800">\s*\{String\(fields\.pay_range\)\}\s*</span>\s*\)\}',
    pay_logic.strip(),
    content,
    flags=re.MULTILINE
)

# Also handle fields.work_mode vs shift
content = content.replace('fields.work_mode', '(fields.shift || fields.work_mode)')

with open(path, 'w') as f:
    f.write(content)
