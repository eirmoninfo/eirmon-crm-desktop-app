#!/usr/bin/env bash
# Validate GH_TOKEN before electron-builder tries to publish a GitHub Release.
set -euo pipefail

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  cat <<'EOF'

❌ GitHub token missing.

npm run release:win uploads the installer to GitHub Releases and needs a valid token.

1. Open https://github.com/settings/tokens
2. Generate a classic token with the "repo" scope
3. In this terminal (do not put it in .env files):

   unset GH_TOKEN GITHUB_TOKEN
   export GH_TOKEN=ghp_your_new_token

4. Run the release command again.

EOF
  exit 1
fi

HTTP="$(
  curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/eirmoninfo/eirmon-crm-desktop-app"
)"

if [[ "$HTTP" == "200" || "$HTTP" == "301" ]]; then
  echo "✅ GitHub token can access eirmoninfo/eirmon-crm-desktop-app"
  exit 0
fi

if [[ "$HTTP" == "401" || "$HTTP" == "403" ]]; then
  cat <<EOF

❌ GitHub token is invalid or expired (HTTP ${HTTP}).
This is the "Bad credentials" error from electron-builder.

Fix:
1. Revoke the old token at https://github.com/settings/tokens
2. Create a new classic token with "repo" scope
3. Open a new terminal (so the old token is not still exported) and run:

   unset GH_TOKEN GITHUB_TOKEN
   export GH_TOKEN=ghp_your_new_token
   npm run release:win

Do not put GH_TOKEN in .env.development or .env.production.

EOF
  exit 1
fi

if [[ "$HTTP" == "404" ]]; then
  cat <<'EOF'

❌ Token is valid but cannot see eirmoninfo/eirmon-crm-desktop-app (HTTP 404).
Use a token from an account that has access to that repo, with the "repo" scope.

EOF
  exit 1
fi

echo "❌ Unexpected GitHub response HTTP ${HTTP} while checking the token."
exit 1
