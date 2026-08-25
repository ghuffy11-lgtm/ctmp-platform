#!/usr/bin/env bash
# Reclaim disk on the build box (10.1.13.98) between deploys.
#
# WHY THIS EXISTS
#   The build box carries CTMP plus several unrelated projects on one 98 GB
#   volume. Three CTMP image builds regenerate tens of GB of layer cache, so the
#   disk creeps back to ~96% after every deploy. On 2026-08-24 it reached 99%
#   with 1.6 GB free — the exact condition that has previously produced a
#   SILENTLY STALE IMAGE here: the build succeeds against partial source, the
#   container restarts, and it runs old code with no error anywhere.
#   Cheap to prevent, nearly invisible when it happens.
#
# WHAT IT DOES  (only these three, in order)
#   1. docker builder prune -f      — unused build cache
#   2. docker image prune -f        — dangling (untagged) layers only
#   3. removes superseded ctmp-* image TAGS, and only ones proven redundant
#
# WHAT IT WILL NEVER DO
#   - docker image prune -a   — would take other projects' images
#   - docker volume prune     — would destroy data
#   - touch any image that is not named ctmp-api / ctmp-web-admin / ctmp-web-vendor
#   - touch :latest, or any image a running container is using
#   - remove a prod-*/rollback-* tag that does NOT also exist on its production
#     host. That check is the whole point: the build box copy is redundant
#     ONLY because production holds its own. If the peer copy is missing, the
#     tag is kept and the script says so loudly.
#
# USAGE
#   scripts/prune_build_box.sh              # dry run (default)
#   scripts/prune_build_box.sh --confirm    # actually reclaim
#
# ENV
#   KEEP_RECENT   how many recent prod-* tags to keep locally per repo (default 1)
#   SKIP_PEER_CHECK=1   remove superseded tags WITHOUT verifying the production
#                       copy. Only for a host with no production peer. Off by
#                       default, and you should need a reason.

set -euo pipefail

CONFIRM="${1:-}"
KEEP_RECENT="${KEEP_RECENT:-1}"

# Which production host holds the authoritative copy of each image.
peer_for() {
  case "$1" in
    ctmp-api|ctmp-web-admin) echo 'cts-prod' ;;
    ctmp-web-vendor)         echo 'cts-vendor' ;;
    *)                       echo '' ;;
  esac
}

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }

disk() { df -h / | awk 'NR==2 {print $4" free ("$5" used)"}'; }

CONTAINERS_BEFORE=$(docker ps -q | wc -l)

bold "Build box prune"
printf '  before:     %s\n' "$(disk)"
printf '  containers: %s running (none will be stopped)\n' "$CONTAINERS_BEFORE"
[[ "$CONFIRM" == "--confirm" ]] || printf '  mode:       DRY RUN\n'

# ── 1 + 2. Cache and dangling layers ────────────────────────────────────────
#
# These two are daemon-wide, not CTMP-scoped — worth being straight about:
#   builder prune  removes unused BUILD CACHE. No image, container or volume is
#                  touched. The only effect on another project is that its next
#                  build repopulates its own cache, so it runs slower once.
#   image prune    removes DANGLING images only — untagged, and not referenced
#                  by any container. A running or tagged image of any project is
#                  never a candidate. (Sanctioned in AI_DECISION_LOG.md §1, which
#                  permits exactly these two and forbids `image prune -a` and
#                  `volume prune`.)
bold "1. Build cache + dangling layers (daemon-wide, no images or volumes)"
if [[ "$CONFIRM" == "--confirm" ]]; then
  printf '  builder cache: %s\n' "$(docker builder prune -f 2>/dev/null | tail -1)"
  printf '  dangling:      %s\n' "$(docker image prune -f 2>/dev/null | tail -1)"
else
  CACHE=$(docker system df --format '{{.Type}}\t{{.Reclaimable}}' 2>/dev/null | awk -F'\t' '$1=="Build Cache"{print $2}')
  printf '  build cache reclaimable: %s\n' "${CACHE:-unknown}"
  printf '  (dry run — nothing pruned)\n'
fi

# ── 3. Superseded ctmp tags ─────────────────────────────────────────────────
bold "2. Superseded ctmp image tags"

