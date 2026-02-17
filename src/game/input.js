export function createInputController(canvas) {
  const pressed = new Set();
  let touchPitch = 0;
  let dragging = false;
  let startY = 0;

  const onKeyDown = (event) => {
    pressed.add(event.key.toLowerCase());
  };

  const onKeyUp = (event) => {
    pressed.delete(event.key.toLowerCase());
  };

  const onPointerDown = (event) => {
    dragging = true;
    startY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragging) {
      return;
    }
    const delta = (startY - event.clientY) / 80;
    touchPitch = Math.max(-1, Math.min(1, delta));
  };

  const onPointerUp = (event) => {
    dragging = false;
    touchPitch = 0;
    canvas.releasePointerCapture?.(event.pointerId);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  return {
    getPitch() {
      let keyboardPitch = 0;
      if (pressed.has("w") || pressed.has("arrowup")) {
        keyboardPitch += 1;
      }
      if (pressed.has("s") || pressed.has("arrowdown")) {
        keyboardPitch -= 1;
      }
      return Math.max(-1, Math.min(1, keyboardPitch + touchPitch));
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    },
  };
}
