import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Inter font contains full Kazakh Cyrillic glyphs (Ә І Ң Ғ Ү Ұ Қ Ө Һ)', () => {
  const fontPath = path.resolve(
    __dirname,
    '../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
  );

  assert.equal(fs.existsSync(fontPath), true, 'Inter_400Regular.ttf should exist');
  const buffer = fs.readFileSync(fontPath);

  // Kazakh Cyrillic codepoints:
  const kazakhCodes = [
    { char: 'Ә', code: 0x04D8 },
    { char: 'ә', code: 0x04D9 },
    { char: 'І', code: 0x0406 },
    { char: 'і', code: 0x0456 },
    { char: 'Ң', code: 0x04A2 },
    { char: 'ң', code: 0x04A3 },
    { char: 'Ғ', code: 0x0492 },
    { char: 'ғ', code: 0x0493 },
    { char: 'Ү', code: 0x04AE },
    { char: 'ү', code: 0x04AF },
    { char: 'Ұ', code: 0x04B0 },
    { char: 'ұ', code: 0x04B1 },
    { char: 'Қ', code: 0x049A },
    { char: 'қ', code: 0x049B },
    { char: 'Ө', code: 0x04E8 },
    { char: 'ө', code: 0x04E9 },
    { char: 'Һ', code: 0x04BA },
    { char: 'һ', code: 0x04BB },
  ];

  const numTables = buffer.readUInt16BE(4);
  let cmapOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const tag = buffer.toString('utf8', 12 + i * 16, 16 + i * 16);
    if (tag === 'cmap') {
      cmapOffset = buffer.readUInt32BE(12 + i * 16 + 8);
      break;
    }
  }

  assert.notEqual(cmapOffset, 0, 'cmap table should be found');
  const numSubtables = buffer.readUInt16BE(cmapOffset + 2);

  let verifiedCodes = [];
  for (let s = 0; s < numSubtables; s++) {
    const offset = cmapOffset + buffer.readUInt32BE(cmapOffset + 4 + s * 8 + 4);
    const format = buffer.readUInt16BE(offset);
    if (format === 4) {
      const segCountX2 = buffer.readUInt16BE(offset + 6);
      const segCount = segCountX2 / 2;
      const endCodes = [];
      for (let c = 0; c < segCount; c++) endCodes.push(buffer.readUInt16BE(offset + 14 + c * 2));
      const startCodes = [];
      for (let c = 0; c < segCount; c++) startCodes.push(buffer.readUInt16BE(offset + 16 + segCountX2 + c * 2));

      for (const item of kazakhCodes) {
        for (let c = 0; c < segCount; c++) {
          if (item.code >= startCodes[c] && item.code <= endCodes[c]) {
            verifiedCodes.push(item.char);
            break;
          }
        }
      }
      break;
    }
  }

  assert.equal(verifiedCodes.length, kazakhCodes.length, 'All 18 Kazakh characters must be in cmap');
});
