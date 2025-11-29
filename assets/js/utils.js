export function updateJsonView(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.textContent = JSON.stringify(data, null, 2);
    el.classList.remove("empty");
  } catch (e) {
    el.textContent = "{}";
    el.classList.add("empty");
  }
}

export function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function roundToOne(v) {
  return Math.round(v * 10) / 10;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
