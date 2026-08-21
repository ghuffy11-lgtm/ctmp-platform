#!/usr/bin/env bash
# seed_role_guides.sh — generate the per-role onboarding guide PDFs from
# docs/user-guides/*.md and place them in the api container at
# /data/role-guides/<ROLE_CODE>.pdf, where NotificationsService.sendRoleWelcome
# picks them up to attach to the user-welcome email.
#
# Requires (on the machine that RUNS this — the build box 10.1.13.98):
#   - google-chrome (headless PDF), node + npm/npx (markdown→HTML via `marked`).
#
# Usage:
#   bash scripts/seed_role_guides.sh                 # place into the LOCAL ctmp-api container
#   bash scripts/seed_role_guides.sh cts-prod        # place into ctmp-api on the given SSH host
# Re-run after editing any guide in docs/user-guides/.
set -euo pipefail

TARGET="${1:-local}"                 # "local" or an SSH alias (e.g. cts-prod)
API="${API_CONTAINER:-ctmp-api}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GD="$REPO/docs/user-guides"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT

# role code  ->  guide markdown basename (no extension)
MAP=(
  "PROCUREMENT_ADMIN:MANAGER_TENDER_LIFECYCLE_GUIDE"
  "TECHNICAL_EVALUATOR:TECHNICAL_EVALUATOR_GUIDE"
  "APPROVER:APPROVER_GUIDE"
  "FINANCE_REVIEWER:APPROVER_GUIDE"
  "LEGAL_REVIEWER:APPROVER_GUIDE"
  "COMMERCIAL_COMMITTEE_MEMBER:COMMITTEE_MEMBER_GUIDE"
  "SYSTEM_ADMIN:SYSTEM_ADMIN_GUIDE"
)

echo "==> installing marked"
( cd "$W" && npm i --silent marked@12 >/dev/null 2>&1 )

cat > "$W/conv.js" <<'JS'
const { marked } = require('marked');
const fs = require('fs');
let md = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [];
md = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, c) => { blocks.push(c); return `@@MERMAID${blocks.length-1}@@`; });
let body = marked.parse(md);
body = body.replace(/<p>@@MERMAID(\d+)@@<\/p>|@@MERMAID(\d+)@@/g, (m,a,b) => `<div class="mermaid">${blocks[a??b]}</div>`);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2933;max-width:840px;margin:0 auto;padding:20px;line-height:1.5}
 h1{color:#0b3d5c;border-bottom:3px solid #1d6fa5;padding-bottom:8px} h2{color:#0b3d5c;margin-top:26px;border-bottom:1px solid #e3e7eb;padding-bottom:4px} h3{color:#1d6fa5;margin-top:20px}
 table{border-collapse:collapse;width:100%;margin:12px 0} th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;font-size:12.5px} th{background:#f0f2f5}
 pre{background:#f6f8fa;border:1px solid #e3e7eb;border-radius:6px;padding:12px;overflow:auto;font-size:11.5px;line-height:1.35;page-break-inside:avoid}
 code{font-family:'Consolas','Courier New',monospace} blockquote{border-left:4px solid #1d6fa5;background:#eef6fb;margin:12px 0;padding:8px 14px;color:#374151}
 .mermaid{background:#fff;margin:16px 0;text-align:center;page-break-inside:avoid} h2,h3{page-break-after:avoid} @page{margin:16mm}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:true,theme:'neutral'});</script></head><body>${body}</body></html>`;
fs.writeFileSync(process.argv[3], html);
JS

place() { # <code> <pdf-path>
  local code="$1" pdf="$2"
  if [ "$TARGET" = "local" ]; then
    docker exec "$API" mkdir -p /data/role-guides
    docker cp "$pdf" "$API:/data/role-guides/$code.pdf"
  else
    scp -q "$pdf" "$TARGET:/tmp/$code.pdf"
    ssh "$TARGET" "docker exec $API mkdir -p /data/role-guides && docker cp /tmp/$code.pdf $API:/data/role-guides/$code.pdf && rm -f /tmp/$code.pdf"
  fi
  echo "    placed $code.pdf"
}

# Build each unique guide once, then place under every role code that uses it.
declare -A BUILT
for entry in "${MAP[@]}"; do
  code="${entry%%:*}"; base="${entry##*:}"
  if [ -z "${BUILT[$base]:-}" ]; then
    echo "==> rendering $base.pdf"
    node "$W/conv.js" "$GD/$base.md" "$W/$base.html"
    google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
      --virtual-time-budget=9000 --run-all-compositor-stages-before-draw \
      --print-to-pdf="$W/$base.pdf" "$W/$base.html" 2>/dev/null
    BUILT[$base]="$W/$base.pdf"
  fi
  place "$code" "${BUILT[$base]}"
done

echo "==> done. role guides in $API:/data/role-guides on target '$TARGET'"
