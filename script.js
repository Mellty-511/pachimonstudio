// ==== 要素参照 ====
const imageLoader = document.getElementById('imageLoader');
const imageInfo   = document.getElementById('imageInfo');
const canvas      = document.getElementById('imageCanvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });   // 大きな画像の読み書きが多いので、CPU側の canvas にする
const glCanvas    = document.getElementById('glCanvas');

const curveCanvas = document.getElementById('curveCanvas');
const cctx = curveCanvas.getContext('2d');

const brightnessSlider = document.getElementById('brightness');
const contrastSlider   = document.getElementById('contrast');
const saturationSlider = document.getElementById('saturation');
const hueSlider        = document.getElementById('hue');
const brightnessNumber = document.getElementById('brightnessNumber');
const contrastNumber   = document.getElementById('contrastNumber');
const saturationNumber = document.getElementById('saturationNumber');
const hueNumber        = document.getElementById('hueNumber');

const levelBlack      = document.getElementById('levelBlack');
const levelMid        = document.getElementById('levelMid');
const levelWhite      = document.getElementById('levelWhite');
const levelBlackValue = document.getElementById('levelBlackValue');
const levelMidValue   = document.getElementById('levelMidValue');
const levelWhiteValue = document.getElementById('levelWhiteValue');

const sharpnessSlider = document.getElementById('sharpness');
const sharpnessNumber = document.getElementById('sharpnessNumber');
const blurSlider      = document.getElementById('blur');
const blurNumber      = document.getElementById('blurNumber');

const penOverlay    = document.getElementById('penOverlay');
const penToggle     = document.getElementById('penToggle');
const penSizeSlider = document.getElementById('penSize');
const penSizeNumber = document.getElementById('penSizeNumber');
const penReadout    = document.getElementById('penReadout');

const styleRefInput     = document.getElementById('styleRef');
const styleRefThumb     = document.getElementById('styleRefThumb');
const styleStatus       = document.getElementById('styleStatus');
const styleToneSlider   = document.getElementById('styleTone');
const styleToneNumber   = document.getElementById('styleToneNumber');
const styleColorSlider  = document.getElementById('styleColor');
const styleColorNumber  = document.getElementById('styleColorNumber');
const styleApplyBtn     = document.getElementById('styleApply');

const gradMapCanvas         = document.getElementById('gradMapCanvas');
const gmCtx                 = gradMapCanvas.getContext('2d');
const colorPicker           = document.getElementById('gradMapColorPicker');
const gradMapOpacitySlider  = document.getElementById('gradMapOpacity');
const gradMapOpacityNumber  = document.getElementById('gradMapOpacityNumber');
const gradMapPresetSel      = document.getElementById('gradMapPreset');

const caXSlider = document.getElementById('caX');
const caXNumber = document.getElementById('caXNumber');
const caYSlider = document.getElementById('caY');
const caYNumber = document.getElementById('caYNumber');

const laAmountSlider = document.getElementById('lineArtAmount');
const laAmountNumber = document.getElementById('lineArtAmountNumber');
const laSensSlider   = document.getElementById('lineArtSens');
const laSensNumber   = document.getElementById('lineArtSensNumber');
const laThreshSlider = document.getElementById('lineArtThresh');
const laThreshNumber = document.getElementById('lineArtThreshNumber');

const modeGPURadio  = document.getElementById('modeGPU');
const modeCPURadio  = document.getElementById('modeCPU');
const benchmarkBtn  = document.getElementById('benchmarkBtn');
const gpuTimeValue  = document.getElementById('gpuTimeValue');
const cpuTimeValue  = document.getElementById('cpuTimeValue');
const gpuStatusNote = document.getElementById('gpuStatusNote');

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

let originalImageData = null;
let imageId = 0;   // 画像を読み込むたびに増える（解析結果のキャッシュ判定用）

// ==== パラメータ ====
const defaultParams = () => ({
  brightness    : 0,
  saturation    : 0,
  contrast      : 0,
  levelBlack    : 0,
  levelMid      : 1.0,
  levelWhite    : 255,
  hue           : 0,
  sharpness     : 0,
  blur          : 0,     // ガウスぼかし半径(σ, px) 0-20（0でオフ）
  gradMapOpacity: 0,
  caX           : 0,     // 色収差 横ずれ(px)
  caY           : 0,     // 色収差 縦ずれ(px)
  lineArtAmount : 0,     // 線画抽出の適用量 0-100（0でオフ）
  lineArtSens   : 50,    // 感度 0-100
  lineArtThresh : 15,    // しきい値 0-100（これ以下の弱い輪郭は無視）
});
let params = defaultParams();

let renderMode = 'gpu';
let preferredMode = 'gpu';   // ユーザーが選んだ処理方式（画像が大きくて一時的に CPU になっても、小さい画像でここに戻す）
let gpuImageOK = false;      // 現在の画像が GPU で扱えるサイズか
let glMaxSize = 0;           // この GPU で扱える一辺の最大ピクセル数

// ==== ユーティリティ ====
function clamp(v, lo, hi) { return Number.isNaN(v) ? lo : Math.max(lo, Math.min(hi, v)); }
const clamp255 = (v) => clamp(v, 0, 255);
const to255    = (v) => Math.round(((v + 100) / 200) * 255);
const from255  = (d) => Math.round((d / 255) * 200 - 100);

// ==== 画像読込 ====
// ブラウザの canvas が扱える実用上の上限。これを超える巨大画像だけ、やむを得ず縮小する
const MAX_CANVAS_SIDE = 16384, MAX_CANVAS_PIXELS = 150e6;

imageLoader.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const srcW = img.naturalWidth, srcH = img.naturalHeight;
    let w = srcW, h = srcH;
    const lim = Math.min(1, MAX_CANVAS_SIDE / Math.max(w, h), Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
    if (lim < 1) { w = Math.floor(w * lim); h = Math.floor(h * lim); }

    canvas.width = w; canvas.height = h;               // 元の解像度のまま読み込む
    ctx.drawImage(img, 0, 0, w, h);
    originalImageData = ctx.getImageData(0, 0, w, h);
    imageId++;
    setupPenForImage(w, h);

    // GPU で扱えるサイズか（テクスチャ・描画バッファの上限）。超える場合は CPU で処理する
    gpuImageOK = glSupported && w <= glMaxSize && h <= glMaxSize;
    if (gpuImageOK) {
      glCanvas.width = w; glCanvas.height = h;
      if (gl.drawingBufferWidth < w || gl.drawingBufferHeight < h) gpuImageOK = false;
    }
    if (gpuImageOK) {
      gl.viewport(0, 0, w, h); uploadImageTexture(); resizeBlurTargets(w, h);
    } else if (glSupported) {
      glCanvas.width = 1; glCanvas.height = 1;         // 使わない GPU 側のメモリを解放
      resizeBlurTargets(1, 1);
    }
    if (glSupported) {
      renderMode = gpuImageOK ? preferredMode : 'cpu';
      modeGPURadio.disabled = !gpuImageOK;
      modeGPURadio.checked = renderMode === 'gpu'; modeCPURadio.checked = renderMode === 'cpu';
    }
    refreshModeNote();

    imageInfo.textContent = w + ' × ' + h + ' px' +
      (lim < 1 ? '（上限のため ' + srcW + '×' + srcH + ' から縮小）' : '（元の解像度）');
    applyEffects();
    pushHistory();
  };
  img.onerror = () => { URL.revokeObjectURL(url); imageInfo.textContent = '画像を読み込めませんでした'; };
  img.src = url;
}, false);

// ================================================================
// ヒストリー（Undo / Redo）
// ================================================================
let history      = [];
let historyIndex = -1;
const MAX_HISTORY = 100;

function snapshotState() {
  return {
    params           : { ...params },
    toneCurvePoints  : toneCurvePoints.map(p => ({ ...p })),
    gradientMapStops : gradientMapStops.map(s => ({ ...s })),
    hueBands         : { shift: hueBands.shift.slice(), sat: hueBands.sat.slice() },
  };
}

function pushHistory() {
  history.splice(historyIndex + 1);
  history.push(snapshotState());
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
  syncHistoryButtons();
}

function undo() { if (historyIndex > 0)                   { historyIndex--; restoreState(history[historyIndex]); syncHistoryButtons(); } }
function redo() { if (historyIndex < history.length - 1)  { historyIndex++; restoreState(history[historyIndex]); syncHistoryButtons(); } }

function syncHistoryButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= history.length - 1;
}

function restoreState(state) {
  Object.assign(params, state.params);

  // トーンカーブ
  toneCurvePoints = state.toneCurvePoints.map(p => ({ ...p }));
  toneCurveLUT    = buildToneCurveLUT(toneCurvePoints);
  if (glSupported) uploadLutTexture();
  drawCurveUI();

  // グラデーションマップ
  gradientMapStops = state.gradientMapStops.map(s => ({ ...s }));
  gradientMapLUT   = buildGradientMapLUT(gradientMapStops);
  if (glSupported) uploadGradMapTexture();
  selectedGradStop = null;
  drawGradMapUI();

  // 色相別補正
  hueBands = { shift: state.hueBands.shift.slice(), sat: state.hueBands.sat.slice() };
  syncHueBands();

  // 全UIコントロールを同期
  brightnessSlider.value = params.brightness;  brightnessNumber.value = to255(params.brightness);
  contrastSlider.value   = params.contrast;    contrastNumber.value   = to255(params.contrast);
  saturationSlider.value = params.saturation;  saturationNumber.value = to255(params.saturation);
  hueSlider.value        = params.hue;         hueNumber.value        = params.hue;
  sharpnessSlider.value  = params.sharpness;   sharpnessNumber.value  = params.sharpness;
  blurSlider.value       = params.blur;        blurNumber.value       = params.blur;
  gradMapOpacitySlider.value = params.gradMapOpacity; gradMapOpacityNumber.value = params.gradMapOpacity;
  caXSlider.value = params.caX; caXNumber.value = params.caX;
  caYSlider.value = params.caY; caYNumber.value = params.caY;
  laAmountSlider.value = params.lineArtAmount; laAmountNumber.value = params.lineArtAmount;
  laSensSlider.value   = params.lineArtSens;   laSensNumber.value   = params.lineArtSens;
  laThreshSlider.value = params.lineArtThresh; laThreshNumber.value = params.lineArtThresh;
  levelBlack.value = params.levelBlack; levelBlackValue.textContent = params.levelBlack;
  levelMid.value   = params.levelMid;   levelMidValue.textContent   = params.levelMid.toFixed(2);
  levelWhite.value = params.levelWhite; levelWhiteValue.textContent = params.levelWhite;

  applyEffects();
}

// キーボードショートカット
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;
  if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// ================================================================
// トーンカーブ
// ================================================================
const CURVE_HIT_R2 = 100;
const CURVE_MIN_GAP = 2;

let toneCurvePoints = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
let toneCurveLUT    = null;

function buildToneCurveLUT(pts) {
  const n  = pts.length;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);

  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i+1] - ys[i]) / (xs[i+1] - xs[i]));

  const m = new Array(n);
  m[0] = d[0]; m[n-1] = d[n-2];
  for (let i = 1; i < n-1; i++) m[i] = (d[i-1] + d[i]) / 2;

  for (let i = 0; i < n-1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i+1] = 0; continue; }
    const a = m[i]/d[i], b = m[i+1]/d[i], h = Math.hypot(a, b);
    if (h > 3) { const t = 3/h; m[i] = t*a*d[i]; m[i+1] = t*b*d[i]; }
  }

  const lut = new Uint8ClampedArray(256);
  let seg = 0;
  for (let x = 0; x <= 255; x++) {
    while (seg < n-2 && x > xs[seg+1]) seg++;
    const x0 = xs[seg], x1 = xs[seg+1], y0 = ys[seg], y1 = ys[seg+1];
    const H = x1 - x0, t = H === 0 ? 0 : (x - x0) / H;
    const h00 = 2*t**3-3*t**2+1, h10 = t**3-2*t**2+t, h01 = -2*t**3+3*t**2, h11 = t**3-t**2;
    lut[x] = Math.round(clamp255(h00*y0 + h10*H*m[seg] + h01*y1 + h11*H*m[seg+1]));
  }
  return lut;
}

