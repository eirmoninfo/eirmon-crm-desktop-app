#!/usr/bin/env bash
# Build Windows installer and upload to GitHub Releases (auto-update).
#
# Usage:
#   export GH_TOKEN=ghp_xxxxxxxx   # once per terminal (GitHub token with "repo" scope)
#   npm run release:win:upload -- 0.1.7
#   npm run release:win:upload -- 0.1.7 --push   # also commit, tag, and push git

set -euo pipefail

VERSION="${1:-}"
PUSH_GIT="${2:-}"

if [[ -z "$VERSION" ]]; then
  echo ""
  echo "❌ Version required."
  echo ""
  echo "Usage:"
  echo "  export GH_TOKEN=your_github_token"
  echo "  npm run release:win:upload -- 0.1.7"
  echo "  npm run release:win:upload -- 0.1.7 --push"
  echo ""
  exit 1
fi

VERSION="${VERSION#v}"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo ""
  echo "❌ GH_TOKEN is not set."
  echo ""
  echo "1. GitHub → Settings → Developer settings → Personal access tokens"
  echo "2. Create token with \"repo\" permission"
  echo "3. Run:  export GH_TOKEN=ghp_your_token_here"
  echo "4. Then run this command again."
  echo ""
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "📦 Version → $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version

echo ""
echo "🔨 Building Windows + uploading to GitHub Releases..."
npm run build
npx electron-builder --win --publish always

echo ""
echo "✅ Done! Windows build uploaded for v$VERSION"
echo "   Repo: https://github.com/eirmoninfo/eirmon-crm-desktop-app/releases"
echo ""

if [[ "$PUSH_GIT" == "--push" ]]; then
  echo "📤 Committing and pushing git tag v$VERSION..."
  git add package.json package-lock.json
  git commit -m "chore: release v$VERSION"
  git tag -a "v$VERSION" -m "Release v$VERSION" 2>/dev/null || git tag "v$VERSION"
  git push
  git push origin "v$VERSION"
  echo "✅ Git tag pushed."
else
  echo "Tip: save version in git with:"
  echo "  npm run release:win:upload -- $VERSION --push"
fi

echo ""
