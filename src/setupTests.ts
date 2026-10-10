import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; @xyflow/react relies on it to measure the canvas.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

// jsdom has no DOMMatrixReadOnly; @xyflow/react's updateNodeInternals reads the zoom scale
// (m22) off a parsed CSS transform matrix. Tests don't have a real zoomed transform, so a
// fixed identity scale is a safe stand-in.
class DOMMatrixReadOnlyStub {
  m22 = 1;
  constructor(_transform?: string) {
    void _transform;
  }
}
if (!("DOMMatrixReadOnly" in globalThis)) {
  (globalThis as unknown as { DOMMatrixReadOnly: typeof DOMMatrixReadOnlyStub }).DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
}

// jsdom's File/Blob.text() (needed by the app menu's Open handler) is unreliable in this
// environment: Node's Response doesn't recognize jsdom's Blob as blob-like (different
// realm/class) and stringifies it instead of reading it. jsdom's own FileReader does
// understand its Blob/File, so route through that instead.
Blob.prototype.text = function (this: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(this);
  });
};

// jsdom's Blob doesn't implement .arrayBuffer() at all (needed by the .nedito.png Open
// path, editablePngFormat.ts's decodeEditablePng) — same class of gap as .text() above, same
// FileReader-based fix.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