function updateToneCurve() {
  toneCurveLUT = buildToneCurveLUT(toneCurvePoints);
  if (glSupported) uploadLutTexture();
  drawCurveUI();
  applyEffects();
}

let curveGuide = null;   // ペンの円の中の明るさ {lo, hi, c}（0〜255）。null なら非表示

function drawCurveUI() {
  cctx.clearRect(0, 0, 256, 256);
  cctx.fillStyle = '#111'; cctx.fillRect(0, 0, 256, 256);
  cctx.strokeStyle = '#333';
  for (let i = 0; i <= 256; i += 64) {
    cctx.beginPath(); cctx.moveTo(i, 0); cctx.lineTo(i, 256); cctx.stroke();
    cctx.beginPath(); cctx.moveTo(0, i); cctx.lineTo(256, i); cctx.stroke();
  }
  cctx.strokeStyle = '#0f0'; cctx.lineWidth = 1.5;
  cctx.beginPath(); cctx.moveTo(0, 256 - toneCurveLUT[0]);
  for (let x = 1; x <= 255; x++) cctx.lineTo(x, 256 - toneCurveLUT[x]);
  cctx.stroke();
  cctx.fillStyle = '#f00';
  toneCurvePoints.forEach(p => { cctx.beginPath(); cctx.arc(p.x, 256-p.y, 5, 0, Math.PI*2); cctx.fill(); });

  if (curveGuide) {
    const lo = clamp(Math.round(curveGuide.lo), 0, 255), hi = clamp(Math.round(curveGuide.hi), 0, 255);
    const c  = clamp(Math.round(curveGuide.c),  0, 255);
    cctx.save();
    cctx.fillStyle = 'rgba(255,220,0,0.16)';                 // ペンの円に含まれる明るさの範囲
    cctx.fillRect(lo, 0, Math.max(1, hi - lo + 1), 256);
    cctx.strokeStyle = 'rgba(255,220,0,0.55)'; cctx.lineWidth = 1;
    cctx.beginPath(); cctx.moveTo(lo + 0.5, 0); cctx.lineTo(lo + 0.5, 256); cctx.moveTo(hi + 0.5, 0); cctx.lineTo(hi + 0.5, 256); cctx.stroke();
    cctx.setLineDash([4, 3]); cctx.strokeStyle = 'rgba(255,220,0,0.95)';   // 平均
    cctx.beginPath(); cctx.moveTo(c + 0.5, 0); cctx.lineTo(c + 0.5, 256); cctx.stroke();
    cctx.setLineDash([]);
    cctx.fillStyle = '#ffdc00';
    cctx.beginPath(); cctx.arc(c + 0.5, 256 - toneCurveLUT[c], 4, 0, Math.PI * 2); cctx.fill();
    cctx.restore();
  }
}

function getCurvePos(e) {
  const r = curveCanvas.getBoundingClientRect();
  return {
    x: clamp((e.clientX - r.left) * (256 / r.width), 0, 255),
    y: clamp(256 - (e.clientY - r.top) * (256 / r.height), 0, 255),
  };
}

function nearestCurvePoint(x, y) {
  let idx = -1, best = CURVE_HIT_R2;
  toneCurvePoints.forEach((p, i) => { const d = (p.x-x)**2+(p.y-y)**2; if (d < best) { best = d; idx = i; } });
  return idx;
}

function addCurvePoint(x, y) {
  let at = toneCurvePoints.findIndex(p => p.x > x);
  if (at === -1) at = toneCurvePoints.length - 1;
  const lx = toneCurvePoints[at-1].x, rx = toneCurvePoints[at].x;
  if (rx - lx <= CURVE_MIN_GAP * 2) return -1;
  toneCurvePoints.splice(at, 0, { x: clamp(Math.round(x), lx+CURVE_MIN_GAP, rx-CURVE_MIN_GAP), y: clamp(Math.round(y), 0, 255) });
  return at;
}

let curveDragging = null;
curveCanvas.addEventListener('mousedown', e => {
  const { x, y } = getCurvePos(e);
  const idx = nearestCurvePoint(x, y);
  if (idx !== -1) { curveDragging = idx; }
  else { const ni = addCurvePoint(x, y); if (ni !== -1) { curveDragging = ni; updateToneCurve(); } }
});
curveCanvas.addEventListener('mousemove', e => {
  if (curveDragging === null) return;
  const { x, y } = getCurvePos(e);
  const pts = toneCurvePoints, i = curveDragging, isEnd = i === 0 || i === pts.length-1;
  if (!isEnd) pts[i].x = clamp(Math.round(x), pts[i-1].x+CURVE_MIN_GAP, pts[i+1].x-CURVE_MIN_GAP);
  pts[i].y = clamp(Math.round(y), 0, 255);
  updateToneCurve();
});
function endCurveDrag() { if (curveDragging !== null) { pushHistory(); curveDragging = null; } }
curveCanvas.addEventListener('mouseup', endCurveDrag);
curveCanvas.addEventListener('mouseleave', endCurveDrag);
curveCanvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const { x, y } = getCurvePos(e);
  const idx = nearestCurvePoint(x, y);
  if (idx > 0 && idx < toneCurvePoints.length - 1) { toneCurvePoints.splice(idx, 1); updateToneCurve(); pushHistory(); }
});

// ================================================================
// グラデーションマップ
// ================================================================
const GRAD_HIT_R = 10;

let gradientMapStops = [{ pos: 0, r: 0, g: 0, b: 0 }, { pos: 255, r: 255, g: 255, b: 255 }];
let gradientMapLUT   = null;
let selectedGradStop = null;
let draggingGradIdx  = null;
let gradDragged      = false;   // 現在ドラッグ中
let gradWasDragged   = false;   // click イベント時にドラッグだったか判定用
let gradDragStartX   = 0;

const GRADIENT_PRESETS = {
  sepia  : [{ pos:0,r:112,g:66,b:20 },{ pos:255,r:235,g:210,b:150 }],
  warm   : [{ pos:0,r:20,g:5,b:0 },{ pos:128,r:200,g:80,b:15 },{ pos:255,r:255,g:235,b:180 }],
  cool   : [{ pos:0,r:0,g:10,b:30 },{ pos:128,r:30,g:80,b:180 },{ pos:255,r:190,g:215,b:255 }],
  sunset : [{ pos:0,r:15,g:0,b:40 },{ pos:85,r:180,g:30,b:60 },{ pos:175,r:240,g:150,b:20 },{ pos:255,r:255,g:230,b:160 }],
  duotone: [{ pos:0,r:30,g:50,b:160 },{ pos:255,r:230,g:210,b:20 }],
};

function buildGradientMapLUT(stops) {
  const ss = [...stops].sort((a, b) => a.pos - b.pos);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    if (!ss.length) { lut[i*3] = lut[i*3+1] = lut[i*3+2] = i; continue; }
    if (i <= ss[0].pos)             { lut[i*3] = ss[0].r; lut[i*3+1] = ss[0].g; lut[i*3+2] = ss[0].b; continue; }
    const last = ss[ss.length - 1];
    if (i >= last.pos)              { lut[i*3] = last.r;  lut[i*3+1] = last.g;  lut[i*3+2] = last.b;  continue; }
    let j = 0;
    while (j < ss.length-2 && i >= ss[j+1].pos) j++;
    const L = ss[j], R = ss[j+1], t = (R.pos === L.pos) ? 0 : (i - L.pos) / (R.pos - L.pos);
    lut[i*3]   = Math.round(L.r + (R.r - L.r) * t);
    lut[i*3+1] = Math.round(L.g + (R.g - L.g) * t);
    lut[i*3+2] = Math.round(L.b + (R.b - L.b) * t);
  }
  return lut;
}

function updateGradientMap() {
  gradientMapLUT = buildGradientMapLUT(gradientMapStops);
  if (glSupported) uploadGradMapTexture();
  drawGradMapUI();
  applyEffects();
}

function drawGradMapUI() {
  const W = 256, H = 40;
  gmCtx.clearRect(0, 0, W, H);
  const sorted = [...gradientMapStops].sort((a, b) => a.pos - b.pos);
  if (sorted.length) {
    const grad = gmCtx.createLinearGradient(0, 0, W, 0);
    sorted.forEach(s => grad.addColorStop(s.pos / 255, `rgb(${s.r},${s.g},${s.b})`));
    gmCtx.fillStyle = grad;
    gmCtx.fillRect(0, 0, W, H);
  }
  gradientMapStops.forEach((s, i) => {
    const x = s.pos, y = H / 2, sel = i === selectedGradStop;
    gmCtx.beginPath(); gmCtx.arc(x, y, 7, 0, Math.PI*2);
    gmCtx.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.65)'; gmCtx.fill();
    gmCtx.strokeStyle = '#000'; gmCtx.lineWidth = 1; gmCtx.stroke();
    gmCtx.beginPath(); gmCtx.arc(x, y, 5, 0, Math.PI*2);
    gmCtx.fillStyle = `rgb(${s.r},${s.g},${s.b})`; gmCtx.fill();
    gmCtx.strokeStyle = sel ? '#fff' : '#555'; gmCtx.lineWidth = 1; gmCtx.stroke();
  });
  syncGradPicker();
}

function getGradMapX(e) {
  const r = gradMapCanvas.getBoundingClientRect();
  return clamp(Math.round((e.clientX - r.left) * (256 / r.width)), 0, 255);
}

function nearestGradStop(x) {
  let idx = -1, best = GRAD_HIT_R;
  gradientMapStops.forEach((s, i) => { const d = Math.abs(s.pos - x); if (d < best) { best = d; idx = i; } });
  return idx;
}

const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

// 選択中の点の色を、常に画面内に表示されているカラー入力欄へ反映する
function syncGradPicker() {
  const st = selectedGradStop !== null ? gradientMapStops[selectedGradStop] : null;
  colorPicker.disabled = !st;
  if (!st) return;
  const hex = rgbToHex(st.r, st.g, st.b);
  if (colorPicker.value !== hex) colorPicker.value = hex;
}

// ピッカーは入力欄の位置に開く（入力欄は画面内に表示されている必要がある）
function openGradColorPicker() {
  if (selectedGradStop === null) return;
  syncGradPicker();
  try { colorPicker.showPicker(); } catch (_) { colorPicker.click(); }
}

colorPicker.addEventListener('input', () => {
  if (selectedGradStop === null) return;
  const h = colorPicker.value;
  const s = gradientMapStops[selectedGradStop];
  s.r = parseInt(h.slice(1,3),16); s.g = parseInt(h.slice(3,5),16); s.b = parseInt(h.slice(5,7),16);
  updateGradientMap();
});
colorPicker.addEventListener('change', pushHistory);

gradMapCanvas.addEventListener('mousedown', e => {
  const x = getGradMapX(e);
  const idx = nearestGradStop(x);
  gradDragged = false; gradWasDragged = false; gradDragStartX = x;
  // mousedown では「ドラッグ開始の準備」だけ行う
  // 点の追加・カラーピッカーは click イベントで処理する（信頼済みイベントコンテキストが必要）
  if (idx !== -1) {
    selectedGradStop = idx; draggingGradIdx = idx;
    drawGradMapUI();
  } else {
    draggingGradIdx = null; // 空エリアへのドラッグは無視
  }
});

