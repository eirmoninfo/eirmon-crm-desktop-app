let idleTimer = null;
let isIdle = false;

const IDLE_LIMIT = 2 * 60 * 1000; // 2 minutes

function resetIdle() {
  if (isIdle) {
    isIdle = false;
    window.api.resumeWork(); // 🔴 break end
  }

  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isIdle = true;
    window.api.pauseWork(); // 🔴 break start
  }, IDLE_LIMIT);
}

export function startActivityTracking() {
  ["mousemove", "keydown", "mousedown"].forEach(event => {
    window.addEventListener(event, resetIdle);
  });

  resetIdle();
}
