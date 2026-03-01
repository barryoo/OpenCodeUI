#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/local.sh <command> [options]

Commands:
  dev           Update + install + start Vite dev server
  build         Update + install + build web assets (dist/)
  preview       Update + install + build + run Vite preview
  tauri-dev     Update + install + start Tauri dev app
  tauri-build   Update + install + build Tauri bundles

Options:
  --skip-pull       Do not update git remote
  --rebase          Use git pull --rebase (default is --ff-only)
  --allow-dirty     Allow pull even when working tree is dirty
  --skip-install    Do not run npm install/ci
  --install         Use npm install (default is npm ci when package-lock.json exists)
  -h, --help        Show this help
EOF
}

say() { printf '%s\n' "$*"; }
die() { say "Error: $*"; exit 1; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

check_node_version() {
  local nvmrc
  if [[ -f .nvmrc ]]; then
    nvmrc="$(tr -d ' \t\n\r' < .nvmrc)"
  else
    return 0
  fi

  if ! has_cmd node; then
    say "Warning: node not found. Expected Node ${nvmrc} (see .nvmrc)."
    return 0
  fi

  local current
  current="$(node -p 'process.versions.node' 2>/dev/null || true)"
  if [[ -z "$current" ]]; then
    return 0
  fi

  # .nvmrc in this repo is like: 20.19 (no patch). Accept any patch under that.
  if [[ "$current" != "${nvmrc}"* ]]; then
    say "Warning: Node version mismatch. Expected ${nvmrc}.x (from .nvmrc), got ${current}."
  fi
}

git_update() {
  local allow_dirty="$1"
  local pull_mode="$2" # ff-only | rebase

  if ! has_cmd git; then
    die "git not found"
  fi

  if [[ ! -d .git ]]; then
    die "not a git repository: $REPO_ROOT"
  fi

  local dirty
  dirty="$(git status --porcelain)"
  if [[ -n "$dirty" && "$allow_dirty" != "1" ]]; then
    die "working tree is dirty; commit/stash changes or rerun with --allow-dirty"
  fi

  say "==> Updating code (git fetch)"
  git fetch --prune

  say "==> Pulling latest code"
  if [[ "$pull_mode" == "rebase" ]]; then
    git pull --rebase
  else
    git pull --ff-only
  fi
}

npm_install() {
  local mode="$1" # ci | install

  if ! has_cmd npm; then
    die "npm not found"
  fi

  if [[ "$mode" == "ci" && -f package-lock.json ]]; then
    say "==> Installing dependencies (npm ci)"
    npm ci
  else
    say "==> Installing dependencies (npm install)"
    npm install
  fi
}

main() {
  local cmd="${1:-}"

  case "$cmd" in
    -h|--help|help|"")
      usage
      exit 0
      ;;
  esac

  shift || true

  local skip_pull=0
  local pull_mode="ff-only"
  local allow_dirty=0
  local skip_install=0
  local install_mode="ci"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-pull) skip_pull=1; shift ;;
      --rebase) pull_mode="rebase"; shift ;;
      --allow-dirty) allow_dirty=1; shift ;;
      --skip-install) skip_install=1; shift ;;
      --install) install_mode="install"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown option: $1" ;;
    esac
  done

  case "$cmd" in
    dev|build|preview|tauri-dev|tauri-build) ;;
    *) die "unknown command: $cmd" ;;
  esac

  check_node_version

  if [[ "$skip_pull" != "1" ]]; then
    git_update "$allow_dirty" "$pull_mode"
  else
    say "==> Skipping git update"
  fi

  if [[ "$skip_install" != "1" ]]; then
    npm_install "$install_mode"
  else
    say "==> Skipping dependency install"
  fi

  case "$cmd" in
    dev)
      say "==> Starting Vite dev server"
      npm run dev
      ;;
    build)
      say "==> Building web assets"
      npm run build
      ;;
    preview)
      say "==> Building web assets"
      npm run build
      say "==> Starting Vite preview"
      npm run preview
      ;;
    tauri-dev)
      say "==> Starting Tauri dev app"
      npm run tauri dev
      ;;
    tauri-build)
      say "==> Building Tauri bundles"
      npm run tauri build
      ;;
  esac
}

main "$@"
