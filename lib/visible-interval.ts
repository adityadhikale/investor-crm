/**
 * Runs `callback` every `ms` while the browser tab is visible. Polling pauses
 * while the tab is hidden and catches up with one call when it is shown again.
 * Returns a cleanup function.
 */
export function startVisibleInterval(callback: () => void, ms: number): () => void {
  let interval: number | null = null;

  function start() {
    if (interval === null) interval = window.setInterval(callback, ms);
  }

  function stop() {
    if (interval !== null) {
      window.clearInterval(interval);
      interval = null;
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      stop();
    } else {
      callback();
      start();
    }
  }

  if (document.visibilityState !== "hidden") start();
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    stop();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
