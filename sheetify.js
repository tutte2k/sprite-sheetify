const fs = require("fs");
const path = require("path");
const PNG = require("pngjs").PNG;

const inDir = "./out/";
const outputFilePath = path.join("./", "spritesheet.png");

const spriteSize = 32;

fs.readdir(inDir, (err, files) => {
  if (err) {
    console.error("Error reading directory:", err);
    return;
  }

  const images = files.filter((file) => file.endsWith(".png"));

  if (images.length === 0) {
    console.log("No PNG images found in the directory.");
    return;
  }

  console.log(`Found ${images.length} images.`);

  images.sort((a, b) => {
    const aNum = parseInt(a.match(/\d+/));
    const bNum = parseInt(b.match(/\d+/));
    return aNum - bNum;
  });

  console.log(`Images sorted: ${images.join(", ")}`);

  const sheetCols = Math.ceil(Math.sqrt(images.length));
  const sheetRows = Math.ceil(images.length / sheetCols);

  const spritesheetWidth = sheetCols * spriteSize;
  const spritesheetHeight = sheetRows * spriteSize;
  const spritesheet = new PNG({
    width: spritesheetWidth,
    height: spritesheetHeight,
    filterType: -1,
  });

  let imagesProcessed = 0;

  function processImage(file, index) {
    return new Promise((resolve, reject) => {
      const filePath = path.join(inDir, file);
      const col = index % sheetCols;
      const row = Math.floor(index / sheetCols);
      const xOffset = col * spriteSize;
      const yOffset = row * spriteSize;

      console.log(`Processing ${file} at position (${xOffset}, ${yOffset})`);

      fs.createReadStream(filePath)
        .pipe(new PNG())
        .on("parsed", function () {
          for (let x = 0; x < spriteSize; x++) {
            for (let y = 0; y < spriteSize; y++) {
              const idx = (y * this.width + x) * 4;
              const r = this.data[idx];
              const g = this.data[idx + 1];
              const b = this.data[idx + 2];
              const a = this.data[idx + 3];

              const spriteIdx =
                ((y + yOffset) * spritesheetWidth + (x + xOffset)) * 4;
              spritesheet.data[spriteIdx] = r;
              spritesheet.data[spriteIdx + 1] = g;
              spritesheet.data[spriteIdx + 2] = b;
              spritesheet.data[spriteIdx + 3] = a;
            }
          }

          imagesProcessed++;
          resolve();
        })
        .on("error", reject);
    });
  }

  const imageProcessingPromises = images.map((file, index) =>
    processImage(file, index)
  );

  Promise.all(imageProcessingPromises)
    .then(() => {
      console.log("All images processed. Saving spritesheet...");

      const writeStream = fs.createWriteStream(outputFilePath);
      spritesheet.pack().pipe(writeStream);

      writeStream.on("finish", () => {
        console.log(`Spritesheet saved successfully: ${outputFilePath}`);
      });
    })
    .catch((err) => {
      console.error("Error processing images:", err);
    });
});