# Image IDs currently backing a running container — never touch these.
IN_USE=$(docker ps -q | xargs -r docker inspect --format '{{.Image}}' 2>/dev/null | cut -c8-19 | sort -u)

REMOVE=()
for REPO in ctmp-api ctmp-web-admin ctmp-web-vendor; do
  PEER=$(peer_for "$REPO")

  # Candidate tags: everything except :latest, newest first.
  mapfile -t TAGS < <(
    docker images --format '{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}' "$REPO" 2>/dev/null \
      | grep -v '^latest' | sort -k3 -r | cut -f1,2
  )
  [[ ${#TAGS[@]} -eq 0 ]] && continue

  printf '\n  %s (%d tagged, keeping newest %s + :latest)\n' "$REPO" "${#TAGS[@]}" "$KEEP_RECENT"

  IDX=0
  for LINE in "${TAGS[@]}"; do
    TAG="${LINE%%$'\t'*}"
    ID="${LINE##*$'\t'}"
    IDX=$((IDX + 1))

    if [[ $IDX -le $KEEP_RECENT ]]; then
      printf '    keep  %-22s (recent)\n' "$TAG"; continue
    fi
    if grep -q "^${ID}$" <<<"$IN_USE"; then
      printf '    keep  %-22s (running container)\n' "$TAG"; continue
    fi

    # The safety check: is production holding its own copy?
    if [[ "${SKIP_PEER_CHECK:-}" != "1" ]]; then
      if [[ -z "$PEER" ]]; then
        warn "keep  $TAG (no known production peer for $REPO)"; continue
      fi
      if ! sudo ssh -o BatchMode=yes -o ConnectTimeout=10 "$PEER" \
           "docker image inspect ${REPO}:${TAG} >/dev/null 2>&1"; then
        warn "keep  $TAG — NOT present on $PEER, this is the only copy"
        continue
      fi
    fi

    printf '    prune %-22s (also on %s)\n' "$TAG" "${PEER:-n/a}"
    REMOVE+=("${REPO}:${TAG}")
  done
done

bold "Summary"
printf '  tags to remove: %d\n' "${#REMOVE[@]}"

if [[ "$CONFIRM" != "--confirm" ]]; then
  printf '\n\033[1mDRY RUN — nothing was changed.\033[0m\n'
  printf 'Re-run with --confirm to reclaim.\n\n'
  exit 0
fi

# ── Final allowlist gate ────────────────────────────────────────────────────
# The loop above can only ever build names from three hardcoded repositories,
# so this cannot fire in normal operation. It exists so that a future edit that
# widens the loop — a glob, a new repo, a variable — cannot quietly turn this
# into something that deletes another project's images. Refuse everything, not
# just the offending entry: a list that contains one surprise is not a list to
# act on selectively.
for NAME in "${REMOVE[@]}"; do
  if [[ ! "$NAME" =~ ^ctmp-(api|web-admin|web-vendor):[A-Za-z0-9._-]+$ ]]; then
    printf '\n\033[31mABORT: refusing to remove "%s" — not an allowlisted CTMP image.\033[0m\n' "$NAME"
    printf 'Nothing was removed. This is a bug in the script, not a disk problem.\n\n'
    exit 1
  fi
  if [[ "$NAME" == *:latest ]]; then
    printf '\n\033[31mABORT: refusing to remove a :latest tag (%s).\033[0m\n\n' "$NAME"
    exit 1
  fi
done

if [[ ${#REMOVE[@]} -gt 0 ]]; then
  # Untag only. Layers shared with a surviving image are kept by Docker itself;
  # `docker rmi <tag>` removes the tag and frees storage only when nothing else
  # references it. No --force: if something unexpectedly depends on an image,
  # the removal fails and is skipped rather than being torn out from under it.
  for NAME in "${REMOVE[@]}"; do
    if docker rmi "$NAME" >/dev/null 2>&1; then
      printf '  removed %s\n' "$NAME"
    else
      warn "could not remove $NAME (still referenced) — left in place"
    fi
  done
fi

# Prove the blast radius: every container on the box, CTMP or not, still up.
printf '\n  containers running after prune: %s (was %s before)\n' \
  "$(docker ps -q | wc -l)" "$CONTAINERS_BEFORE"

printf '  after:  %s\n\n' "$(disk)"
