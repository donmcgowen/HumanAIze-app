// Polyfills injected by esbuild --inject before all bundled modules.
// These must be plain JS (not TS) and use var/function, not import/export.
// They run before any module initializers, including pdfjs-dist's DOMMatrix usage.

if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = function DOMMatrix() {
    var self = this;
    var handler = {
      get: function(target, prop) {
        if (typeof prop === "string" && !isNaN(Number(prop))) return 0;
        if (prop in target) return target[prop];
        return 0;
      }
    };
    return new Proxy(self, handler);
  };
  globalThis.DOMMatrix.prototype = {};
}

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = function ImageData(dataOrWidth, widthOrHeight, settings) {
    this.width = typeof dataOrWidth === "number" ? dataOrWidth : widthOrHeight;
    this.height = typeof dataOrWidth === "number" ? widthOrHeight : (settings || 0);
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  };
}

if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = function Path2D() {};
  globalThis.Path2D.prototype = {};
}
