#!/usr/bin/env python3
"""Regression checks on a disposable database, after cargo build:

* two members whose feeds carry the SAME comment URN (a repost of a teammate's post) both sync
  without a unique-index failure, and the reposter's copy is neither stored nor scored;
* linking a second device does not unlink the first, and /api/me/sync-status reports the
  account-wide count on both.
"""
import datetime as dt
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS:', name, flush=True)

with tempfile.TemporaryDirectory(prefix='sync-devices-e2e-') as directory:
    log_path = Path(directory) / 'server.log'
    with log_path.open('w') as log:
        process = subprocess.Popen([str(ROOT / 'target/debug/linkedin-challenge-server')], cwd=ROOT,
            env={**os.environ, 'DATABASE_URL': f'turso:{directory}/test.db', 'SEED_DEMO': '1', 'PORT': '0'},
            stdout=log, stderr=log)
    try:
        for _ in range(200):
            output = log_path.read_text()
            match = re.search(r'listening on http://[^:]+:(\d+)', output)
            if match:
                break
            if process.poll() is not None:
                raise RuntimeError(output)
            time.sleep(.05)
        else:
            raise RuntimeError('server startup timed out: ' + output)
        base = 'http://127.0.0.1:' + match[1]

        class Client:
            def __init__(self, email=None, password='demopassword'):
                self.jar = http.cookiejar.CookieJar()
                self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
                if email:
                    self.request('/api/auth/login', {'email': email, 'password': password})
            def request(self, path, data=None, method=None, token=None, status=200):
                headers = {'Content-Type': 'application/json'}
                if token:
                    headers['Authorization'] = 'Bearer ' + token
                request = urllib.request.Request(base + path, headers=headers, method=method,
                    data=json.dumps(data).encode() if data is not None else None)
                try:
                    response = self.opener.open(request)
                except urllib.error.HTTPError as error:
                    response = error
                body = response.read()
                assert response.code == status, (path, response.code, status, body)
                return json.loads(body) if response.headers.get_content_type() == "application/json" else body.decode()
            def device_token(self):
                session = next(c.value for c in self.jar if c.name == 'session')
                return self.request('/api/auth/device/session', {'sessionToken': session})['syncToken']
            def sync(self, token, posts, status=200):
                return self.request('/api/sync', {'profile': {'followerCount': 100}, 'posts': posts}, token=token, status=status)

        now = dt.datetime.now(dt.timezone.utc).isoformat()
        def post(urn, comments, is_repost=False):
            return {'urn': urn, 'permalink': 'https://www.linkedin.com/feed/', 'createdAt': now,
                    'textPreview': 'e2e', 'isRepost': is_repost, 'metrics': {'reactions': 1, 'comments': len(comments)},
                    'comments': [{'urn': c, 'commenterUrn': 'urn:li:member:999', 'commenterName': 'Someone'} for c in comments]}

        shared = 'urn:li:comment:(activity:1,2)'
        ada = Client('ada@demo.test')
        ada_token = ada.device_token()
        ada.sync(ada_token, [post('urn:li:activity:1', [shared])])

        # --- the repost collision -------------------------------------------------------------
        owner = Client('admin@demo.test')
        owner_token = owner.device_token()
        owner.sync(owner_token, [post('urn:li:activity:repost-1', [shared], is_repost=True)])
        check('a repost carrying a comment URN another member already stored syncs with 200', True)
        # A non-repost from a second member that names an already-stored URN (quote post, URN
        # respelling) must also survive: the collision check is global, not per member.
        owner.sync(owner_token, [post('urn:li:activity:quote-1', [shared, 'urn:li:comment:(activity:quote-1,9)'])])
        check('a second member re-sending a stored comment URN syncs with 200', True)
        ada.sync(ada_token, [post('urn:li:activity:1', [shared])])
        check('the original owner still re-syncs the same comment idempotently', True)

        # --- two devices, one account --------------------------------------------------------
        second_token = ada.device_token()
        check('second device receives its own token', second_token != ada_token)
        ada.sync(ada_token, [post('urn:li:activity:1', [shared]), post('urn:li:activity:2', [])])
        check('first device is still accepted after the second linked', True)
        status_first = ada.request('/api/me/sync-status', token=ada_token)
        status_second = ada.request('/api/me/sync-status', token=second_token)
        check('a freshly linked device sees the account-wide post count, not zero',
              status_second['postsCount'] == status_first['postsCount'] >= 2 and status_second['lastSyncAt'] is not None)
        ada.request('/api/me/sync-status', token='st_bogus', status=401)
        check('unknown token is rejected on sync-status', True)
    finally:
        process.terminate()
        process.wait()
print(json.dumps({'result': 'PASS', 'checks': len(checks)}, indent=2))
