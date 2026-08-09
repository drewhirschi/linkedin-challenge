#!/usr/bin/env bash
# Add tables and indexes that the models define but the live database is missing.
#
# Toasty's push_schema() issues plain CREATE TABLE for everything, so it can only run against an
# empty database — which made "add a field" mean "delete every account". That has already cost real
# data here once. This closes the common case: a NEW table or index can be added in place.
#
# It deliberately does not attempt column changes. SQLite can ADD COLUMN but not drop or retype one,
# and guessing at a rename is how migrations corrupt data silently. If a table's columns changed,
# this says so and stops.
set -euo pipefail
cd "$(dirname "$0")"

live=${1:-linkedin.db}
[ -f "$live" ] || { echo "no such database: $live" >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Let the app build a pristine database from the current models — that is the reference schema.
echo "building reference schema from the current models…"
DATABASE_URL="turso:$tmp/reference.db" PORT=0 timeout 60 ./target/debug/linkedin-challenge-server \
    >"$tmp/boot.log" 2>&1 &
boot=$!
for _ in $(seq 1 60); do
    sleep 0.5
    [ -f "$tmp/reference.db" ] && sqlite3 "$tmp/reference.db" \
        "select 1 from sqlite_master limit 1;" >/dev/null 2>&1 && break
done
kill "$boot" 2>/dev/null || true
wait "$boot" 2>/dev/null || true

if ! sqlite3 "$tmp/reference.db" "select 1 from sqlite_master limit 1;" >/dev/null 2>&1; then
    echo "could not build a reference schema; see $tmp/boot.log" >&2
    cat "$tmp/boot.log" >&2
    exit 1
fi

./backup-db.sh "$live" >/dev/null

want=$(sqlite3 "$tmp/reference.db" "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name;")
have=$(sqlite3 "$live" "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name;")

applied=0
for table in $want; do
    if ! grep -qx "$table" <<<"$have"; then
        echo "  + table $table"
        sqlite3 "$tmp/reference.db" \
            "select sql from sqlite_master where type in ('table','index') and tbl_name='$table' and sql is not null;" \
            | while read -r stmt; do [ -n "$stmt" ] && sqlite3 "$live" "$stmt;"; done
        applied=$((applied + 1))
        continue
    fi
    # Same table on both sides: compare columns so a silent mismatch can't masquerade as success.
    a=$(sqlite3 "$tmp/reference.db" "select group_concat(name||':'||type, ',') from pragma_table_info('$table');")
    b=$(sqlite3 "$live" "select group_concat(name||':'||type, ',') from pragma_table_info('$table');")
    if [ "$a" != "$b" ]; then
        echo "  ! table $table has different columns — this script will not guess." >&2
        echo "      models: $a" >&2
        echo "      live:   $b" >&2
        echo "    Recreate the database, or ALTER it by hand." >&2
        exit 1
    fi
done

# Indexes on tables that already existed.
sqlite3 "$tmp/reference.db" "select name, sql from sqlite_master where type='index' and sql is not null;" |
    while IFS='|' read -r name sql; do
        if [ -z "$(sqlite3 "$live" "select name from sqlite_master where type='index' and name='$name';")" ]; then
            echo "  + index $name"
            sqlite3 "$live" "$sql;"
        fi
    done

if [ "$applied" -eq 0 ]; then
    echo "schema is already up to date"
else
    echo "added $applied table(s) to $live"
fi
