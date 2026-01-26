
// ==== 要素参照 ====
const imageLoader = document.getElementById('imageLoader');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');

const curveCanvas = document.getElementById('curveCanvas');
const cctx = curveCanvas.getContext('2d');

const hueSlider = document.getElementById('hue');
const hueNumber = document.getElementById('hueNumber');


let originalImageData = null;

// スライダー
const brightnessSlider = document.getElementById('brightness');
const contrastSlider   = document.getElementById('contrast');
const saturationSlider = document.getElementById('saturation');

// 数値入力（今回のHTMLに合わせる）
const brightnessNumber = document.getElementById('brightnessNumber');
const contrastNumber   = document.getElementById('contrastNumber');
const saturationNumber = document.getElementById('saturationNumber');

// レベル補正
const levelBlack = document.getElementById('levelBlack');
const levelWhite = document.getElementById('levelWhite');
const levelMid   = document.getElementById('levelMid');

// レベル補正の表示用（HTMLに存在しています）
const levelBlackValue = document.getElementById('levelBlackValue');
const levelWhiteValue = document.getElementById('levelWhiteValue');
const levelMidValue   = document.getElementById('levelMidValue');


// ==== パラメータ ====
let params = {
  brightness: 0,
  saturation: 0,
  contrast  : 0,
  levelBlack: 0,
  levelMid  : 1.0,
  levelWhite: 255,
  hue       : 0,
};

// ==== トーンカーブ（2次ベジェ、3点） ====
let toneCurve = [
  { x: 0,   y: 0   },   // シャドウ
  { x: 128, y: 128 },   // ミッド
  { x: 255, y: 255 }    // ハイライト
];


// ==== 画像読込 ====
imageLoader.addEventListener('change', handleImage, false);

function handleImage(e) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const maxWidth = 800;
      const maxHeight = 600;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      drawCurveUI();
      applyEffects();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
}


// ==== ユーティリティ ====
function clamp255(v) {
  return Math.max(0, Math.min(255, v));
}

const to255   = (v) => Math.round(((v + 100) / 200) * 255);
const from255 = (d) => Math.round((d / 255) * 200 - 100);
const clamp0_255 = (v) => Math.max(0, Math.min(255, v));

//色相
function clampRange(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function levelAdjust(v, black, white, gamma) {
  let b = black;
  let w = white;
  if (b >= w) w = b + 1;

  let x = (v - b) / (w - b);
  x = Math.max(0, Math.min(1, x));
  x = Math.pow(x, 1 / gamma);
  return x * 255;
}

function sampleToneCurve(x) {
  const p0 = toneCurve[0];
  const p1 = toneCurve[1];
  const p2 = toneCurve[2];
  const t = x / 255;

  return clamp255(
    (1 - t) * (1 - t) * p0.y +
    2 * (1 - t) * t * p1.y +
    t * t * p2.y
  );
}

// ==== トーンカーブUI ====
function drawCurveUI() {
  cctx.clearRect(0, 0, 256, 256);

  // 背景
  cctx.fillStyle = '#111';
  cctx.fillRect(0, 0, 256, 256);

  // グリッド
  cctx.strokeStyle = '#333';
  for (let i = 0; i <= 256; i += 64) {
    cctx.beginPath();
    cctx.moveTo(i, 0);
    cctx.lineTo(i, 256);
    cctx.stroke();

    cctx.beginPath();
    cctx.moveTo(0, i);
    cctx.lineTo(256, i);
    cctx.stroke();
  }

  // カーブ（yは上下反転して描画）
  cctx.strokeStyle = '#0f0';
  cctx.beginPath();
  cctx.moveTo(0, 256 - toneCurve[0].y);
  for (let i = 0; i <= 255; i++) {
    const y = sampleToneCurve(i);
    cctx.lineTo(i, 256 - y);
  }
  cctx.stroke();

  // 制御点
  cctx.fillStyle = '#f00';
  toneCurve.forEach(p => {
    cctx.beginPath();
    cctx.arc(p.x, 256 - p.y, 5, 0, Math.PI * 2);
    cctx.fill();
  });
}

let draggingPoint = null;
curveCanvas.addEventListener('mousedown', e => {
  const rect = curveCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = 256 - (e.clientY - rect.top);

  toneCurve.forEach(p => {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < 100) {
      draggingPoint = p;
    }
  });
});

curveCanvas.addEventListener('mousemove', e => {
  if (!draggingPoint) return;

  const rect = curveCanvas.getBoundingClientRect();
  let y = 256 - (e.clientY - rect.top);
  draggingPoint.y = clamp255(y);

  drawCurveUI();
  applyEffects();
});

curveCanvas.addEventListener('mouseup',   () => draggingPoint = null);
curveCanvas.addEventListener('mouseleave', () => draggingPoint = null);


// ==== エフェクト適用 ====
function applyEffects() {
  if (!originalImageData) return;

  const imageData = new ImageData(
    new Uint8ClampedArray(originalImageData.data),
    originalImageData.width,
    originalImageData.height
  );

  const data = imageData.data;
  const brightness = params.brightness;
  const contrast   = (params.contrast + 100) / 100; // 0〜2
  const saturation = params.saturation / 100;
  const black = params.levelBlack;
  const white = params.levelWhite;
  const gamma = params.levelMid;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 明るさ
    r += brightness; g += brightness; b += brightness;

    // コントラスト
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    r = clamp255(r); g = clamp255(g); b = clamp255(b);

    // レベル補正
    r = levelAdjust(r, black, white, gamma);
    g = levelAdjust(g, black, white, gamma);
    b = levelAdjust(b, black, white, gamma);

    // トーンカーブ
    r = sampleToneCurve(r);
    g = sampleToneCurve(g);
    b = sampleToneCurve(b);

    // 色相（HSVで回転）
    if (params.hue !== 0) {
      let [hh, ss, vv] = rgbToHsv(r, g, b); // h:0-1
      hh = (hh + params.hue / 360) % 1;
      if (hh < 0) hh += 1;
      [r, g, b] = hsvToRgb(hh, ss, vv);
    }

    // 彩度（簡易RGB）※ ここは1回だけ！
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * (1 + saturation);
    g = gray + (g - gray) * (1 + saturation);
    b = gray + (b - gray) * (1 + saturation);

    data[i]     = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }


  ctx.putImageData(imageData, 0, 0);
}


