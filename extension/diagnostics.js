const report = document.getElementById("report");
const status = document.getElementById("status");
const copy = document.getElementById("copy-btn");
const refresh = document.getElementById("refresh-btn");

async function collect() {
  refresh.disabled = true;
  copy.disabled = true;
  status.textContent = "Collecting…";
  const res = await chrome.runtime.sendMessage({ type: "DIAGNOSE" });
  if (!res?.ok) {
    report.textContent = res?.error || "Couldn't collect diagnostics.";
    status.textContent = "Collection failed";
  } else {
    report.textContent = JSON.stringify(res.report, null, 2);
    status.textContent = "Ready";
    copy.disabled = false;
  }
  refresh.disabled = false;
}

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(report.textContent);
    status.textContent = "Copied";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(report);
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = "Clipboard blocked — report selected; press Ctrl+C";
  }
});

refresh.addEventListener("click", collect);
collect();
