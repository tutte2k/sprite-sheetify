const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PNG = require("pngjs").PNG;

const inDir = "./out/";
const outputFilePath = path.join("./", "spritesheet.png");

const spriteSize = 32;
const CONCURRENCY_LIMIT = 100;
const maxSpritesPerRow = 128; // 4096 / 32 = 128 sprites per row

function nextPowerOfTwo(x) {
  return Math.pow(2, Math.ceil(Math.log2(x)));
}

async function asyncPool(concurrency, iterable, iteratorFn) {
  const executing = new Set();
  const results = new Array(iterable.length);

  for (const [index, item] of iterable.entries()) {
    const p = iteratorFn(item)
      .then((result) => {
        results[index] = result;
      })
      .catch((err) => {
        console.error(`Error processing item ${index}:`, err);
        results[index] = null;
      });

    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

function computeHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

fs.readdir(inDir, async (err, files) => {
  if (err) {
    console.error("Error reading directory:", err);
    return;
  }

  let images = files.filter((file) => file.endsWith(".png"));
  if (images.length === 0) {
    console.log("No PNG images found in the directory.");
    return;
  }

  console.log(`Found ${images.length} images.`);

  images.sort((a, b) => {
    const aNum = parseInt(a.match(/\d+/)) || 0;
    const bNum = parseInt(b.match(/\d+/)) || 0;
    return aNum - bNum;
  });

  console.log(`Images sorted: ${images.join(", ")}`);

  const sheetCols = maxSpritesPerRow;
  const sheetRows = Math.ceil(images.length / sheetCols);

  const spritesheetWidth = sheetCols * spriteSize;
  const spritesheetHeight = nextPowerOfTwo(sheetRows * spriteSize);

  const spritesheet = new PNG({
    width: spritesheetWidth,
    height: spritesheetHeight,
    filterType: -1,
  });

  const imageHashes = new Set();

  async function processImage(file, index) {
    return new Promise((resolve, reject) => {
      const filePath = path.join(inDir, file);

      fs.createReadStream(filePath)
        .pipe(new PNG())
        .on("parsed", function () {
          const hash = computeHash(this.data);

          if (imageHashes.has(hash)) {
            console.log(`Skipping duplicate: ${file}`);
            return resolve(null);
          }

          imageHashes.add(hash);
          resolve({ index, image: this });
        })
        .on("error", (err) => {
          console.error(`Error processing file ${file}:`, err);
          reject(err);
        });
    });
  }

  const processedImages = await asyncPool(
    CONCURRENCY_LIMIT,
    images.map((file, index) => ({ file, index })),
    ({ file, index }) => processImage(file, index)
  );

  const validImages = processedImages
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  console.log(`Unique images: ${validImages.length}`);

  validImages.forEach(({ image }, index) => {
    const col = index % sheetCols;
    const row = Math.floor(index / sheetCols);
    const xOffset = col * spriteSize;
    const yOffset = row * spriteSize;

    for (let x = 0; x < spriteSize; x++) {
      for (let y = 0; y < spriteSize; y++) {
        const idx = (y * image.width + x) * 4;
        const spriteIdx =
          ((y + yOffset) * spritesheetWidth + (x + xOffset)) * 4;

        spritesheet.data[spriteIdx] = image.data[idx];
        spritesheet.data[spriteIdx + 1] = image.data[idx + 1];
        spritesheet.data[spriteIdx + 2] = image.data[idx + 2];
        spritesheet.data[spriteIdx + 3] = image.data[idx + 3];
      }
    }
  });

  console.log("All unique images processed. Saving spritesheet...");

  const writeStream = fs.createWriteStream(outputFilePath);
  spritesheet.pack().pipe(writeStream);

  writeStream.on("finish", () => {
    console.log(`Spritesheet saved successfully: ${outputFilePath}`);
  });
});