function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = (max === 0 ? 0 : d / max), v = max;

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2;   break;
      case b: h = (r - g) / d + 4;   break;
    }
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, v]; // h:0-1, s:0-1, v:0-1
}

function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [r * 255, g * 255, b * 255];
}

// ==== スライダーと数値入力の双方向バインド ====
// 明度
brightnessSlider.addEventListener('input', function () {
  const v = parseInt(this.value, 10);
  params.brightness = v;
  brightnessNumber.value = to255(v); 
  applyEffects();
});
brightnessNumber.addEventListener('input', function () {
  let d = clamp0_255(parseInt(this.value, 10)); // 0..255 にクランプ
  this.value = d;
  const v = from255(d);                  // ★内部 -100..100 に戻す
  brightnessSlider.value = v;
  params.brightness = v;
  applyEffects();

});

// コントラスト
contrastSlider.addEventListener('input', function () {
  const v = parseInt(this.value, 10);
  params.contrast = v;
  contrastNumber.value = to255(v);
  applyEffects();
});
contrastNumber.addEventListener('input', function () {
  let d = clampRange(parseInt(this.value, 10), -100, 100);
  this.value = v;
  const v = from255(d);
  contrastSlider.value = v;
  params.contrast = v;
  applyEffects();
});

// 彩度
saturationSlider.addEventListener('input', function () {
  const v = parseInt(this.value, 10);
  params.saturation = v;
  saturationNumber.value = to255(v);
  applyEffects();
});
saturationNumber.addEventListener('input', function () {
  let d = clampRange(parseInt(this.value, 10), -100, 100);
  this.value = v;
  const v = from255(d); 
  saturationSlider.value = v;
  params.saturation = v;
  applyEffects();
});

hueSlider.addEventListener('input', function () {
  const v = parseInt(this.value, 10);
  params.hue = v;
  hueNumber.value = v;   // 数値に同期
  applyEffects();
});

hueNumber.addEventListener('input', function () {
  let v = clampRange(parseInt(this.value, 10), -180, 180);
  this.value = v;
  hueSlider.value = v;   // スライダーに同期
  params.hue = v;
  applyEffects();
});


// レベル：黒点（白点-1 まで）
levelBlack.addEventListener('input', function () {
  let b = parseInt(this.value, 10);
  const maxAllowed = params.levelWhite - 1;
  if (b > maxAllowed) b = maxAllowed;
  if (b < 0) b = 0;

  this.value = b;
  params.levelBlack = b;
  levelBlackValue.textContent = b;

  applyEffects();
});

// レベル：白点（黒点+1 以上）
levelWhite.addEventListener('input', function () {
  let w = parseInt(this.value, 10);
  const minAllowed = params.levelBlack + 1;
  if (w < minAllowed) w = minAllowed;
  if (w > 255) w = 255;

  this.value = w;
  params.levelWhite = w;
  levelWhiteValue.textContent = w;

  applyEffects();
});

// レベル：中間（ガンマ）
levelMid.addEventListener('input', function () {
  const v = parseFloat(this.value);
  params.levelMid = v;
  levelMidValue.textContent = v.toFixed(2);
  applyEffects();
});


// ==== Reset / Save ====
document.getElementById('reset').addEventListener('click', () => {
  // パラメータ
  params = {
    brightness: 0,
    saturation: 0,
    contrast  : 0,
    levelBlack: 0,
    levelMid  : 1.0,
    levelWhite: 255,
    hue       : 0
  };

  // スライダー & 数値 を戻す
  brightnessSlider.value = 0;
  contrastSlider.value   = 0;
  saturationSlider.value = 0;
  hueSlider.value = 0;

  brightnessNumber.value = 0;
  contrastNumber.value   = 0;
  saturationNumber.value = 0;
  hueNumber.value = 0;

  levelBlack.value = 0;
  levelMid.value   = 1.0;
  levelWhite.value = 255;

  levelBlackValue.textContent = 0;
  levelMidValue.textContent   = '1.00';
  levelWhiteValue.textContent = 255;

  
  brightnessNumber.value = to255(0);  // 128
  contrastNumber.value   = to255(0);  // 128
  saturationNumber.value = to255(0);  // 128
  hueNumber.value        = 0;         // 色相は度数表示のまま


  // トーンカーブ初期化
  toneCurve = [
    { x: 0,   y: 0   },
    { x: 128, y: 128 },
    { x: 255, y: 255 }
  ];

  drawCurveUI();

  // 画像を元に戻す
  if (originalImageData) {
    ctx.putImageData(originalImageData, 0, 0);
  }
});

document.getElementById('save').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'edited-image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// 初期UI描画（画像読み込み前でも枠が見えるように）
drawCurveUI();

// ★表示を 0..255 に揃える（内部は 0 のまま）
brightnessNumber.value = to255(0);  // 128
contrastNumber.value   = to255(0);  // 128
saturationNumber.value = to255(0);  // 128
