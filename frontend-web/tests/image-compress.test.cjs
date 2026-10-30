const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile frontend-web/src/lib/image-compress.ts via typescript
const filename = path.resolve(__dirname, '../src/lib/image-compress.ts');
const compiled = new Module(filename, module);
compiled._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
);

const { calculateDimensions, compressImage } = compiled.exports;

test('image-compress: calculateDimensions preserves aspect ratio capped at maxDimension 1600px', () => {
  // Already within 1600x1600
  assert.deepEqual(calculateDimensions(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(calculateDimensions(1600, 1200, 1600), { width: 1600, height: 1200 });

  // Landscape oversized (e.g. 4000x3000)
  assert.deepEqual(calculateDimensions(4000, 3000, 1600), { width: 1600, height: 1200 });

  // Portrait oversized (e.g. 2400x3200)
  assert.deepEqual(calculateDimensions(2400, 3200, 1600), { width: 1200, height: 1600 });

  // Square oversized (e.g. 2000x2000)
  assert.deepEqual(calculateDimensions(2000, 2000, 1600), { width: 1600, height: 1600 });

  // Edge cases: zero or negative
  assert.deepEqual(calculateDimensions(0, 0, 1600), { width: 0, height: 0 });
  assert.deepEqual(calculateDimensions(-10, 500, 1600), { width: -10, height: 500 });
});

test('image-compress: non-image files are returned as-is without modification', async () => {
  const pdfFile = {
    name: 'document.pdf',
    type: 'application/pdf',
    size: 2048,
  };

  const result = await compressImage(pdfFile);
  assert.equal(result, pdfFile);
});

test('image-compress: non-browser environment returns image file safely', async () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  try {
    delete global.window;
    delete global.document;

    const imgFile = {
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 5000000,
    };

    const res = await compressImage(imgFile);
    assert.equal(res, imgFile);
  } finally {
    if (originalWindow !== undefined) global.window = originalWindow;
    if (originalDocument !== undefined) global.document = originalDocument;
  }
});

test('image-compress: browser canvas flow resizes to max 1600 and retries quality 0.5 when > 1 MB', async () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalURL = global.URL;
  const originalImage = global.Image;
  const originalBlob = global.Blob;
  const originalFile = global.File;

  try {
    global.window = {};
    global.URL = {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {},
    };

    class MockImage {
      constructor() {
        this.naturalWidth = 3200;
        this.naturalHeight = 2400;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 1);
      }
    }
    global.Image = MockImage;

    global.Blob = class MockBlob {
      constructor(chunks, options) {
        this.chunks = chunks;
        this.type = options && options.type;
        const first = chunks && chunks[0];
        this.size = first ? (typeof first.size === 'number' ? first.size : first.length || 0) : 0;
      }
    };

    global.File = class MockFile extends global.Blob {
      constructor(chunks, name, options) {
        super(chunks, options);
        this.name = name;
      }
    };

    const toBlobQualityCalls = [];
    const createdCanvases = [];

    global.document = {
      createElement(tag) {
        if (tag === 'canvas') {
          const canvas = {
            width: 0,
            height: 0,
            getContext(mode) {
              if (mode === '2d') {
                return {
                  drawImage: (img, x, y, w, h) => {
                    canvas.drawnWidth = w;
                    canvas.drawnHeight = h;
                  },
                };
              }
              return null;
            },
            toBlob(cb, mime, quality) {
              toBlobQualityCalls.push(quality);
              // First call (0.75): simulate blob larger than 1 MB (1.5 MB)
              // Second call (0.5): simulate blob smaller than 1 MB (700 KB)
              const mockSize = quality === 0.75 ? 1500000 : 700000;
              const fakeData = new Uint8Array(mockSize);
              const b = new global.Blob([fakeData], { type: mime });
              cb(b);
            },
          };
          createdCanvases.push(canvas);
          return canvas;
        }
        return {};
      },
    };

    const bigFile = new global.File([new Uint8Array(5000000)], 'huge-banner.png', {
      type: 'image/png',
    });

    const compressed = await compressImage(bigFile);

    assert.equal(createdCanvases.length, 1);
    // 3200x2400 scaled down to max 1600 -> 1600x1200
    assert.equal(createdCanvases[0].width, 1600);
    assert.equal(createdCanvases[0].height, 1200);

    // Initial quality 0.75 was attempted, exceeded 1MB, so retried with 0.5
    assert.deepEqual(toBlobQualityCalls, [0.75, 0.5]);

    // Result is a JPEG file with .jpg extension
    assert.equal(compressed.type, 'image/jpeg');
    assert.equal(compressed.name, 'huge-banner.jpg');
    assert.equal(compressed.size, 700000);
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.URL = originalURL;
    global.Image = originalImage;
    global.Blob = originalBlob;
    global.File = originalFile;
  }
});
