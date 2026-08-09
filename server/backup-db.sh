#!/usr/bin/env bash
# Take a usable copy of the dev database before a destructive change.
#
# The point of this script is the -wal file. libsql keeps recent writes there, so copying
# linkedin.db on its own can yield a file with no tables in it at all — which is exactly how a
# "backup" taken before a schema change turned out to be an empty 4KB shell, with the real data
# deleted alongside the WAL. Copy both, or checkpoint first.
set -euo pipefail
cd "$(dirname "$0")"

db=${1:-linkedin.db}
[ -f "$db" ] || { echo "no such database: $db" >&2; exit 1; }

stamp=$(date +%Y%m%d-%H%M%S)
dest=".backup/${db}.${stamp}"
mkdir -p .backup

# `.backup` in sqlite3 produces a single consistent file with the WAL already folded in, which is
# what we want; fall back to copying both files if that fails (e.g. sqlite3 not installed).
if command -v sqlite3 >/dev/null 2>&1 && sqlite3 "$db" ".backup '$dest'" 2>/dev/null; then
    :
else
    cp "$db" "$dest"
    [ -f "$db-wal" ] && cp "$db-wal" "$dest-wal"
fi

tables=$(sqlite3 "$dest" "select count(*) from sqlite_master where type='table';" 2>/dev/null || echo 0)
if [ "$tables" -eq 0 ]; then
    echo "REFUSING: $dest has no tables — the copy did not capture the data." >&2
    rm -f "$dest" "$dest-wal"
    exit 1
fi

echo "backed up $db -> $dest ($tables tables)"
