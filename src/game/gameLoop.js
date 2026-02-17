export function createGameLoop({ update, render }) {
  let rafId = null;
  let running = false;
  let lastTime = 0;

  function frame(time) {
    if (!running) {
      return;
    }

    const dt = Math.min(0.04, (time - lastTime) / 1000 || 0.016);
    lastTime = time;
    update(dt);
    render();
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}