gradMapCanvas.addEventListener('mousemove', e => {
  if (draggingGradIdx === null) return;
  const x = getGradMapX(e);
  if (!gradDragged && Math.abs(x - gradDragStartX) > 3) {
    gradDragged = true; gradWasDragged = true;
  }
  if (!gradDragged) return;
  const stops = gradientMapStops, i = draggingGradIdx;
  const lo = i > 0               ? stops[i-1].pos + 1 : 0;
  const hi = i < stops.length-1  ? stops[i+1].pos - 1 : 255;
  stops[i].pos = clamp(x, lo, hi);
  updateGradientMap();
});

gradMapCanvas.addEventListener('mouseup', () => {
  if (draggingGradIdx !== null && gradDragged) pushHistory();
  draggingGradIdx = null;
  gradDragged = false;
});
gradMapCanvas.addEventListener('mouseleave', () => {
  if (draggingGradIdx !== null && gradDragged) pushHistory();
  draggingGradIdx = null;
  gradDragged = false;
});

// ★ click イベントは「信頼済みのユーザー操作」として扱われるため
//    showPicker() / click() がここから呼ぶと確実に動作する
gradMapCanvas.addEventListener('click', e => {
  if (gradWasDragged) { gradWasDragged = false; return; } // ドラッグ後のクリックは無視
  gradWasDragged = false;

  const x = getGradMapX(e);
  const idx = nearestGradStop(x);

  if (idx !== -1) {
    // 既存の点をクリック → カラーピッカーを開く
    selectedGradStop = idx;
    drawGradMapUI();
    openGradColorPicker();
  } else {
    // 空の場所をクリック → 新しい点を追加してカラーピッカーを開く
    const ci = clamp(x, 0, 255);
    const lut = gradientMapLUT;
    const r = lut ? lut[ci*3] : ci, g = lut ? lut[ci*3+1] : ci, b = lut ? lut[ci*3+2] : ci;
    gradientMapStops.push({ pos: x, r, g, b });
    gradientMapStops.sort((a, bv) => a.pos - bv.pos);
    selectedGradStop = gradientMapStops.findIndex(s => s.pos === x);
    updateGradientMap();
    openGradColorPicker();
  }
});

gradMapCanvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const idx = nearestGradStop(getGradMapX(e));
  if (idx !== -1 && gradientMapStops.length > 2) {
    gradientMapStops.splice(idx, 1);
    selectedGradStop = null;
    updateGradientMap(); pushHistory();
  }
});

gradMapPresetSel.addEventListener('change', () => {
  const val = gradMapPresetSel.value;
  if (!val) return;
  const preset = GRADIENT_PRESETS[val];
  if (preset) {
    gradientMapStops = preset.map(s => ({ ...s }));
    params.gradMapOpacity = 100;
    gradMapOpacitySlider.value = 100; gradMapOpacityNumber.value = 100;
    selectedGradStop = null;
    updateGradientMap(); pushHistory();
  }
  gradMapPresetSel.value = '';
});

// ================================================================
// ガウスぼかし（CPU用ヘルパー）— 横→縦の分離フィルター
//   σ = 半径(px)。カーネルは ±ceil(3σ)（最大60）、端は最も近い画素で延長
//   GPU版と同じく、横パスの結果を8bitに丸めてから縦パスへ渡す
// ================================================================
const BLUR_MAX_TAPS = 60;

function gaussianBlurImageData(src, w, h, sigma) {
  const R  = Math.min(BLUR_MAX_TAPS, Math.ceil(3 * sigma));
  const wt = new Float64Array(R + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) {
    const v = Math.exp(-0.5 * i * i / (sigma * sigma));
    if (i >= 0) wt[i] = v;
    sum += v;
  }
  for (let i = 0; i <= R; i++) wt[i] /= sum;

  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);

  // 横
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -R; k <= R; k++) {
        const xx = Math.min(Math.max(x + k, 0), w - 1);
        const j = (y * w + xx) * 4, wk = wt[k < 0 ? -k : k];
        r += src[j] * wk; g += src[j+1] * wk; b += src[j+2] * wk;
      }
      const i = (y * w + x) * 4;
      tmp[i] = r; tmp[i+1] = g; tmp[i+2] = b; tmp[i+3] = src[i+3];
    }
  }
  // 縦
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -R; k <= R; k++) {
        const yy = Math.min(Math.max(y + k, 0), h - 1);
        const j = (yy * w + x) * 4, wk = wt[k < 0 ? -k : k];
        r += tmp[j] * wk; g += tmp[j+1] * wk; b += tmp[j+2] * wk;
      }
      const i = (y * w + x) * 4;
      out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = tmp[i+3];
    }
  }
  return out;
}

// ================================================================
// 色収差（CPU用ヘルパー）
//   R を (+dx,+dy)、B を (-dx,-dy) ずらし、G はそのまま
// ================================================================
function aberrateImageData(src, w, h, dx, dy) {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    const ry = clamp(y - dy, 0, h - 1), by = clamp(y + dy, 0, h - 1);
    for (let x = 0; x < w; x++) {
      const i  = (y * w + x) * 4;
      const rx = clamp(x - dx, 0, w - 1), bx = clamp(x + dx, 0, w - 1);
      out[i]     = src[(ry * w + rx) * 4];
      out[i + 1] = src[i + 1];
      out[i + 2] = src[(by * w + bx) * 4 + 2];
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}

// ================================================================
// 線画抽出（CPU用ヘルパー）
//   調整後の画像の輝度に Sobel フィルターをかけ、輪郭を白地に黒線で出す
//   proc: 調整後の RGB（Float32, 0〜255）/ data: 出力先 RGBA
// ================================================================
function applyLineArt(proc, data, w, h) {
  const amount = params.lineArtAmount / 100;
  const gain   = 1 + params.lineArtSens / 100 * 9;
  const e0     = params.lineArtThresh / 100 * 1.5;
  const e1     = e0 + 0.4;

  const lum = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) {
    lum[k] = (0.299 * proc[k*3] + 0.587 * proc[k*3+1] + 0.114 * proc[k*3+2]) / 255;
  }

  for (let y = 0; y < h; y++) {
    const yt = Math.max(y - 1, 0) * w, yc = y * w, yb = Math.min(y + 1, h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xl = Math.max(x - 1, 0), xr = Math.min(x + 1, w - 1);
      const gx = (lum[yt+xr] + 2*lum[yc+xr] + lum[yb+xr]) - (lum[yt+xl] + 2*lum[yc+xl] + lum[yb+xl]);
      const gy = (lum[yt+xl] + 2*lum[yt+x]  + lum[yt+xr]) - (lum[yb+xl] + 2*lum[yb+x]  + lum[yb+xr]);
      const mag = Math.sqrt(gx * gx + gy * gy) / 4;

      const t    = clamp((mag * gain - e0) / (e1 - e0), 0, 1);
      const line = t * t * (3 - 2 * t);          // smoothstep
      const v    = (1 - line) * 255;             // 白地に黒線

      const k = yc + x, i = k * 4;
      data[i]   = proc[k*3]   + (v - proc[k*3])   * amount;
      data[i+1] = proc[k*3+1] + (v - proc[k*3+1]) * amount;
      data[i+2] = proc[k*3+2] + (v - proc[k*3+2]) * amount;
    }
  }
}

// ================================================================
// シャープネス（CPU用ヘルパー） — アンシャープマスク
// ================================================================
function sharpenImageData(src, w, h, amount) {
  const factor = (amount / 100) * 3.0;
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const c  = src[i + ch];
        const l  = x > 0   ? src[i - 4 + ch]                 : c;
        const r  = x < w-1 ? src[i + 4 + ch]                 : c;
        const u  = y > 0   ? src[((y-1)*w + x)*4 + ch]       : c;
        const dn = y < h-1 ? src[((y+1)*w + x)*4 + ch]       : c;
        out[i + ch] = clamp255(c + (c - (l+r+u+dn)*0.25) * factor);
      }
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}

// ================================================================
// CPU 描画パイプライン
// ================================================================
function levelAdjust(v, black, white, gamma) {
  const w = Math.max(white, black + 1);
  return Math.pow(clamp((v - black) / (w - black), 0, 1), 1 / gamma) * 255;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g-b)/d) % 6;
    else if (max === g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h /= 6; if (h < 0) h += 1;
  }
  return [h, s, v];
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h*6), f = h*6-i;
  const p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
  const cases = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
  const [r,g,b] = cases[i % 6];
  return [r*255, g*255, b*255];
}

function applyEffectsCPU() {
  if (!originalImageData) return;
  const src = originalImageData.data, w = originalImageData.width, h = originalImageData.height;

  // 前処理: ぼかし → 色収差 → シャープネス（GPU版と同じ順序）
  let base = src;
  if (params.blur > 0)                      base = gaussianBlurImageData(base, w, h, params.blur);
  if (params.caX !== 0 || params.caY !== 0) base = aberrateImageData(base, w, h, params.caX, params.caY);
  if (params.sharpness > 0)                 base = sharpenImageData(base, w, h, params.sharpness);

  const imageData = new ImageData(new Uint8ClampedArray(src), w, h);
  const data = imageData.data;

  const bright = params.brightness;
  const cf     = (params.contrast + 100) / 100;
  const sat    = params.saturation / 100;
  const black  = params.levelBlack, white = params.levelWhite, gamma = params.levelMid;
  const gmOp   = params.gradMapOpacity / 100;
  const proc = params.lineArtAmount > 0 ? new Float32Array(w * h * 3) : null;  // 線画抽出用の中間バッファ

  for (let i = 0; i < data.length; i += 4) {
    let r = base[i];
    let g = base[i+1];
    let b = base[i+2];

    r += bright; g += bright; b += bright;
    r = (r-128)*cf+128; g = (g-128)*cf+128; b = (b-128)*cf+128;
    r = clamp255(r); g = clamp255(g); b = clamp255(b);

    r = levelAdjust(r, black, white, gamma);
    g = levelAdjust(g, black, white, gamma);
    b = levelAdjust(b, black, white, gamma);

    r = toneCurveLUT[Math.round(clamp255(r))];
    g = toneCurveLUT[Math.round(clamp255(g))];
    b = toneCurveLUT[Math.round(clamp255(b))];

    if (params.hue !== 0) {
      let [hh, ss, vv] = rgbToHsv(r, g, b);
      hh = ((hh + params.hue/360) % 1 + 1) % 1;
      [r, g, b] = hsvToRgb(hh, ss, vv);
    }

    if (hueBandsActive) {                       // 色相別補正（色相ごとの色相シフトと彩度。明るさ(輝度)は保つ）
      const l0 = 0.299*r + 0.587*g + 0.114*b;
      const hv = rgbToHsv(r, g, b);
      const bi = Math.min(255, Math.floor(hv[0] * 256));
      const nh = ((hv[0] + hueShiftDeg[bi] / 360) % 1 + 1) % 1;
      const ns = clamp(hv[1] * hueSatScale[bi], 0, 1);
      const nc = hsvToRgb(nh, ns, hv[2]);
      const l1 = 0.299*nc[0] + 0.587*nc[1] + 0.114*nc[2];
      const kk = Math.min(4, l0 / Math.max(l1, 1e-3));
      r = nc[0] * kk; g = nc[1] * kk; b = nc[2] * kk;
    }

    const gray = 0.299*r + 0.587*g + 0.114*b;
    r = gray + (r-gray)*(1+sat);
    g = gray + (g-gray)*(1+sat);
    b = gray + (b-gray)*(1+sat);
    r = clamp255(r); g = clamp255(g); b = clamp255(b);   // GPU版と同じく、彩度の後でいったん丸める

    if (gmOp > 0 && gradientMapLUT) {
      const lum = Math.round(clamp255(0.299*r + 0.587*g + 0.114*b));
      r += (gradientMapLUT[lum*3]   - r) * gmOp;
      g += (gradientMapLUT[lum*3+1] - g) * gmOp;
      b += (gradientMapLUT[lum*3+2] - b) * gmOp;
    }

    r = clamp255(r); g = clamp255(g); b = clamp255(b);
    if (proc) { const j = (i >> 2) * 3; proc[j] = r; proc[j+1] = g; proc[j+2] = b; }
    else      { data[i] = r; data[i+1] = g; data[i+2] = b; }
  }
  if (proc) applyLineArt(proc, data, w, h);
  ctx.putImageData(imageData, 0, 0);
}

