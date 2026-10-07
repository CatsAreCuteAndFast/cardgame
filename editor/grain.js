// The grain on tiles and cards: noise drawn in the browser at the screen's own pixel size, so each speck is one device pixel
// and stays sharp at any tile size, zoom or screen. It sets --grain-img and --grain-size (editor.css) on the page.

const SIZE = 512; // device pixels per side; it repeats, and each tile shows a different part of it (grainSpot in board.js)
const STRENGTH = 10; // how far each speck strays from mid grey, which overlays as no change

function drawNoise() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < image.data.length; i += 4) {
    // roughly normal: the sum of three uniform numbers
    const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 2 * STRENGTH;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  canvas.toBlob((blob) => document.documentElement.style.setProperty("--grain-img", `url(${URL.createObjectURL(blob)})`));
}

// one texture pixel per device pixel, kept up to date when the zoom or screen changes
function fitToScreen() {
  const ratio = window.devicePixelRatio || 1;
  document.documentElement.style.setProperty("--grain-size", `${SIZE / ratio}px`);
  matchMedia(`(resolution: ${ratio}dppx)`).addEventListener("change", fitToScreen, { once: true });
}

export function initGrain() {
  fitToScreen();
  drawNoise();
}
