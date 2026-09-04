#!/usr/bin/env bash
# Exercise password authentication against a real server and isolated database.
set -euo pipefail

cd "$(dirname "$0")/.."

test_dir=$(mktemp -d)
server_pid=""
cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$test_dir"
}
trap cleanup EXIT

cargo build --bin linkedin-challenge-server

DATABASE_URL="turso:$test_dir/auth.db" PORT=0 \
  ./target/debug/linkedin-challenge-server >"$test_dir/server.log" 2>&1 &
server_pid=$!

port=""
for _ in $(seq 1 100); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$test_dir/server.log" >&2
    exit 1
  fi
  port=$(sed -n 's/.*listening on http:\/\/[^:]*:\([0-9][0-9]*\).*/\1/p' "$test_dir/server.log" | tail -1)
  [ -n "$port" ] && break
  sleep 0.05
done
[ -n "$port" ] || { cat "$test_dir/server.log" >&2; echo "server did not start" >&2; exit 1; }

base="http://127.0.0.1:$port"
cookies="$test_dir/cookies"
email="auth-e2e@enzo.health"
password="AuthE2E!password"

request() {
  local expected=$1
  local body=$2
  shift 2
  local status
  status=$(curl -sS -o "$body" -w '%{http_code}' "$@")
  if [ "$status" != "$expected" ]; then
    echo "expected HTTP $expected, got $status: $(sed -n '1p' "$body")" >&2
    exit 1
  fi
}

request 200 "$test_dir/health.json" "$base/api/health"
request 400 "$test_dir/weak.json" -H 'content-type: application/json' \
  --data-binary '{"name":"Auth Test","email":"weak@enzo.health","password":"short"}' \
  "$base/api/auth/signup"
request 400 "$test_dir/outside-domain.json" -H 'content-type: application/json' \
  --data-binary '{"name":"Outsider","email":"outsider@example.com","password":"AuthE2E!password"}' \
  "$base/api/auth/signup"
grep -q 'Your email is not valid' "$test_dir/outside-domain.json"
request 200 "$test_dir/signup.json" -c "$cookies" -H 'content-type: application/json' \
  --data-binary "{\"name\":\"Auth E2E\",\"email\":\"$email\",\"password\":\"$password\"}" \
  "$base/api/auth/signup"
grep -q '"ok":true' "$test_dir/signup.json"

request 200 "$test_dir/me-after-signup.json" -b "$cookies" "$base/api/auth/me"
grep -q '"signedIn":true' "$test_dir/me-after-signup.json"
grep -q '"displayName":"Auth E2E"' "$test_dir/me-after-signup.json"
if grep -q '"isAdmin"' "$test_dir/me-after-signup.json"; then
  echo "account response must not expose the removed isAdmin field" >&2
  exit 1
fi

request 409 "$test_dir/duplicate.json" -H 'content-type: application/json' \
  --data-binary "{\"name\":\"Duplicate\",\"email\":\"$email\",\"password\":\"$password\"}" \
  "$base/api/auth/signup"
request 200 "$test_dir/logout.json" -b "$cookies" -c "$cookies" -X POST "$base/api/auth/logout"
request 200 "$test_dir/me-after-logout.json" -b "$cookies" "$base/api/auth/me"
grep -q '"signedIn":false' "$test_dir/me-after-logout.json"

request 401 "$test_dir/wrong-password.json" -H 'content-type: application/json' \
  --data-binary "{\"email\":\"$email\",\"password\":\"wrong-password\"}" \
  "$base/api/auth/login"
request 200 "$test_dir/login.json" -b "$cookies" -c "$cookies" -H 'content-type: application/json' \
  --data-binary "{\"email\":\"$email\",\"password\":\"$password\"}" \
  "$base/api/auth/login"
request 200 "$test_dir/me-after-login.json" -b "$cookies" "$base/api/auth/me"
grep -q '"signedIn":true' "$test_dir/me-after-login.json"
grep -q '"displayName":"Auth E2E"' "$test_dir/me-after-login.json"

echo "auth e2e passed: validation, signup, session, duplicate rejection, logout, and password login"
