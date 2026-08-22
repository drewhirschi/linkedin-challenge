// Popup controller. All heavy lifting happens in the service worker; the popup just messages it.
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function toast(text, kind) {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (kind ? " " + kind : "");
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2600);
}

// "Never" is a real answer here, not a placeholder: it is how someone tells a broken link from one
// that just hasn't come round yet. So we always show an absolute date and time alongside the
// relative one — "2h ago" is useless for spotting a sync that silently stopped three days back.
function fmtTime(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const exact = d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  if (diff < 60) return `just now (${exact})`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago (${exact})`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago (${exact})`;
  return `${Math.floor(diff / 86400)}d ago (${exact})`;
}

function fmtDueIn(ms) {
  if (ms <= 0) return "due now";
  const mins = Math.round(ms / 60000);
  return mins < 60 ? `in ${mins}m` : `in about ${Math.round(mins / 60)}h`;
}

// Reflect both prerequisites before the user clicks, so a failure is diagnosed rather than guessed.
async function renderPreflight() {
  const res = await send({ type: "PREFLIGHT" });
  const set = (id, good, fixId) => {
    const li = $(id);
    li.classList.toggle("ok", good);
    li.classList.toggle("bad", !good);
    li.querySelector(".mark").textContent = good ? "✓" : "✕";
    $(fixId).hidden = good;
  };
  set("check-app", res.appSignedIn, "fix-app");
  set("check-li", res.linkedInSignedIn, "fix-li");
  $("link-btn").disabled = !(res.appSignedIn && res.linkedInSignedIn);
}

async function render() {
  const { state } = await send({ type: "GET_STATE" });
  const linked = Boolean(state.syncToken);
  $("link-view").hidden = linked;
  $("status-view").hidden = !linked;

  if (linked) {
    $("display-name").textContent = state.displayName || "—";
    $("last-sync").textContent = fmtTime(state.lastSyncAt);
    const due = await send({ type: "SYNC_DUE_IN" });
    $("next-sync").textContent = fmtDueIn(due.ms ?? 0);
    $("posts-count").textContent = state.lastPostsIngested ?? 0;
    const errLine = $("error-line");
    errLine.hidden = !state.lastError;
    errLine.textContent = state.lastError || "";
  } else {
    await renderPreflight();
  }
}

$("fix-app").addEventListener("click", async () => {
  await send({ type: "OPEN_SIGN_IN" });
  window.close();
});

$("fix-li").addEventListener("click", async () => {
  await send({ type: "OPEN_LINKEDIN" });
  window.close();
});

$("link-btn").addEventListener("click", async () => {
  const btn = $("link-btn");
  btn.disabled = true;
  btn.textContent = "Connecting…";
  try {
    const res = await send({ type: "LINK" });
    if (res.needsLinkedIn) {
      toast("Opened LinkedIn — log in there, then press Connect.", "err");
      return;
    }
    if (res.needsSignIn) {
      toast("Opened the sign-in page — come back and press Connect.", "err");
      return;
    }
    if (!res.ok) throw new Error(res.error);
    toast("Connected — syncing your stats…", "ok");
  } catch (e) {
    toast(e.message || "Couldn't connect.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Connect";
    render();
  }
});

$("sync-btn").addEventListener("click", async () => {
  const btn = $("sync-btn");
  btn.disabled = true;
  btn.textContent = "Syncing…";
  try {
    const res = await send({ type: "SYNC_NOW" });
    if (!res.ok) throw new Error(res.error);
    toast(`Synced ${res.postsIngested} post(s).`, "ok");
  } catch (e) {
    toast(e.message || "Sync failed.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sync now";
    render();
  }
});

// Diagnostics get a full extension page: popup clipboards are unreliable and the popup closes as
// soon as it loses focus. The page keeps the report visible, selectable, and copyable.
$("diag-btn").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("diagnostics.html") });
  window.close();
});

render();