// ================================================================
// GPU (WebGL) パイプライン
// ================================================================
let gl = null, glProgram = null, glUniforms = null;
let glImageTexture = null, glLutTexture = null, glGradMapTexture = null;
let glBlurProgram = null, glBlurU = null, glBlurA = null, glBlurB = null;
let glBlurKey = '', glImageVersion = 0;   // ぼかし結果のキャッシュ用
let glHueTexture = null;                  // 色相別補正のLUT（256×1）
let glSupported = false;

const VERT = `
attribute vec2 aPos; attribute vec2 aUV; varying vec2 vUV;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aUV; }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;
uniform sampler2D uImage, uLut, uGradMap, uHueLut;
uniform vec2  uTexelSize;
uniform float uBrightness, uContrast, uSaturation, uHue;
uniform float uLevelBlack, uLevelWhite, uLevelGamma;
uniform float uSharpness, uGradMapOpacity, uHueBands;
uniform vec2  uCA;   // 色収差 (横px, 縦px)
uniform float uLineAmount, uLineSens, uLineThresh;   // 線画抽出

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
  vec4 p = mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q = mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d = q.x - min(q.w,q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-10)), d/(q.x+1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0);
  return c.z * mix(K.xxx, clamp(abs(fract(c.xxx+K.xyz)*6.0-K.www)-K.xxx, 0.0, 1.0), c.y);
}

float lutSample(sampler2D tex, float v) {
  return texture2D(tex, vec2((v + 0.5) / 256.0, 0.5)).r * 255.0;
}

// 色収差つきでソース画像を読む（R は (+dx,+dy)、B は (-dx,-dy) ずらす。画像の縦方向は UV と逆）
vec3 fetchSrc(vec2 uv) {
  vec2 o = vec2(-uCA.x * uTexelSize.x, uCA.y * uTexelSize.y);
  float r = texture2D(uImage, uv + o).r;
  float g = texture2D(uImage, uv).g;
  float b = texture2D(uImage, uv - o).b;
  return vec3(r, g, b);
}

// 色調補正までの全処理（uv の位置のピクセルを 0〜255 で返す）
vec3 pipeline(vec2 uv) {
  // シャープネス（アンシャープマスク）
  vec3 c = fetchSrc(uv);
  if (uSharpness > 0.0) {
    vec3 blur = (
      fetchSrc(uv + vec2(-uTexelSize.x, 0.0)) +
      fetchSrc(uv + vec2( uTexelSize.x, 0.0)) +
      fetchSrc(uv + vec2(0.0,-uTexelSize.y)) +
      fetchSrc(uv + vec2(0.0, uTexelSize.y))
    ) * 0.25;
    c = clamp(c + (c - blur) * (uSharpness / 100.0 * 3.0), 0.0, 1.0);
  }
  vec3 px = c * 255.0;

  // 明るさ
  px += uBrightness;

  // コントラスト
  px = (px - 128.0) * ((uContrast + 100.0) / 100.0) + 128.0;
  px = clamp(px, 0.0, 255.0);

  // レベル補正
  float blk = uLevelBlack, wht = max(uLevelWhite, blk + 1.0);
  px = pow(clamp((px - blk) / (wht - blk), 0.0, 1.0), vec3(1.0 / uLevelGamma)) * 255.0;

  // トーンカーブ
  px.r = lutSample(uLut, clamp(px.r, 0.0, 255.0));
  px.g = lutSample(uLut, clamp(px.g, 0.0, 255.0));
  px.b = lutSample(uLut, clamp(px.b, 0.0, 255.0));

  // 色相
  vec3 hsv = rgb2hsv(px / 255.0);
  hsv.x = fract(hsv.x + uHue / 360.0);
  px = hsv2rgb(hsv) * 255.0;

  // 色相別補正（色相ごとの色相シフトと彩度。LUT は 色相256段 × (R=シフト, G=彩度倍率)。輝度は保つ）
  if (uHueBands > 0.5) {
    float l0 = dot(px, vec3(0.299, 0.587, 0.114));
    vec3 hv = rgb2hsv(px / 255.0);
    vec4 hl = texture2D(uHueLut, vec2((floor(hv.x * 256.0) + 0.5) / 256.0, 0.5));
    float shiftDeg = (hl.r * 255.0 - 127.0) / 127.0 * 180.0;
    float satScale = hl.g * 255.0 / 127.0;
    hv.x = fract(hv.x + shiftDeg / 360.0);
    hv.y = clamp(hv.y * satScale, 0.0, 1.0);
    px = hsv2rgb(hv) * 255.0;
    float l1 = dot(px, vec3(0.299, 0.587, 0.114));
    px *= min(4.0, l0 / max(l1, 1e-3));          // 明るさ(輝度)を保つ
  }

  // 彩度
  float gray = dot(px, vec3(0.299, 0.587, 0.114));
  px = gray + (px - gray) * (1.0 + uSaturation / 100.0);
  px = clamp(px, 0.0, 255.0);

  // グラデーションマップ
  if (uGradMapOpacity > 0.0) {
    float lum = dot(px / 255.0, vec3(0.299, 0.587, 0.114));
    vec3 gc = texture2D(uGradMap, vec2((clamp(lum,0.0,1.0)*255.0 + 0.5)/256.0, 0.5)).rgb * 255.0;
    px = mix(px, gc, uGradMapOpacity / 100.0);
    px = clamp(px, 0.0, 255.0);
  }

  return px;
}

float lum01(vec3 p) { return dot(p, vec3(0.299, 0.587, 0.114)) / 255.0; }

void main() {
  vec3 px = pipeline(vUV);

  // 線画抽出（調整後の画像に Sobel → 白地に黒線）
  if (uLineAmount > 0.0) {
    vec2 t = uTexelSize;
    float lTL = lum01(pipeline(vUV + vec2(-t.x,  t.y)));
    float lT  = lum01(pipeline(vUV + vec2( 0.0,  t.y)));
    float lTR = lum01(pipeline(vUV + vec2( t.x,  t.y)));
    float lL  = lum01(pipeline(vUV + vec2(-t.x,  0.0)));
    float lR  = lum01(pipeline(vUV + vec2( t.x,  0.0)));
    float lBL = lum01(pipeline(vUV + vec2(-t.x, -t.y)));
    float lB  = lum01(pipeline(vUV + vec2( 0.0, -t.y)));
    float lBR = lum01(pipeline(vUV + vec2( t.x, -t.y)));
    float gx  = (lTR + 2.0 * lR + lBR) - (lTL + 2.0 * lL + lBL);
    float gy  = (lTL + 2.0 * lT + lTR) - (lBL + 2.0 * lB + lBR);
    float mag = sqrt(gx * gx + gy * gy) / 4.0;
    float e0  = uLineThresh / 100.0 * 1.5;
    float ln  = smoothstep(e0, e0 + 0.4, mag * (1.0 + uLineSens / 100.0 * 9.0));
    px = mix(px, vec3((1.0 - ln) * 255.0), uLineAmount / 100.0);
  }

  gl_FragColor = vec4(px / 255.0, 1.0);
}`;

// ガウスぼかし（1方向ぶん。横→縦の2回で使う）
const BLUR_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;
uniform sampler2D uTex;
uniform vec2  uDir;     // 1テクセル分の方向ベクトル
uniform float uSigma;

void main() {
  float R = min(ceil(3.0 * uSigma), ${BLUR_MAX_TAPS}.0);
  vec3  sum  = vec3(0.0);
  float wsum = 0.0;
  for (int i = -${BLUR_MAX_TAPS}; i <= ${BLUR_MAX_TAPS}; i++) {
    float fi = float(i);
    if (abs(fi) > R) continue;
    float w = exp(-0.5 * fi * fi / (uSigma * uSigma));
    sum  += texture2D(uTex, vUV + uDir * fi).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}`;

function makeShader(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null; }
  return sh;
}

function makeTex(filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  return tex;
}

function initGL() {
  gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true })
    || glCanvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
  if (!gl) return false;

  const vs = makeShader(gl.VERTEX_SHADER, VERT);
  const fs = makeShader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return false;

  glProgram = gl.createProgram();
  gl.attachShader(glProgram, vs); gl.attachShader(glProgram, fs);
  gl.bindAttribLocation(glProgram, 0, 'aPos');
  gl.bindAttribLocation(glProgram, 1, 'aUV');
  gl.linkProgram(glProgram);
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(glProgram)); return false; }
  gl.useProgram(glProgram);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const pos = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  const uv  = new Float32Array([ 0, 0, 1, 0,  0,1, 1,1]);

  const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(glProgram, 'aPos'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

  const ub = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ub); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const au = gl.getAttribLocation(glProgram, 'aUV'); gl.enableVertexAttribArray(au); gl.vertexAttribPointer(au, 2, gl.FLOAT, false, 0, 0);

  glImageTexture   = makeTex(gl.LINEAR);
  glLutTexture     = makeTex(gl.NEAREST);
  glGradMapTexture = makeTex(gl.LINEAR);
  glHueTexture     = makeTex(gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([127, 127, 0, 255]));

  glUniforms = {
    uImage:          gl.getUniformLocation(glProgram, 'uImage'),
    uLut:            gl.getUniformLocation(glProgram, 'uLut'),
    uGradMap:        gl.getUniformLocation(glProgram, 'uGradMap'),
    uTexelSize:      gl.getUniformLocation(glProgram, 'uTexelSize'),
    uBrightness:     gl.getUniformLocation(glProgram, 'uBrightness'),
    uContrast:       gl.getUniformLocation(glProgram, 'uContrast'),
    uSaturation:     gl.getUniformLocation(glProgram, 'uSaturation'),
    uHue:            gl.getUniformLocation(glProgram, 'uHue'),
    uLevelBlack:     gl.getUniformLocation(glProgram, 'uLevelBlack'),
    uLevelWhite:     gl.getUniformLocation(glProgram, 'uLevelWhite'),
    uLevelGamma:     gl.getUniformLocation(glProgram, 'uLevelGamma'),
    uSharpness:      gl.getUniformLocation(glProgram, 'uSharpness'),
    uGradMapOpacity: gl.getUniformLocation(glProgram, 'uGradMapOpacity'),
    uHueLut:         gl.getUniformLocation(glProgram, 'uHueLut'),
    uHueBands:       gl.getUniformLocation(glProgram, 'uHueBands'),
    uLineAmount:     gl.getUniformLocation(glProgram, 'uLineAmount'),
    uLineSens:       gl.getUniformLocation(glProgram, 'uLineSens'),
    uLineThresh:     gl.getUniformLocation(glProgram, 'uLineThresh'),
    uCA:             gl.getUniformLocation(glProgram, 'uCA'),
  };

  // ガウスぼかし用プログラム
  const bfs = makeShader(gl.FRAGMENT_SHADER, BLUR_FRAG);
  if (!bfs) return false;
  glBlurProgram = gl.createProgram();
  gl.attachShader(glBlurProgram, vs); gl.attachShader(glBlurProgram, bfs);
  gl.bindAttribLocation(glBlurProgram, 0, 'aPos');
  gl.bindAttribLocation(glBlurProgram, 1, 'aUV');
  gl.linkProgram(glBlurProgram);
  if (!gl.getProgramParameter(glBlurProgram, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(glBlurProgram)); return false; }
  glBlurU = {
    uTex:   gl.getUniformLocation(glBlurProgram, 'uTex'),
    uDir:   gl.getUniformLocation(glBlurProgram, 'uDir'),
    uSigma: gl.getUniformLocation(glBlurProgram, 'uSigma'),
  };
  gl.useProgram(glProgram);
  glMaxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
                       ...Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)));
  return true;
}

// ぼかしの中間バッファ（フレームバッファ + テクスチャ）
function createBlurTarget(w, h) {
  const tex = makeTex(gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
}

function resizeBlurTargets(w, h) {
  [glBlurA, glBlurB].forEach(t => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } });
  glBlurA = createBlurTarget(w, h);
  glBlurB = createBlurTarget(w, h);
  glBlurKey = '';
}

// 原画像 →(横)→ A →(縦)→ B。半径・画像が同じならキャッシュを使う
function runBlurPasses() {
  const key = params.blur + ':' + glImageVersion;
  if (key === glBlurKey) return;
  const w = glCanvas.width, h = glCanvas.height;

  gl.useProgram(glBlurProgram);
  gl.viewport(0, 0, w, h);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(glBlurU.uTex, 0);
  gl.uniform1f(glBlurU.uSigma, params.blur);

  gl.bindFramebuffer(gl.FRAMEBUFFER, glBlurA.fbo);
  gl.bindTexture(gl.TEXTURE_2D, glImageTexture);
  gl.uniform2f(glBlurU.uDir, 1 / w, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, glBlurB.fbo);
  gl.bindTexture(gl.TEXTURE_2D, glBlurA.tex);
  gl.uniform2f(glBlurU.uDir, 0, 1 / h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  glBlurKey = key;
}

function uploadImageTexture() {
  glImageVersion++;
  gl.bindTexture(gl.TEXTURE_2D, glImageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

function uploadLutTexture() {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) { const v = toneCurveLUT[i]; data[i*4]=v; data[i*4+1]=v; data[i*4+2]=v; data[i*4+3]=255; }
  gl.bindTexture(gl.TEXTURE_2D, glLutTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

function uploadGradMapTexture() {
  if (!gl || !glGradMapTexture || !gradientMapLUT) return;
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) { data[i*4]=gradientMapLUT[i*3]; data[i*4+1]=gradientMapLUT[i*3+1]; data[i*4+2]=gradientMapLUT[i*3+2]; data[i*4+3]=255; }
  gl.bindTexture(gl.TEXTURE_2D, glGradMapTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

function renderGPU() {
  // ぼかしが有効なら、ぼかし済みテクスチャをソース画像として使う
  let srcTex = glImageTexture;
  if (params.blur > 0 && glBlurB) { runBlurPasses(); srcTex = glBlurB.tex; }

  gl.useProgram(glProgram);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);           gl.uniform1i(glUniforms.uImage,   0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glLutTexture);     gl.uniform1i(glUniforms.uLut,     1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, glGradMapTexture); gl.uniform1i(glUniforms.uGradMap, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, glHueTexture);     gl.uniform1i(glUniforms.uHueLut,   3);
  gl.uniform1f(glUniforms.uHueBands, hueBandsActive ? 1 : 0);

  gl.uniform2f(glUniforms.uTexelSize,      1.0 / glCanvas.width, 1.0 / glCanvas.height);
  gl.uniform1f(glUniforms.uBrightness,     params.brightness);
  gl.uniform1f(glUniforms.uContrast,       params.contrast);
  gl.uniform1f(glUniforms.uSaturation,     params.saturation);
  gl.uniform1f(glUniforms.uHue,            params.hue);
  gl.uniform1f(glUniforms.uLevelBlack,     params.levelBlack);
  gl.uniform1f(glUniforms.uLevelWhite,     params.levelWhite);
  gl.uniform1f(glUniforms.uLevelGamma,     params.levelMid);
  gl.uniform1f(glUniforms.uSharpness,      params.sharpness);
  gl.uniform1f(glUniforms.uGradMapOpacity, params.gradMapOpacity);
  gl.uniform2f(glUniforms.uCA,             params.caX, params.caY);
  gl.uniform1f(glUniforms.uLineAmount,     params.lineArtAmount);
  gl.uniform1f(glUniforms.uLineSens,       params.lineArtSens);
  gl.uniform1f(glUniforms.uLineThresh,     params.lineArtThresh);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ================================================================
// 処理方式・計測
// ================================================================
function measureCPU() { const t0 = performance.now(); applyEffectsCPU(); return performance.now() - t0; }
function measureGPU() { const t0 = performance.now(); renderGPU(); gl.finish(); return performance.now() - t0; }

const useGPU = () => renderMode === 'gpu' && glSupported && gpuImageOK;

// 画面の更新は 1フレームに1回にまとめる（大きな画像でスライダーを動かしても、描画が溜まって固まらないように）
let effectsQueued = false;
function applyEffects() {
  if (!originalImageData || effectsQueued) return;
  effectsQueued = true;
  requestAnimationFrame(() => { if (effectsQueued) { effectsQueued = false; renderNow(); } });
}
function flushEffects() { if (effectsQueued) { effectsQueued = false; renderNow(); } }   // 待たずに今すぐ描く

function renderNow() {
  if (!originalImageData) return;
  if (useGPU()) {
    canvas.classList.add('layer-hidden'); glCanvas.classList.remove('layer-hidden');
    gpuTimeValue.textContent = measureGPU().toFixed(2);
  } else {
    glCanvas.classList.add('layer-hidden'); canvas.classList.remove('layer-hidden');
    cpuTimeValue.textContent = measureCPU().toFixed(2);
  }
}

// 処理方式の補足メッセージ（WebGL非対応のメッセージは起動時に出しているので触らない）
function refreshModeNote() {
  if (!glSupported) return;
  if (!originalImageData) { gpuStatusNote.textContent = ''; return; }
  const w = originalImageData.width, h = originalImageData.height, mp = w * h / 1e6;
  if (!gpuImageOK)                       gpuStatusNote.textContent = '画像（' + w + '×' + h + '）がこのGPUの上限（' + glMaxSize + 'px）を超えるため、CPUで処理します。';
  else if (renderMode === 'cpu' && mp > 4) gpuStatusNote.textContent = 'この画像は ' + mp.toFixed(1) + ' 百万画素あり、CPU処理は時間がかかります。GPU処理がおすすめです。';
  else                                   gpuStatusNote.textContent = '';
}

modeGPURadio.addEventListener('change', () => { if (modeGPURadio.checked) { preferredMode = 'gpu'; renderMode = 'gpu'; refreshModeNote(); applyEffects(); } });
modeCPURadio.addEventListener('change', () => { if (modeCPURadio.checked) { preferredMode = 'cpu'; renderMode = 'cpu'; refreshModeNote(); applyEffects(); } });

benchmarkBtn.addEventListener('click', () => {
  if (!originalImageData) return;
  cpuTimeValue.textContent = measureCPU().toFixed(2);
  if (glSupported && gpuImageOK) { glBlurKey = ''; gpuTimeValue.textContent = measureGPU().toFixed(2); }
});

// ================================================================
// 共通: トーンカーブに入る直前の輝度（明度・コントラスト・レベル補正後）
// ================================================================
function makePreCurveLum() {
  const br = params.brightness, cf = (params.contrast + 100) / 100;
  const bk = params.levelBlack, wh = params.levelWhite, gm = params.levelMid;
  const lut = new Float32Array(256);          // 入力値(0〜255) → 明度・コントラスト・レベル補正後の値
  for (let v = 0; v < 256; v++) lut[v] = levelAdjust(clamp255((v + br - 128) * cf + 128), bk, wh, gm);
  return (r, g, b) => 0.299 * lut[r] + 0.587 * lut[g] + 0.114 * lut[b];
}

// ================================================================
// ペン調整（ターゲット調整ツール）
//   ペンの円の中にある明るさの「範囲」（5〜95%）を、まとめて動かす
//   サイズを大きくするほど円に含まれる明るさの幅が広がり、動くカーブの範囲も広がる
//   （小さい円で平らな場所を指せば、従来どおり1点だけが動く）
// ================================================================
const PEN_SNAP = 5;      // 既存の点がこの距離以内なら、新しい点は作らずその点を使う
const PEN_STEP = 32;     // 範囲が広いとき、この間隔ごとに点を置く（元のカーブの形を保つため）
let penActive   = false;
let penDiameter = 30;    // 画像ピクセル単位の直径
let penDrag     = null;
let penHover    = null;  // 最後にペンがあった位置 {ix, iy, scale}
let penMax      = 200;   // ペンサイズの最大値（画像が大きいほど大きくなる）
const OVERLAY_MAX = 2048;  // ペンの円を描く透明レイヤーの最大解像度（元画像が大きくても軽く保つ）

// 画像を読み込んだときに、オーバーレイの解像度とペンサイズを画像の大きさに合わせる
function setupPenForImage(w, h) {
  const k = Math.min(1, OVERLAY_MAX / Math.max(w, h));
  penOverlay.width = Math.max(1, Math.round(w * k)); penOverlay.height = Math.max(1, Math.round(h * k));
  const longSide = Math.max(w, h);
  penMax = Math.max(200, Math.round(longSide / 4));
  penSizeSlider.max = penMax; penSizeNumber.max = penMax;
  setPenSize(clamp(Math.round(longSide / 25), 1, penMax));        // 初期サイズは長辺の 1/25
}

function penImagePos(e) {
  const r = penOverlay.getBoundingClientRect();
  const sx = originalImageData.width / r.width;          // 画像ピクセル ÷ 画面ピクセル
  return { ix: (e.clientX - r.left) * sx, iy: (e.clientY - r.top) * (originalImageData.height / r.height), scale: sx };
}

// 円の内側の明るさ: 平均 c と、5%〜95% の範囲 [lo, hi]（すべて 0〜255）。画像の外なら null
function samplePen(cx, cy) {
  if (!originalImageData) return null;
  const { data, width: w, height: h } = originalImageData;
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
  const f   = makePreCurveLum();
  const rad = Math.max(0.5, penDiameter / 2), r2 = rad * rad;
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
  const hist = new Uint32Array(256);
  const stride = Math.max(1, Math.floor(rad / 60));      // 大きな円は間引いて調べる（統計なので結果はほぼ変わらない）
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * w + x) * 4;
      const L = f(data[i], data[i+1], data[i+2]);
      hist[Math.round(L)]++; sum += L; n++;
    }
  }
  if (n === 0) {   // 直径が極小で円の中にピクセル中心が入らない場合は、真下のピクセルだけを使う
    const i = (Math.floor(cy) * w + Math.floor(cx)) * 4;
    const L = f(data[i], data[i+1], data[i+2]);
    hist[Math.round(L)] = 1; sum = L; n = 1;
  }
  let acc = 0, lo = -1, hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (lo < 0 && acc >= n * 0.05) lo = v;
    if (acc >= n * 0.95) { hi = v; break; }
  }
  return { c: sum / n, lo: Math.max(0, lo), hi };
}

function drawPenRing(pos) {
  const c = penOverlay.getContext('2d');
  c.clearRect(0, 0, penOverlay.width, penOverlay.height);
  if (!pos || !originalImageData) return;
  const ov = penOverlay.width / originalImageData.width;      // 画像ピクセル → オーバーレイのピクセル
  const sp = pos.scale * ov;                                  // 画面1px あたりのオーバーレイのピクセル数
  const cx = pos.ix * ov, cy = pos.iy * ov, rad = Math.max(0.5, penDiameter / 2) * ov;
  const ring = (lw, col) => { c.lineWidth = lw * sp; c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.stroke(); };
  ring(3.2, 'rgba(0,0,0,0.55)'); ring(1.3, '#fff');
  const cross = (lw, col) => {
    const a = 4 * sp;
    c.lineWidth = lw * sp; c.strokeStyle = col; c.beginPath();
    c.moveTo(cx - a, cy); c.lineTo(cx + a, cy);
    c.moveTo(cx, cy - a); c.lineTo(cx, cy + a); c.stroke();
  };
  cross(3, 'rgba(0,0,0,0.55)'); cross(1, '#fff');
}

function nearestCurvePointByX(x, maxDist) {
  let idx = -1, best = maxDist + 1e-9;
  toneCurvePoints.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < best) { best = d; idx = i; } });
  return idx;
}

// 範囲 [lo, hi] を覆うカーブの点（なければ追加）と、範囲内にある既存の点を集める
function gatherPenGroup(info) {
  const lo = info.lo, hi = info.hi, span = hi - lo;
  let xs;
  if (span < 2 * PEN_SNAP) {
    xs = [clamp(Math.round(info.c), 0, 255)];               // 範囲が狭い → 1点
  } else {
    const n = Math.ceil(span / PEN_STEP);                   // 範囲が広い → 両端と途中に点を置く
    xs = [];
    for (let k = 0; k <= n; k++) xs.push(Math.round(lo + span * k / n));
  }
  const group = new Set();
  for (const x of xs) {
    let i = nearestCurvePointByX(x, PEN_SNAP);
    if (i === -1) {
      i = addCurvePoint(x, toneCurveLUT[x]);                // いまのカーブ上に点を追加
      if (i === -1) i = nearestCurvePointByX(x, 256);
    }
    group.add(toneCurvePoints[i]);
  }
  toneCurvePoints.forEach(p => { if (p.x >= lo && p.x <= hi) group.add(p); });   // 範囲内の既存の点もいっしょに動かす
  return [...group];
}

function updatePenReadout(info) {
  if (!info) { penReadout.textContent = '―'; return; }
  const c = clamp(Math.round(info.c), 0, 255);
  penReadout.textContent = '範囲 ' + info.lo + '〜' + info.hi + '（平均 ' + c + '）→ 出力 ' + toneCurveLUT[c];
}

function refreshPenHover() {
  const info = penHover ? samplePen(penHover.ix, penHover.iy) : null;
  drawPenRing(info ? penHover : null);
  curveGuide = info; drawCurveUI(); updatePenReadout(info);
}

function clearPenHover() {
  penHover = null; drawPenRing(null);
  curveGuide = null; drawCurveUI(); updatePenReadout(null);
}

function setPenActive(on) {
  penActive = on;
  penOverlay.classList.toggle('active', on);
  if (!on) { penDrag = null; clearPenHover(); }
}

function setPenSize(v) {
  penDiameter = clamp(Math.round(v) || 1, 1, penMax);
  penSizeSlider.value = penDiameter; penSizeNumber.value = penDiameter;
  if (!penDrag) refreshPenHover();
}

penToggle.addEventListener('change', () => setPenActive(penToggle.checked));
penSizeSlider.addEventListener('input', () => setPenSize(+penSizeSlider.value));
penSizeNumber.addEventListener('input', () => { if (penSizeNumber.value !== '') setPenSize(+penSizeNumber.value); });

penOverlay.addEventListener('pointerdown', (e) => {
  if (!penActive || e.button !== 0 || !originalImageData) return;
  const pos  = penImagePos(e);
  const info = samplePen(pos.ix, pos.iy);
  if (!info) return;

  const before = toneCurvePoints.length;
  const group  = gatherPenGroup(info);
  penDrag = { group, startYs: group.map(q => q.y), added: toneCurvePoints.length !== before, delta: 0, clientY0: e.clientY };
  penOverlay.setPointerCapture(e.pointerId);
  penHover = pos; drawPenRing(pos);
  curveGuide = info;
  if (penDrag.added) updateToneCurve(); else drawCurveUI();
  updatePenReadout(info);
  e.preventDefault();
});

penOverlay.addEventListener('pointermove', (e) => {
  if (!penActive || !originalImageData) return;
  if (penDrag) {
    // 上へドラッグ=明るく、下=暗く（Shiftで1/4の細かさ）。グループ全体を同じ量だけ動かす
    const k = e.shiftKey ? 0.25 : 1;
    const delta = clamp(Math.round((penDrag.clientY0 - e.clientY) * k), -255, 255);
    if (delta !== penDrag.delta) {
      penDrag.delta = delta;
      // 0〜255 の端に当たった点だけがそこで止まり、残りの点は動き続ける（並び順は変わらない）
      penDrag.group.forEach((q, i) => { q.y = clamp(penDrag.startYs[i] + delta, 0, 255); });
      updateToneCurve();
      updatePenReadout(curveGuide);
    }
    return;
  }
  penHover = penImagePos(e);
  refreshPenHover();
});

function endPenDrag() {
  if (!penDrag) return;
  const d = penDrag; penDrag = null;
  if (d.delta !== 0 || d.added) pushHistory();
}
penOverlay.addEventListener('pointerup', endPenDrag);
penOverlay.addEventListener('pointercancel', endPenDrag);
penOverlay.addEventListener('pointerleave', () => { if (!penDrag) clearPenHover(); });

// [ ] キーでペンサイズ変更
document.addEventListener('keydown', (e) => {
  if (!penActive || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text'))) return;
  if (e.code === 'BracketLeft'  || e.key === '[') setPenSize(penDiameter - (penDiameter > 20 ? 5 : 1));
  if (e.code === 'BracketRight' || e.key === ']') setPenSize(penDiameter + (penDiameter >= 20 ? 5 : 1));
});

// ================================================================
// 色相別補正（色相ごとの「色相のずれ」と「彩度」）
//   赤=0° から 30° おきの12本の帯をグラフで編集し、帯の間はなめらかに補間する
//   Hue vs Hue / Hue vs Sat と同じ考え方。処理は 256段のLUT にして CPU/GPU で共有する
// ================================================================
const HUE_BANDS = 12;
const newHueBands = () => ({ shift: new Array(HUE_BANDS).fill(0), sat: new Array(HUE_BANDS).fill(0) });
let hueBands = newHueBands();
const hueLutBytes = new Uint8Array(256 * 4);                  // R=シフト(127が0°)、G=彩度倍率(127が1.0倍)
const hueShiftDeg = new Float32Array(256), hueSatScale = new Float32Array(256);   // CPU用（上の8bit値を戻したもの）
let hueBandsActive = false;

// 帯の値を、色相 deg(度)で周期的に補間（コサイン補間）
function bandValueAt(arr, deg) {
  const idx = (((deg % 360) + 360) % 360) / 30;
  const k0 = Math.floor(idx) % HUE_BANDS, k1 = (k0 + 1) % HUE_BANDS, t = idx - Math.floor(idx);
  const w = (1 - Math.cos(Math.PI * t)) / 2;
  return arr[k0] + (arr[k1] - arr[k0]) * w;
}

function buildHueLut() {
  for (let i = 0; i < 256; i++) {
    const deg = (i + 0.5) / 256 * 360;
    const sb = clamp(Math.round(bandValueAt(hueBands.shift, deg) / 180 * 127) + 127, 0, 254);
    const tb = clamp(Math.round((1 + bandValueAt(hueBands.sat, deg) / 100) * 127), 0, 254);
    hueLutBytes[i*4] = sb; hueLutBytes[i*4+1] = tb; hueLutBytes[i*4+2] = 0; hueLutBytes[i*4+3] = 255;
    hueShiftDeg[i] = (sb - 127) / 127 * 180;
    hueSatScale[i] = tb / 127;
  }
  hueBandsActive = hueBands.shift.some(v => v !== 0) || hueBands.sat.some(v => v !== 0);
}

function uploadHueTexture() {
  gl.bindTexture(gl.TEXTURE_2D, glHueTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, hueLutBytes);
}

const hueGraphCanvas   = document.getElementById('hueGraph');
const satGraphCanvas   = document.getElementById('satGraph');
const hueBandsResetBtn = document.getElementById('hueBandsReset');
const BG_PAD = 10;
let bandDrag = null;      // ドラッグ中の帯 {key, k}

function drawBandGraph(canvas, key, min, max) {
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const arr = hueBands[key], plotH = H - 12;
  const yOf = v => 4 + (1 - (v - min) / (max - min)) * (plotH - 8);
  const xOf = k => BG_PAD + (W - 2 * BG_PAD) * k / HUE_BANDS;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#111'; c.fillRect(0, 0, W, H);

  const grad = c.createLinearGradient(BG_PAD, 0, W - BG_PAD, 0);          // 下の色相の帯
  for (let k = 0; k <= HUE_BANDS; k++) grad.addColorStop(k / HUE_BANDS, 'hsl(' + (k * 30) + ',85%,50%)');
  c.fillStyle = grad; c.fillRect(BG_PAD, H - 8, W - 2 * BG_PAD, 6);

  c.strokeStyle = '#555'; c.lineWidth = 1; c.setLineDash([3, 3]);        // 0 の線
  c.beginPath(); c.moveTo(0, yOf(0) + 0.5); c.lineTo(W, yOf(0) + 0.5); c.stroke(); c.setLineDash([]);

  c.strokeStyle = '#0f0'; c.lineWidth = 1.5; c.beginPath();
  for (let x = BG_PAD; x <= W - BG_PAD; x++) {
    const v = bandValueAt(arr, (x - BG_PAD) / (W - 2 * BG_PAD) * 360);
    if (x === BG_PAD) c.moveTo(x, yOf(v)); else c.lineTo(x, yOf(v));
  }
  c.stroke();

  for (let k = 0; k <= HUE_BANDS; k++) {                                  // 点（右端は左端の点の複製）
    c.beginPath(); c.arc(xOf(k), yOf(arr[k % HUE_BANDS]), 4, 0, Math.PI * 2);
    if (k === HUE_BANDS) { c.strokeStyle = '#f66'; c.lineWidth = 1; c.stroke(); }
    else { c.fillStyle = '#f00'; c.fill(); }
  }
  if (bandDrag && bandDrag.key === key) {
    const v = arr[bandDrag.k];
    c.fillStyle = '#ffdc00'; c.font = '11px sans-serif';
    c.fillText((v > 0 ? '+' : '') + v + (key === 'shift' ? '°' : '%'), 4, 12);
  }
}
function drawBandGraphs() {
  drawBandGraph(hueGraphCanvas, 'shift', -180, 180);
  drawBandGraph(satGraphCanvas, 'sat',   -100, 100);
}

// LUT・テクスチャ・グラフを更新（画像の再描画はしない）
function syncHueBands() {
  buildHueLut();
  if (glSupported) uploadHueTexture();
  drawBandGraphs();
}
function updateHueBands() { syncHueBands(); applyEffects(); }

function setupBandGraph(canvas, key, min, max) {
  const H = canvas.height, plotH = H - 12;
  const toX = (e) => { const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) * (canvas.width / r.width); };
  const toV = (e) => {
    const r = canvas.getBoundingClientRect(), y = (e.clientY - r.top) * (H / r.height);
    return clamp(Math.round(min + (1 - (y - 4) / (plotH - 8)) * (max - min)), min, max);
  };
  const nearestBand = (x) => {
    let best = 0, bd = 1e9;
    for (let k = 0; k <= HUE_BANDS; k++) { const d = Math.abs(x - (BG_PAD + (canvas.width - 2 * BG_PAD) * k / HUE_BANDS)); if (d < bd) { bd = d; best = k; } }
    return best % HUE_BANDS;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    bandDrag = { key, k: nearestBand(toX(e)) };
    canvas.setPointerCapture(e.pointerId);
    hueBands[key][bandDrag.k] = toV(e);
    updateHueBands();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!bandDrag || bandDrag.key !== key) return;
    hueBands[key][bandDrag.k] = toV(e);
    updateHueBands();
  });
  const end = () => { if (bandDrag && bandDrag.key === key) { bandDrag = null; drawBandGraphs(); pushHistory(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', (e) => {       // ダブルクリックでその帯を 0 に戻す
    hueBands[key][nearestBand(toX(e))] = 0;
    updateHueBands(); pushHistory();
  });
}
setupBandGraph(hueGraphCanvas, 'shift', -180, 180);
setupBandGraph(satGraphCanvas, 'sat',   -100, 100);
hueBandsResetBtn.addEventListener('click', () => { hueBands = newHueBands(); updateHueBands(); pushHistory(); });

// ================================================================
// スタイル転写
//   参照画像から次の3つを求め、すべて「あとから手で編集できる値」として設定する
//     階調 … 輝度ヒストグラムマッチング → トーンカーブ（7点）
//     色相 … 色相の分布を円周上でマッチング → 色相別補正（12本の帯の「色相のずれ」と「彩度」）
//     色味 … 明るさごとの平均色 → グラデーションマップ（7色）
//   輝度が同じで色相だけが違う画像でも、「色相」の項目で色が変わる
// ================================================================
const STYLE_XS = [0, 43, 85, 128, 170, 213, 255];
const statStride = (n) => Math.max(1, Math.floor(n / 1.5e6)) | 1;   // 画素数が多いときの間引き幅（奇数にして縞と重ならないように）
const styleHueSlider  = document.getElementById('styleHue');
const styleHueNumber  = document.getElementById('styleHueNumber');
let styleRef = null, styleRefId = 0;
let styleTone = 100, styleHue = 100, styleColor = 25;
let srcHistCache = { key: '', hist: null };
let srcHueCache  = { key: '', stats: null };
let styleCache   = null;

// 色相ごとの統計（色のある画素の面積で数える。弱い色は軽く）: w=重み合計, sw=重み×彩度の合計, n=色のある画素数
function hueStatsFromData(px, offsetDeg) {
  const w = new Float64Array(360), sw = new Float64Array(360);
  let n = 0, total = 0;
  const step = 4 * statStride(px.length / 4);
  for (let i = 0; i < px.length; i += step) {
    if (px[i+3] === 0) continue;
    total++;
    const r = px[i], g = px[i+1], b = px[i+2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, C = d / 255;
    if (C < 0.06) continue;                                  // ほぼ無彩色は色相を持たないので除く
    let h;
    if (mx === r)      h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else               h = (r - g) / d + 4;
    h = (((h * 60 + offsetDeg) % 360) + 360) % 360;
    const bin = Math.floor(h) % 360;
    const wt = Math.min(1, C / 0.2);                         // 彩度が十分ある画素は1、弱い画素は軽く数える
    w[bin] += wt; sw[bin] += wt * (d / mx); n++;
  }
  return { w, sw, n, total };
}

// 参照画像の統計: 輝度ごとの画素数・平均色の元になる合計、色相の統計
function analyzeReference(d, name) {
  const hist = new Float64Array(256), sr = new Float64Array(256), sg = new Float64Array(256), sb = new Float64Array(256);
  const px = d.data; let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i+3] === 0) continue;
    const l = Math.round(0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2]);
    hist[l]++; sr[l] += px[i]; sg[l] += px[i+1]; sb[l] += px[i+2]; total++;
  }
  return { id: ++styleRefId, name, hist, sr, sg, sb, total, hue: hueStatsFromData(px, 0) };
}

// 編集中の画像の、カーブに入る直前の輝度ヒストグラム
function computeSourceHist() {
  const key = [imageId, params.brightness, params.contrast, params.levelBlack, params.levelMid, params.levelWhite].join('|');
  if (srcHistCache.key === key) return srcHistCache;
  const f = makePreCurveLum(), d = originalImageData.data, hist = new Float64Array(256);
  const step = 4 * statStride(d.length / 4);
  for (let i = 0; i < d.length; i += step) {
    if (d[i+3] === 0) continue;
    hist[Math.round(clamp255(f(d[i], d[i+1], d[i+2])))]++;
  }
  srcHistCache = { key, hist };
  return srcHistCache;
}

// 編集中の画像の色相の統計（いまの「色相」スライダーで回した後の色相で数える）
function computeSourceHue() {
  const key = imageId + '|' + params.hue;
  if (srcHueCache.key === key) return srcHueCache.stats;
  srcHueCache = { key, stats: hueStatsFromData(originalImageData.data, params.hue) };
  return srcHueCache.stats;
}

function normalizedCdf(hist) {
  const sm = new Float64Array(256);
  for (let i = 0; i < 256; i++) {            // 前後2段の移動平均でなめらかにする
    let s = 0, c = 0;
    for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < 256) { s += hist[j]; c++; } }
    sm[i] = s / c;
  }
  let total = 0; for (let i = 0; i < 256; i++) total += sm[i];
  const cdf = new Float64Array(256); let acc = 0;
  for (let i = 0; i < 256; i++) { acc += sm[i]; cdf[i] = total > 0 ? acc / total : i / 255; }
  return cdf;
}

// ヒストグラムマッチング: 元の輝度 v を、累積分布が同じになる参照側の輝度に対応づける
function histogramMatch(srcHist, refHist) {
  const cs = normalizedCdf(srcHist), cr = normalizedCdf(refHist);
  const m = new Float64Array(256);
  let u = 0;
  for (let v = 0; v < 256; v++) {
    while (u < 255 && cr[u] < cs[v]) u++;
    if (u > 0 && cr[u] > cr[u-1]) m[v] = clamp((u - 1) + (cs[v] - cr[u-1]) / (cr[u] - cr[u-1]), 0, 255);
    else m[v] = u;
  }

  // 元画像に画素がある明るさの範囲(0.1%〜99.9%)の外側は、傾き1の直線で延長する。
  // 画素がない範囲を参照の端の値で平らにすると、カーブを通った各チャンネルがつぶれて色が崩れるため
  let total = 0; for (let v = 0; v < 256; v++) total += srcHist[v];
  let acc = 0, vlo = 0, vhi = 255;
  for (let v = 0; v < 256; v++) { acc += srcHist[v]; if (acc >= total * 0.001) { vlo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += srcHist[v]; if (acc >= total * 0.999) { vhi = v; break; } }
  for (let v = 0; v < vlo; v++)     m[v] = clamp(m[vlo] + (v - vlo), 0, 255);
  for (let v = vhi + 1; v < 256; v++) m[v] = clamp(m[vhi] + (v - vhi), 0, 255);
  return m;
}

// ---- 色相: 円周上のヒストグラムマッチング ----
const wrap180 = (d) => (((d + 180) % 360) + 360) % 360 - 180;

function circSmooth(arr, sigma) {                      // 周期的なガウス平滑化（360ビン）
  const R = Math.ceil(3 * sigma), ker = new Float64Array(R + 1);
  let ks = 0;
  for (let d = 0; d <= R; d++) { ker[d] = Math.exp(-d * d / (2 * sigma * sigma)); ks += d === 0 ? ker[d] : 2 * ker[d]; }
  const out = new Float64Array(360);
  for (let i = 0; i < 360; i++) {
    let v = 0;
    for (let d = -R; d <= R; d++) v += arr[(i + d + 360) % 360] * ker[Math.abs(d)];
    out[i] = v / ks;
  }
  return out;
}
function cumOf(p) {
  let t = 0; for (let i = 0; i < 360; i++) t += p[i];
  const cum = new Float64Array(360); let a = 0;
  for (let i = 0; i < 360; i++) { a += p[i]; cum[i] = a / t; }
  return cum;
}
function cdfAt(cum, deg) {                              // 0°からの累積（0〜1）
  const x = ((deg % 360) + 360) % 360, i = Math.min(359, Math.floor(x));
  const lo = i > 0 ? cum[i-1] : 0;
  return lo + (cum[i] - lo) * (x - i);
}
function quantileOf(cum, u) {                           // 累積が u になる色相（度）
  u = Math.max(u, 1e-9);
  let a = 0, b = 359;
  while (a < b) { const m = (a + b) >> 1; if (cum[m] >= u) b = m; else a = m + 1; }
  const lo = a > 0 ? cum[a-1] : 0, span = cum[a] - lo;
  return a + (span > 0 ? clamp((u - lo) / span, 0, 1) : 0);
}
function fillCircular(vals, valid) {                     // 値のない帯を、両隣の有効な帯から補う
  const n = vals.length;
  if (!valid.some(Boolean)) return vals.map(() => 0);
  return vals.map((v, k) => {
    if (valid[k]) return v;
    let a = 1; while (!valid[(k - a + n) % n]) a++;
    let b = 1; while (!valid[(k + b) % n]) b++;
    const va = vals[(k - a + n) % n], vb = vals[(k + b) % n];
    return va + (vb - va) * a / (a + b);
  });
}

// 元画像の色相分布を、参照画像の色相分布に写す「円周上の対応」を求め、12本の帯の値にする
// 返り値: { shift:[度×12], sat:[%×12] } / 色のある画素が少なければ null
function matchHueBands(S, R) {
  if (S.n < S.total * 0.005 || R.n < R.total * 0.005) return null;

  const pS = circSmooth(S.w, 5), pR = circSmooth(R.w, 5);
  const sumS = pS.reduce((a, b) => a + b, 0);
  const cumS = cumOf(pS), cumR = cumOf(pR);

  const swS = circSmooth(S.sw, 8), wwS = circSmooth(S.w, 8), swR = circSmooth(R.sw, 8), wwR = circSmooth(R.w, 8);
  const gS = S.sw.reduce((a, b) => a + b, 0) / Math.max(1e-9, S.w.reduce((a, b) => a + b, 0));
  const gR = R.sw.reduce((a, b) => a + b, 0) / Math.max(1e-9, R.w.reduce((a, b) => a + b, 0));
  const satS = (h) => wwS[h] > 1e-6 ? swS[h] / wwS[h] : gS;
  const satR = (deg) => { const h = Math.floor((((deg % 360) + 360) % 360)) % 360; return wwR[h] > 1e-6 ? swR[h] / wwR[h] : gR; };

  // 円周上は「どこを起点にするか」で対応が変わるので、参照側の起点を 5° ずつ変えて、
  // 色相のずれの二乗（分布の重み付き）がいちばん小さいものを選ぶ
  let best = null;
  const tArr = new Float64Array(360), dArr = new Float64Array(360);
  for (let th = 0; th < 360; th += 5) {
    const cth = cdfAt(cumR, th);
    let cost = 0;
    for (let h = 0; h < 360; h++) {
      let v = cdfAt(cumS, h + 0.5) + cth; if (v > 1) v -= 1;
      const t = quantileOf(cumR, v), d = wrap180(t - (h + 0.5));
      tArr[h] = t; dArr[h] = d; cost += (pS[h] / sumS) * d * d;
    }
    if (!best || cost < best.cost) best = { cost, t: tArr.slice(), d: dArr.slice() };
  }

  // 12本の帯: 帯の中心から ±30° の三角形の重みで、各色相の「ずれ」を平均する
  const shift = [], ratio = [], valid = [];
  for (let k = 0; k < HUE_BANDS; k++) {
    let den = 0, num = 0, numS = 0, numR = 0;
    for (let h = 0; h < 360; h++) {
      const wk = Math.max(0, 1 - Math.abs(wrap180(h + 0.5 - 30 * k)) / 30);
      if (wk === 0 || pS[h] === 0) continue;
      const m = wk * (pS[h] / sumS);
      den += m; num += m * best.d[h]; numS += m * satS(h); numR += m * satR(best.t[h]);
    }
    const ok = den > 0.002;
    valid.push(ok);
    shift.push(ok ? num / den : 0);
    ratio.push(ok && numS > 1e-6 ? clamp(numR / numS, 0.2, 2) : 1);
  }
  return {
    shift: fillCircular(shift, valid),
    sat:   fillCircular(ratio, valid).map(r => (r - 1) * 100),
  };
}

// 輝度ごとの参照色（輝度そのものは変えず、色味だけを持たせる）
function buildStyleColors(ref) {
  const need = Math.max(30, ref.total * 0.004);
  return STYLE_XS.map(p => {
    let w = 14, c = 0, r = 0, g = 0, b = 0;
    for (;;) {
      c = r = g = b = 0;
      for (let l = Math.max(0, p - w); l <= Math.min(255, p + w); l++) { c += ref.hist[l]; r += ref.sr[l]; g += ref.sg[l]; b += ref.sb[l]; }
      if (c >= need || w >= 255) break;
      w += 10;
    }
    if (c === 0) return [p, p, p];
    const R = r / c, G = g / c, B = b / c;
    const shift = p - (0.299 * R + 0.587 * G + 0.114 * B);    // 輝度が p になるように平行移動
    return [clamp255(R + shift), clamp255(G + shift), clamp255(B + shift)];
  });
}

function buildStylePoints(m, tone) {
  const pts = STYLE_XS.map(x => {
    const lo = Math.max(0, x - 5), hi = Math.min(255, x + 5);
    let sum = 0; for (let v = lo; v <= hi; v++) sum += m[v];
    return { x, y: x + (sum / (hi - lo + 1) - x) * tone };
  });
  for (let k = 1; k < pts.length; k++) pts[k].y = Math.max(pts[k].y, pts[k-1].y);   // 逆転しないように
  return pts.map(q => ({ x: q.x, y: clamp(Math.round(q.y), 0, 255) }));
}

function setStyleStatus(text) { styleStatus.textContent = text; }

function applyStyleTransfer() {
  if (!styleRef)           { setStyleStatus('参照画像を選んでください。'); return false; }
  if (!originalImageData)  { setStyleStatus('先に編集する画像を読み込んでください。'); return false; }

  const src = computeSourceHist();
  const key = src.key + '#' + styleRef.id + '#' + params.hue;
  if (!styleCache || styleCache.key !== key) {
    styleCache = {
      key,
      m: histogramMatch(src.hist, styleRef.hist),
      colors: buildStyleColors(styleRef),
      hue: matchHueBands(computeSourceHue(), styleRef.hue),
    };
  }

  // 階調 → トーンカーブ
  toneCurvePoints = buildStylePoints(styleCache.m, styleTone / 100);
  toneCurveLUT    = buildToneCurveLUT(toneCurvePoints);
  if (glSupported) uploadLutTexture();
  drawCurveUI();

  // 色相 → 色相別補正
  const hb = styleCache.hue, amt = styleHue / 100;
  hueBands = hb ? {
    shift: hb.shift.map(v => Math.round(clamp(v * amt, -180, 180))),
    sat:   hb.sat.map(v => Math.round(clamp(v * amt, -100, 100))),
  } : newHueBands();
  syncHueBands();

  // 色味 → グラデーションマップ
  gradientMapStops = styleCache.colors.map((c, i) => ({ pos: STYLE_XS[i], r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) }));
  gradientMapLUT   = buildGradientMapLUT(gradientMapStops);
  if (glSupported) uploadGradMapTexture();
  selectedGradStop = null;
  drawGradMapUI();
  params.gradMapOpacity = styleColor;
  gradMapOpacitySlider.value = styleColor; gradMapOpacityNumber.value = styleColor;

  applyEffects();
  setStyleStatus('「' + styleRef.name + '」を反映しました（トーンカーブ ' + STYLE_XS.length + ' 点 / ' +
    (hb ? '色相別補正 / ' : '') + 'グラデーションマップ ' + STYLE_XS.length + ' 色）。' +
    (hb ? '' : (styleRef.hue.n < styleRef.hue.total * 0.005
                 ? ' 参照画像にはほとんど色がないため、色相は変えていません。'
                 : ' 元の画像にほとんど色がないため、色相は変えていません（色は「色味」で付きます）。')));
  return true;
}

styleRefInput.addEventListener('change', () => {
  const file = styleRefInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxS = 400, r = Math.min(1, maxS / Math.max(img.width, img.height));
      const cw = Math.max(1, Math.round(img.width * r)), ch = Math.max(1, Math.round(img.height * r));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, cw, ch);
      styleRef = analyzeReference(cx.getImageData(0, 0, cw, ch), file.name);
      styleCache = null;

      styleRefThumb.width = 216; styleRefThumb.height = Math.max(1, Math.round(216 * ch / cw));
      styleRefThumb.getContext('2d').drawImage(c, 0, 0, styleRefThumb.width, styleRefThumb.height);
      styleRefThumb.style.display = 'block';

      if (applyStyleTransfer()) pushHistory();
      else setStyleStatus('参照画像「' + file.name + '」を読み込みました。画像を読み込んでから「この画像に再適用」を押してください。');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  styleRefInput.value = '';     // 同じファイルをもう一度選べるように
});

function bindStyleSlider(slider, number, setter) {
  const set = (v) => { setter(clamp(+v, 0, 100)); if (styleRef && originalImageData) applyStyleTransfer(); };
  slider.addEventListener('input',  () => { number.value = slider.value; set(slider.value); });
  slider.addEventListener('change', () => { if (styleRef && originalImageData) pushHistory(); });
  number.addEventListener('input',  () => { if (number.value === '') return; const v = clamp(+number.value, 0, 100); slider.value = v; set(v); });
  number.addEventListener('change', () => { if (styleRef && originalImageData) pushHistory(); });
}
bindStyleSlider(styleToneSlider,  styleToneNumber,  v => { styleTone  = v; });
bindStyleSlider(styleHueSlider,   styleHueNumber,   v => { styleHue   = v; });
bindStyleSlider(styleColorSlider, styleColorNumber, v => { styleColor = v; });

styleApplyBtn.addEventListener('click', () => { if (applyStyleTransfer()) pushHistory(); });

// ================================================================
// スライダー ↔ 数値入力の双方向バインド
// ================================================================
// 内部 -100~100、表示 0~255 に変換するタイプ（明度・彩度・コントラスト）
function bindScaled(slider, number, paramKey) {
  slider.addEventListener('input', () => { const v = +slider.value; number.value = to255(v); params[paramKey] = v; applyEffects(); });
  slider.addEventListener('change', pushHistory);
  number.addEventListener('input', () => { const d = clamp(+number.value,0,255); number.value=d; const v=from255(d); slider.value=v; params[paramKey]=v; applyEffects(); });
  number.addEventListener('change', pushHistory);
}

// 内部・表示が同じ値タイプ（色相・シャープネス・不透明度）
function bindDirect(slider, number, paramKey, lo, hi) {
  slider.addEventListener('input', () => { const v=clamp(+slider.value,lo,hi); number.value=v; params[paramKey]=v; applyEffects(); });
  slider.addEventListener('change', pushHistory);
  number.addEventListener('input', () => { const v=clamp(+number.value,lo,hi); number.value=v; slider.value=v; params[paramKey]=v; applyEffects(); });
  number.addEventListener('change', pushHistory);
}

bindScaled(brightnessSlider, brightnessNumber, 'brightness');
bindScaled(contrastSlider,   contrastNumber,   'contrast');
bindScaled(saturationSlider, saturationNumber, 'saturation');
bindDirect(hueSlider,              hueNumber,             'hue',            -180, 180);
bindDirect(sharpnessSlider,        sharpnessNumber,       'sharpness',         0, 100);
bindDirect(blurSlider,             blurNumber,            'blur',              0,  20);
bindDirect(gradMapOpacitySlider,   gradMapOpacityNumber,  'gradMapOpacity',    0, 100);
bindDirect(caXSlider,              caXNumber,             'caX',             -30,  30);
bindDirect(caYSlider,              caYNumber,             'caY',             -30,  30);
bindDirect(laAmountSlider,         laAmountNumber,        'lineArtAmount',     0, 100);
bindDirect(laSensSlider,           laSensNumber,          'lineArtSens',       0, 100);
bindDirect(laThreshSlider,         laThreshNumber,        'lineArtThresh',     0, 100);

// レベル補正（隣の点と連動するため個別実装）
levelBlack.addEventListener('input', () => {
  const b = clamp(+levelBlack.value, 0, params.levelWhite - 1);
  levelBlack.value = b; params.levelBlack = b; levelBlackValue.textContent = b; applyEffects();
});
levelBlack.addEventListener('change', pushHistory);

levelWhite.addEventListener('input', () => {
  const w = clamp(+levelWhite.value, params.levelBlack + 1, 255);
  levelWhite.value = w; params.levelWhite = w; levelWhiteValue.textContent = w; applyEffects();
});
levelWhite.addEventListener('change', pushHistory);

levelMid.addEventListener('input', () => {
  const v = parseFloat(levelMid.value);
  params.levelMid = v; levelMidValue.textContent = v.toFixed(2); applyEffects();
});
levelMid.addEventListener('change', pushHistory);

// ================================================================
// リセット / 保存
// ================================================================
document.getElementById('reset').addEventListener('click', () => {
  params = defaultParams();

  brightnessSlider.value=0;  brightnessNumber.value=to255(0);
  contrastSlider.value=0;    contrastNumber.value=to255(0);
  saturationSlider.value=0;  saturationNumber.value=to255(0);
  hueSlider.value=0;         hueNumber.value=0;
  sharpnessSlider.value=0;   sharpnessNumber.value=0;
  blurSlider.value=0;        blurNumber.value=0;
  gradMapOpacitySlider.value=0; gradMapOpacityNumber.value=0;
  caXSlider.value=0; caXNumber.value=0; caYSlider.value=0; caYNumber.value=0;
  laAmountSlider.value=0;  laAmountNumber.value=0;
  laSensSlider.value=50;   laSensNumber.value=50;
  laThreshSlider.value=15;  laThreshNumber.value=15;
  levelBlack.value=0;  levelBlackValue.textContent=0;
  levelMid.value=1.0;  levelMidValue.textContent='1.00';
  levelWhite.value=255; levelWhiteValue.textContent=255;

  toneCurvePoints  = [{ x:0, y:0 }, { x:255, y:255 }];
  gradientMapStops = [{ pos:0, r:0, g:0, b:0 }, { pos:255, r:255, g:255, b:255 }];
  selectedGradStop = null;

  toneCurveLUT   = buildToneCurveLUT(toneCurvePoints);
  gradientMapLUT = buildGradientMapLUT(gradientMapStops);
  if (glSupported) { uploadLutTexture(); uploadGradMapTexture(); }
  drawCurveUI(); drawGradMapUI();
  hueBands = newHueBands(); syncHueBands();

  if (originalImageData) ctx.putImageData(originalImageData, 0, 0);
  applyEffects(); pushHistory();
});

document.getElementById('save').addEventListener('click', () => {
  if (!originalImageData) return;
  flushEffects();                                       // 描画待ちがあれば先に反映する
  const src = useGPU() ? glCanvas : canvas;
  src.toBlob((blob) => {
    if (!blob) { alert('保存に失敗しました。画像が大きすぎる可能性があります。'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'edited-image.png';
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, 'image/png');
});

// ================================================================
// 初期化
// ================================================================
glSupported = initGL();

if (!glSupported) {
  modeGPURadio.disabled = true;
  modeCPURadio.checked = true;
  renderMode = 'cpu';
  gpuTimeValue.textContent = '非対応';
  gpuStatusNote.textContent = 'このブラウザではWebGLが利用できないため CPU のみ動作します。';
} else {
  modeGPURadio.checked = true;
  renderMode = 'gpu';
}

// 初期 LUT 構築
toneCurveLUT   = buildToneCurveLUT(toneCurvePoints);
gradientMapLUT = buildGradientMapLUT(gradientMapStops);
if (glSupported) { uploadLutTexture(); uploadGradMapTexture(); }

// 初期 UI 描画
drawCurveUI();
drawGradMapUI();
syncHueBands();

// 数値欄の表示を合わせる
brightnessNumber.value = to255(0);
contrastNumber.value   = to255(0);
saturationNumber.value = to255(0);

// 最初のヒストリーエントリ（空白状態）
pushHistory();
