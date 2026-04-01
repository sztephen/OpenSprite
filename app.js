(function() {
  const BATCH_SIZE = 4;
  const OVERLAP = 2;

  // ─── DOM REFS ─────────────────────────────────
  const $ = id => document.getElementById(id);

  // API
  const localUrlInput = $('localUrl');

  // Character gen
  const charPromptInput = $('charPrompt');
  const charGenWInput = $('charGenW');
  const charGenHInput = $('charGenH');
  const charGenBtn = $('charGenBtn');
  const charGenPreview = $('charGenPreview');
  const charGenImg = $('charGenImg');
  const charGenUseBtn = $('charGenUseBtn');
  const charGenDownloadBtn = $('charGenDownloadBtn');

  // Sprite upload
  const uploadZone = $('uploadZone');
  const fileInput = $('fileInput');

  // Animation config
  const animAction = $('animAction');
  const extraPrompt = $('extraPrompt');
  const frameCountInput = $('frameCount');
  const frameBreakdown = $('frameBreakdown');
  const batchInfo = $('batchInfo');

  // Background removal
  const removeBgCheckbox = $('removeBg');
  const bgThresholdWrap = $('bgThresholdWrap');
  const bgThresholdInput = $('bgThreshold');
  const bgThresholdVal = $('bgThresholdVal');

  // Generate controls
  const generateBtn = $('generateBtn');
  const cancelBtn = $('cancelBtn');
  const retryBtn = $('retryBtn');

  // Content area
  const statusDot = $('statusDot');
  const statusText_ = $('statusText');
  const progressContainer = $('progressContainer');
  const progressBar = $('progressBar');
  const progressLabel = $('progressLabel');
  const previewArea = $('previewArea');
  const animPreviewBar = $('animPreviewBar');
  const animPreviewImg = $('animPreviewImg');
  const fpsSlider = $('fpsSlider');
  const fpsValue = $('fpsValue');
  const splitChooser = $('splitChooser');
  const splitChooserStrips = $('splitChooserStrips');
  const chooserAuto = $('chooserAuto');
  const chooserManual = $('chooserManual');
  const applySplitBtn = $('applySplitBtn');
  const resplitBtn = $('resplitBtn');
  const framesGridWrapper = $('framesGridWrapper');
  const framesGrid = $('framesGrid');
  const spritesheetSection = $('spritesheetSection');
  const spritesheetCanvas = $('spritesheetCanvas');
  const downloadSheetBtn = $('downloadSheet');
  const downloadZipBtn = $('downloadZip');
  const downloadGifBtn = $('downloadGif');
  const debugPanel = $('debugPanel');
  const debugToggle = $('debugToggle');
  const rawStripSection = $('rawStripSection');
  const rawStripImg = $('rawStripImg');

  // Manual crop refs
  const manualCropSection = $('manualCropSection');
  const cropWInput = $('cropW');
  const cropHInput = $('cropH');
  const cropMatchSprite = $('cropMatchSprite');
  const cropFrameTag = $('cropFrameTag');
  const cropFrameLabel = $('cropFrameLabel');
  const cropCanvasWrap = $('cropCanvasWrap');
  const cropCanvas = $('cropCanvas');
  const cropPreview = $('cropPreview');
  const cropUndoBtn = $('cropUndoBtn');
  const cropDoneBtn = $('cropDoneBtn');
  const cropFinishBtn = $('cropFinishBtn');

  // ─── STATE ────────────────────────────────────
  let uploadedImageBase64 = null;
  let uploadedImageType = null;
  let generatedFrames = []; // { label, rawDataUrl, dataUrl }
  let animInterval = null;
  let isGenerating = false;
  let splitMode = 'auto';
  let spriteWidth = 0;
  let spriteHeight = 0;
  let savedRawStripUrls = [];
  let savedAllFrameLabels = [];
  let savedBatches = [];

  // Cancellation & retry
  let currentAbortController = null;
  let completedBatchStrips = [];
  let completedBatchOverlaps = [];
  let retryBatchIndex = 0;
  let pendingBatches = [];
  let pendingGenerateParams = null;

  // Split preview
  let savedCustomSplitPoints = {};
  let activeDragCleanup = [];

  // ─── CHAR PROMPT → ENABLE BUTTON ─────────────
  charPromptInput.addEventListener('input', () => {
    charGenBtn.disabled = !charPromptInput.value.trim();
  });

  // ─── CHARACTER GENERATION (txt2img) ──────────
  charGenBtn.addEventListener('click', generateCharacter);

  async function generateCharacter() {
    const localUrl = (localUrlInput.value.trim() || 'http://localhost:7860').replace(/\/$/, '');
    const prompt = charPromptInput.value.trim();
    const w = parseInt(charGenWInput.value) || 64;
    const h = parseInt(charGenHInput.value) || 64;

    charGenBtn.disabled = true;
    charGenBtn.textContent = 'Generating...';
    charGenPreview.style.display = 'none';

    const requestBody = {
      prompt: `pixel art character sprite, ${prompt}, plain white background, single character, centered, clean pixel art style, 2D game sprite, full body`,
      negative_prompt: 'multiple characters, crowded, text, labels, watermark, signature, blurry, realistic photo, 3D render, gradient background, shadow',
      width: w,
      height: h,
      steps: 25,
      cfg_scale: 3.5,
      sampler_name: 'Euler',
      batch_size: 1,
    };

    try {
      const resp = await fetch(`${localUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || e.detail || `API error ${resp.status}`);
      }
      const data = await resp.json();
      const imageUrl = extractImage(data);
      if (!imageUrl) throw new Error('No image returned from server');

      charGenImg.src = imageUrl;
      charGenPreview.style.display = 'block';
      charGenPreview.dataset.url = imageUrl;
    } catch (err) {
      alert(`Character generation failed: ${err.message}`);
    } finally {
      charGenBtn.disabled = false;
      charGenBtn.textContent = 'Generate Character';
    }
  }

  charGenUseBtn.addEventListener('click', async () => {
    const url = charGenPreview.dataset.url;
    if (!url) return;
    uploadedImageBase64 = url.split(',')[1];
    uploadedImageType = 'image/png';
    uploadZone.innerHTML = `<img src="${url}" />`;
    uploadZone.classList.add('has-image');
    uploadZone.style.background = '#fff';
    await measureSprite(url);
    cropWInput.value = spriteWidth;
    cropHInput.value = spriteHeight;
    setStatus(`Character set as sprite (${spriteWidth}×${spriteHeight}) — configure and generate`, '');
    checkReady();
  });

  charGenDownloadBtn.addEventListener('click', async () => {
    const url = charGenPreview.dataset.url;
    if (!url) return;
    const doRemove = removeBgCheckbox.checked;
    const finalUrl = doRemove
      ? await removeBackground(url, parseInt(bgThresholdInput.value) || 30)
      : url;
    const a = document.createElement('a');
    a.download = 'character_sprite.png';
    a.href = finalUrl;
    a.click();
  });

  // ─── BACKGROUND REMOVAL ──────────────────────
  removeBgCheckbox.addEventListener('change', () => {
    bgThresholdWrap.style.display = removeBgCheckbox.checked ? 'block' : 'none';
    // Update checkerboard hint on spritesheet area
    const wrap = document.querySelector('.spritesheet-canvas-wrap');
    if (wrap) wrap.classList.toggle('transparent-bg', removeBgCheckbox.checked);
    document.querySelector('.anim-canvas-wrap').classList.toggle('transparent-bg', removeBgCheckbox.checked);
    if (generatedFrames.length) rebuildWithBgSetting();
  });

  bgThresholdInput.addEventListener('input', () => {
    bgThresholdVal.textContent = bgThresholdInput.value;
    if (removeBgCheckbox.checked && generatedFrames.length) rebuildWithBgSetting();
  });

  function removeBackground(dataUrl, threshold) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, W, H);
        const d = imageData.data;

        // Sample all 4 corners + edge midpoints to find background color
        const samples = [];
        const samplePx = (x, y) => {
          const i = (y * W + x) * 4;
          if (d[i+3] > 10) samples.push([d[i], d[i+1], d[i+2]]);
        };
        samplePx(0, 0); samplePx(W-1, 0); samplePx(0, H-1); samplePx(W-1, H-1);
        samplePx(Math.floor(W/2), 0); samplePx(Math.floor(W/2), H-1);
        samplePx(0, Math.floor(H/2)); samplePx(W-1, Math.floor(H/2));

        const count = samples.length || 1;
        const bgR = Math.round(samples.reduce((s, c) => s + c[0], 0) / count);
        const bgG = Math.round(samples.reduce((s, c) => s + c[1], 0) / count);
        const bgB = Math.round(samples.reduce((s, c) => s + c[2], 0) / count);
        const t2 = threshold * threshold * 3;

        for (let i = 0; i < d.length; i += 4) {
          if (d[i+3] < 10) continue;
          const dr = d[i] - bgR, dg = d[i+1] - bgG, db = d[i+2] - bgB;
          if (dr*dr + dg*dg + db*db < t2) d[i+3] = 0;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }

  async function rebuildWithBgSetting() {
    if (!generatedFrames.length) return;
    const doRemove = removeBgCheckbox.checked;
    const threshold = parseInt(bgThresholdInput.value) || 30;
    setStatus('Applying background setting...', 'active');
    framesGrid.innerHTML = '';
    for (const frame of generatedFrames) {
      frame.dataUrl = doRemove
        ? await removeBackground(frame.rawDataUrl, threshold)
        : frame.rawDataUrl;
      addFrameCard(frame.label, frame.dataUrl);
    }
    buildSpritesheet();
    updateAnimFrames();
    setStatus(`Done! ${generatedFrames.length} frames`, 'done');
  }

  // ─── CANCELLATION ────────────────────────────
  cancelBtn.addEventListener('click', () => {
    if (currentAbortController) currentAbortController.abort();
    setStatus('Generation cancelled', 'error');
    progressContainer.classList.remove('visible');
    cancelBtn.style.display = 'none';
    retryBtn.style.display = 'none';
    isGenerating = false;
    generateBtn.disabled = false;
    checkReady();
  });

  // ─── PER-BATCH RETRY ─────────────────────────
  retryBtn.addEventListener('click', () => {
    retryBtn.style.display = 'none';
    if (pendingGenerateParams) resumeGenerate();
  });

  // ─── SPLIT CHOOSER TOGGLE ─────────────────────
  chooserAuto.addEventListener('click', () => {
    splitMode = 'auto';
    chooserAuto.classList.add('active');
    chooserManual.classList.remove('active');
  });
  chooserManual.addEventListener('click', () => {
    splitMode = 'manual';
    chooserManual.classList.add('active');
    chooserAuto.classList.remove('active');
  });

  // ─── APPLY SPLIT ─────────────────────────────
  async function applySplit() {
    splitChooser.classList.remove('visible');
    generatedFrames = [];
    framesGrid.innerHTML = '';
    framesGridWrapper.classList.remove('visible');
    spritesheetSection.classList.remove('visible');
    animPreviewBar.classList.remove('visible');
    manualCropSection.classList.remove('visible');

    const doRemove = removeBgCheckbox.checked;
    const threshold = parseInt(bgThresholdInput.value) || 30;

    if (splitMode === 'auto') {
      setStatus('Auto-splitting frames...', 'active');
      for (let bi = 0; bi < savedBatches.length; bi++) {
        const batch = savedBatches[bi];
        // Use interactive split points if available, otherwise auto-compute
        const customSplits = savedCustomSplitPoints[bi] || null;
        const frameUrls = await autoSplitStrip(savedRawStripUrls[bi], batch.length, customSplits);
        for (let i = 0; i < batch.length; i++) {
          const rawUrl = frameUrls[i];
          const displayUrl = doRemove ? await removeBackground(rawUrl, threshold) : rawUrl;
          generatedFrames.push({ label: batch[i].label, rawDataUrl: rawUrl, dataUrl: displayUrl });
          addFrameCard(batch[i].label, displayUrl);
        }
      }
      setStatus(`Done! ${generatedFrames.length} frames`, 'done');
      framesGridWrapper.classList.add('visible');
      buildSpritesheet();
      startAnimPreview();
      isGenerating = false;
      generateBtn.disabled = false;
      checkReady();
    } else {
      setStatus(`${savedRawStripUrls.length} strips ready — crop each frame manually`, 'done');
      startManualCrop(savedRawStripUrls, savedAllFrameLabels);
    }
  }

  applySplitBtn.addEventListener('click', applySplit);

  resplitBtn.addEventListener('click', () => {
    if (animInterval) clearInterval(animInterval);
    generatedFrames = [];
    framesGrid.innerHTML = '';
    framesGridWrapper.classList.remove('visible');
    spritesheetSection.classList.remove('visible');
    animPreviewBar.classList.remove('visible');
    manualCropSection.classList.remove('visible');
    previewArea.classList.add('empty');
    previewArea.innerHTML = '';
    showSplitChooser();
  });

  // ─── INTERACTIVE SPLIT PREVIEW ───────────────
  function computeSplitPoints(pixelData, W, H, expectedCount) {
    const scores = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let v = 0, pr = -1, pg = -1, pb = -1;
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        const r = pixelData.data[i], g = pixelData.data[i+1], b = pixelData.data[i+2], a = pixelData.data[i+3];
        if (a < 10) continue;
        if (pr >= 0) v += Math.abs(r-pr) + Math.abs(g-pg) + Math.abs(b-pb);
        pr = r; pg = g; pb = b;
      }
      scores[x] = v;
    }
    const ew = Math.round(W / expectedCount);
    const splits = [0];
    for (let f = 1; f < expectedCount; f++) {
      const target = Math.round(f * ew);
      const radius = Math.round(ew * 0.15);
      let bx = target, bs = Infinity;
      for (let x = Math.max(1, target - radius); x < Math.min(W - 1, target + radius); x++) {
        const s = (scores[x-1] + scores[x] + scores[x+1]) / 3;
        if (s < bs) { bs = s; bx = x; }
      }
      splits.push(bx);
    }
    splits.push(W);
    return splits;
  }

  function buildSplitPreviewCanvas(stripUrl, frameCount, batchIdx) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        const src = document.createElement('canvas');
        src.width = W; src.height = H;
        const sctx = src.getContext('2d');
        sctx.drawImage(img, 0, 0);
        const px = sctx.getImageData(0, 0, W, H);

        if (!savedCustomSplitPoints[batchIdx]) {
          savedCustomSplitPoints[batchIdx] = computeSplitPoints(px, W, H, frameCount);
        }

        const DISP_H = 90;
        const scale = DISP_H / H;
        const dispW = Math.round(W * scale);

        const canvas = document.createElement('canvas');
        canvas.width = dispW;
        canvas.height = DISP_H;
        canvas.className = 'split-preview-canvas';

        function redraw() {
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, dispW, DISP_H);
          const pts = savedCustomSplitPoints[batchIdx];
          for (let i = 1; i < pts.length - 1; i++) {
            const dx = pts[i] * scale;
            ctx.save();
            ctx.strokeStyle = '#ff4d00';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(dx, 0);
            ctx.lineTo(dx, DISP_H);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ff4d00';
            ctx.beginPath();
            ctx.arc(dx, DISP_H / 2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        redraw();

        let dragging = -1;
        const SNAP_PX = 7;

        function onMouseDown(e) {
          const rect = canvas.getBoundingClientRect();
          const mx = (e.clientX - rect.left) * (dispW / rect.width);
          const pts = savedCustomSplitPoints[batchIdx];
          for (let i = 1; i < pts.length - 1; i++) {
            if (Math.abs(pts[i] * scale - mx) < SNAP_PX) {
              dragging = i;
              e.preventDefault();
              return;
            }
          }
        }

        function onMouseMove(e) {
          if (dragging < 0) return;
          const rect = canvas.getBoundingClientRect();
          const mx = (e.clientX - rect.left) * (dispW / rect.width);
          const pts = savedCustomSplitPoints[batchIdx];
          const rawX = Math.round(mx / scale);
          pts[dragging] = Math.max(pts[dragging - 1] + 2, Math.min(pts[dragging + 1] - 2, rawX));
          redraw();
        }

        function onMouseUp() { dragging = -1; }

        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        activeDragCleanup.push(() => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        });

        resolve(canvas);
      };
      img.src = stripUrl;
    });
  }

  async function showSplitChooser() {
    // Clean up old drag listeners
    activeDragCleanup.forEach(fn => fn());
    activeDragCleanup = [];
    savedCustomSplitPoints = {};

    splitChooserStrips.innerHTML = '';
    for (let i = 0; i < savedRawStripUrls.length; i++) {
      const label = document.createElement('div');
      label.className = 'strip-label';
      label.textContent = `Batch ${i + 1} — drag orange handles to adjust cuts`;
      splitChooserStrips.appendChild(label);
      const canvas = await buildSplitPreviewCanvas(savedRawStripUrls[i], savedBatches[i].length, i);
      splitChooserStrips.appendChild(canvas);
    }
    splitChooser.classList.add('visible');
  }

  // ─── BREAKDOWN ───────────────────────────────
  function updateBreakdown() {
    const total = parseInt(frameCountInput.value) || 8;
    const action = animAction.value.trim() || '___';
    frameBreakdown.innerHTML = `→ ${action}_cycle: <b>${total}</b>`;
    const calls = Math.ceil(total / BATCH_SIZE);
    batchInfo.textContent = `${calls} API call${calls > 1 ? 's' : ''} (${BATCH_SIZE} frames/batch)`;
  }

  frameCountInput.addEventListener('input', updateBreakdown);
  animAction.addEventListener('input', () => { updateBreakdown(); checkReady(); });
  updateBreakdown();

  // ─── UPLOAD ──────────────────────────────────
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.background = '#000'; uploadZone.style.color = '#f0ece4'; });
  uploadZone.addEventListener('dragleave', () => { if (!uploadedImageBase64) { uploadZone.style.background = '#fff'; uploadZone.style.color = ''; }});
  uploadZone.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    uploadedImageType = file.type;
    const reader = new FileReader();
    reader.onload = async (e) => {
      uploadedImageBase64 = e.target.result.split(',')[1];
      uploadZone.innerHTML = `<img src="${e.target.result}" />`;
      uploadZone.classList.add('has-image');
      uploadZone.style.background = '#fff';
      uploadZone.style.color = '';
      await measureSprite(e.target.result);
      cropWInput.value = spriteWidth;
      cropHInput.value = spriteHeight;
      setStatus(`Sprite uploaded (${spriteWidth}×${spriteHeight}) — configure and generate`, '');
      checkReady();
    };
    reader.readAsDataURL(file);
  }

  function measureSprite(dataUrl) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { spriteWidth = img.naturalWidth; spriteHeight = img.naturalHeight; res(); };
      img.src = dataUrl;
    });
  }

  function checkReady() {
    generateBtn.disabled = !(uploadedImageBase64 && animAction.value.trim()) || isGenerating;
  }

  function setStatus(text, state) {
    statusText_.textContent = text;
    statusDot.className = 'status-dot' + (state ? ' ' + state : '');
  }

  debugToggle.addEventListener('click', () => {
    debugPanel.classList.toggle('visible');
    debugToggle.textContent = debugPanel.classList.contains('visible') ? 'Hide Debug' : 'Show Debug';
  });

  // ─── PROMPT ──────────────────────────────────
  function buildBatchPrompt(action, batchFrameDescs, totalFrames, extra, hasPrevStrip) {
    const count = batchFrameDescs.length;
    const frameW = spriteWidth || 64;
    const frameH = spriteHeight || 64;
    const totalStripW = frameW * count;
    const frameList = batchFrameDescs.map((f, i) => `  ${i + 1}. ${f.desc}`).join('\n');

    let intro, contBlock = '';
    if (hasPrevStrip) {
      intro = `Pixel art sprite strip continuation. Continue the animation exactly from the previous batch's last frame.`;
      contBlock = `The left portion of your init image shows the previous frames — use them as anchor. Generate new frames continuing from the rightmost anchor frame. Same character, same style, same size, same colors.`;
    } else {
      intro = `Pixel art sprite strip based on the provided reference character image.`;
    }

    return `${intro}

Draw a ${totalStripW}x${frameH} pixel sprite strip containing exactly ${count} frames of the "${action}" animation. Each frame is ${frameW}x${frameH} pixels.

Layout: ${count} frames side by side in one row, left to right, no gaps, no padding, no borders. The image must be exactly ${totalStripW} pixels wide and ${frameH} pixels tall.
${contBlock ? '\n' + contBlock + '\n' : ''}
Frames:
${frameList}

Rules:
- White background
- Same pixel art style and colors as reference
- Same character scale — do not enlarge or shrink
- Feet stay at same Y position across all frames
- No text, labels, or annotations
- No overlapping — each character fits fully inside its ${frameW}x${frameH} cell
- Keep the character horizontally centered in each frame cell

Animation rules — CRITICAL:
- Every frame MUST show a clearly DIFFERENT body pose — never repeat or barely change a pose
- Show real movement: limbs swing to distinct positions, weight shifts visibly, body tilts and bobs
- For cycle/loop frames: the last frame must flow smoothly back into the first frame to create a seamless loop
- Think about key animation poses: contact, down, passing, up — each frame should represent a distinct phase
- Do NOT just shift the character sideways or add minor arm wiggle — show full-body movement
${extra ? '\n' + extra : ''}`;
  }

  // ─── IMAGE EXTRACTION ────────────────────────
  function extractImage(data) {
    if (data.images && data.images.length > 0) {
      const img = data.images[0];
      if (img.startsWith('data:')) return img;
      return `data:image/png;base64,${img}`;
    }
    return deepScan(data);
  }

  function deepScan(obj, d = 0) {
    if (d > 8 || !obj) return null;
    if (typeof obj === 'string') {
      if (obj.length > 200 && /^[A-Za-z0-9+/=\n]+$/.test(obj)) return `data:image/png;base64,${obj.replace(/\n/g, '')}`;
      if (obj.startsWith('data:image/')) return obj;
      return null;
    }
    if (Array.isArray(obj)) { for (const i of obj) { const f = deepScan(i, d+1); if (f) return f; } }
    else if (typeof obj === 'object') {
      if (obj.data && obj.mime_type?.startsWith('image/')) return `data:${obj.mime_type};base64,${obj.data}`;
      if (obj.inline_data?.data) return `data:${obj.inline_data.mime_type || 'image/png'};base64,${obj.inline_data.data}`;
      for (const k of Object.keys(obj)) { const f = deepScan(obj[k], d+1); if (f) return f; }
    }
    return null;
  }

  // ─── AUTO SPLIT ──────────────────────────────
  function autoSplitStrip(imageDataUrl, expectedCount, customSplits) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        const src = document.createElement('canvas');
        src.width = W; src.height = H;
        const sctx = src.getContext('2d');
        sctx.drawImage(img, 0, 0);

        let splits;
        if (customSplits && customSplits.length === expectedCount + 1) {
          splits = customSplits;
        } else {
          const px = sctx.getImageData(0, 0, W, H);
          splits = computeSplitPoints(px, W, H, expectedCount);
        }

        const ew = Math.round(W / expectedCount);
        const outW = spriteWidth || ew;
        const outH = spriteHeight || H;

        // Detect background color from corners
        const px2 = sctx.getImageData(0, 0, W, H);
        const bgSamples = [
          [px2.data[0], px2.data[1], px2.data[2]],
          [px2.data[(W-1)*4], px2.data[(W-1)*4+1], px2.data[(W-1)*4+2]],
        ];
        const bgR = Math.round(bgSamples.reduce((s, c) => s + c[0], 0) / bgSamples.length);
        const bgG = Math.round(bgSamples.reduce((s, c) => s + c[1], 0) / bgSamples.length);
        const bgB = Math.round(bgSamples.reduce((s, c) => s + c[2], 0) / bgSamples.length);
        const BG_TOLERANCE = 15;

        const rawFrames = [];
        for (let i = 0; i < expectedCount; i++) {
          const sx = splits[i], sw = splits[i+1] - sx;
          const fc = document.createElement('canvas');
          fc.width = sw; fc.height = H;
          const fctx = fc.getContext('2d');
          fctx.drawImage(src, sx, 0, sw, H, 0, 0, sw, H);

          const fpx = fctx.getImageData(0, 0, sw, H);
          let minX = sw, maxX = 0, minY = H, maxY = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < sw; x++) {
              const idx = (y * sw + x) * 4;
              const r = fpx.data[idx], g = fpx.data[idx+1], b = fpx.data[idx+2], a = fpx.data[idx+3];
              if (a > 10) {
                const dr = r - bgR, dg = g - bgG, db = b - bgB;
                if (dr*dr + dg*dg + db*db > BG_TOLERANCE * BG_TOLERANCE * 3) {
                  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
              }
            }
          }
          rawFrames.push({ canvas: fc, sw, minX, maxX, minY, maxY, hasContent: maxX >= minX });
        }

        let gMinY = H, gMaxY = 0;
        for (const f of rawFrames) {
          if (!f.hasContent) continue;
          gMinY = Math.min(gMinY, f.minY);
          gMaxY = Math.max(gMaxY, f.maxY);
        }
        const globalCenterY = (gMinY + gMaxY) / 2;

        const frames = [];
        for (let i = 0; i < expectedCount; i++) {
          const f = rawFrames[i];
          const fc = document.createElement('canvas');
          fc.width = outW; fc.height = outH;
          const fctx = fc.getContext('2d');
          fctx.fillStyle = '#ffffff';
          fctx.fillRect(0, 0, outW, outH);

          if (!f.hasContent) { frames.push(fc.toDataURL('image/png')); continue; }

          const scaleX = outW / f.sw;
          const scaleY = outH / H;
          const scale = Math.min(scaleX, scaleY);
          const dw = Math.round(f.sw * scale);
          const dh = Math.round(H * scale);
          const contentCX = (f.minX + f.maxX) / 2;
          const dx = Math.round(outW / 2 - contentCX * scale);
          const dy = Math.round(outH / 2 - globalCenterY * scale);

          fctx.drawImage(f.canvas, 0, 0, f.sw, H, dx, dy, dw, dh);
          frames.push(fc.toDataURL('image/png'));
        }
        resolve(frames);
      };
      img.onerror = () => reject(new Error('Failed to load strip'));
      img.src = imageDataUrl;
    });
  }

  // ─── OVERLAP HELPERS ─────────────────────────
  function cropStripFrames(stripDataUrl, startFrameIdx, count, frameW, frameH) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = count * frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, startFrameIdx * frameW, 0, count * frameW, frameH, 0, 0, count * frameW, frameH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = stripDataUrl;
    });
  }

  function buildOverlapInitImage(overlapDataUrl, overlapCount, newCount, frameW, frameH) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const totalW = (overlapCount + newCount) * frameW;
        const canvas = document.createElement('canvas');
        canvas.width = totalW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalW, frameH);
        ctx.drawImage(img, 0, 0, overlapCount * frameW, frameH, 0, 0, overlapCount * frameW, frameH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = overlapDataUrl;
    });
  }

  // ─── BUILD FRAME LIST ────────────────────────
  function buildFrameList(action, actionDisplay, total) {
    const frames = [];
    for (let i = 0; i < total; i++) {
      const num = String(i + 1).padStart(2, '0');
      const phase = i / total;
      let poseHint;
      if (total === 1) {
        poseHint = 'full action pose';
      } else if (total === 2) {
        poseHint = i === 0 ? 'key pose A (e.g. left leg forward, right arm forward)' : 'key pose B — opposite of A';
      } else {
        const phaseNames = ['contact/strike pose — limbs extended', 'down/recoil — body lowest', 'passing pose — limbs crossing', 'up/push-off — body highest'];
        poseHint = phaseNames[Math.floor(phase * 4) % 4];
      }
      frames.push({ label: `${action}_cycle_${num}`, desc: `${actionDisplay} cycle ${i+1}/${total}: ${poseHint}` });
    }
    return frames;
  }

  // ─── MAIN GENERATE ───────────────────────────
  async function generate() {
    const localUrl = (localUrlInput.value.trim() || 'http://localhost:7860').replace(/\/$/, '');
    const action = animAction.value.trim().toLowerCase().replace(/\s+/g, '_');
    const actionDisplay = animAction.value.trim();
    const total = parseInt(frameCountInput.value) || 8;
    const extra = extraPrompt.value.trim();

    await measureSprite(`data:${uploadedImageType};base64,${uploadedImageBase64}`);

    isGenerating = true;
    generateBtn.disabled = true;
    cancelBtn.style.display = 'block';
    retryBtn.style.display = 'none';
    completedBatchStrips = [];
    completedBatchOverlaps = [];
    retryBatchIndex = 0;
    generatedFrames = [];
    savedRawStripUrls = [];
    savedAllFrameLabels = [];
    savedBatches = [];
    framesGrid.innerHTML = '';
    framesGridWrapper.classList.remove('visible');
    spritesheetSection.classList.remove('visible');
    animPreviewBar.classList.remove('visible');
    manualCropSection.classList.remove('visible');
    splitChooser.classList.remove('visible');
    previewArea.classList.add('empty');
    previewArea.innerHTML = '';
    progressContainer.classList.add('visible');
    debugPanel.textContent = '';
    debugPanel.classList.remove('visible');
    debugToggle.style.display = 'none';
    rawStripSection.style.display = 'none';
    rawStripImg.innerHTML = '';

    const allFrames = buildFrameList(action, actionDisplay, total);
    pendingBatches = [];
    for (let i = 0; i < allFrames.length; i += BATCH_SIZE) {
      pendingBatches.push(allFrames.slice(i, i + BATCH_SIZE));
    }

    pendingGenerateParams = { localUrl, action, actionDisplay, total, extra, allFrames };
    await runBatchLoop(pendingGenerateParams, 0);
  }

  async function resumeGenerate() {
    if (!pendingGenerateParams) return;
    isGenerating = true;
    generateBtn.disabled = true;
    cancelBtn.style.display = 'block';
    retryBtn.style.display = 'none';
    progressContainer.classList.add('visible');
    await runBatchLoop(pendingGenerateParams, retryBatchIndex);
  }

  async function runBatchLoop(params, startBatch) {
    const { localUrl, actionDisplay, extra, allFrames } = params;

    let overlapDataUrl = completedBatchOverlaps[startBatch - 1] || null;
    const rawStripUrls = [...completedBatchStrips];

    for (let bi = startBatch; bi < pendingBatches.length; bi++) {
      const batch = pendingBatches[bi];
      const frameW = spriteWidth || 64;
      const frameH = spriteHeight || 64;
      const isFirst = bi === 0;
      const actualOverlap = isFirst ? 0 : Math.min(OVERLAP, batch.length);
      const requestFrameCount = batch.length + actualOverlap;

      progressBar.style.width = `${(bi / pendingBatches.length) * 100}%`;
      progressLabel.textContent = `Batch ${bi + 1} / ${pendingBatches.length}`;
      setStatus(`Generating batch ${bi+1}/${pendingBatches.length}: ${batch.map(f=>f.label).join(', ')}`, 'active');

      let initBase64, initMime;
      if (isFirst) {
        initBase64 = uploadedImageBase64;
        initMime = uploadedImageType;
      } else {
        const overlapInitUrl = await buildOverlapInitImage(overlapDataUrl, actualOverlap, batch.length, frameW, frameH);
        initBase64 = overlapInitUrl.split(',')[1];
        initMime = 'image/png';
      }

      const promptFrames = isFirst ? batch : [
        ...Array(actualOverlap).fill(null).map((_, i) => ({
          label: 'anchor',
          desc: `Anchor frame ${i+1} — match reference exactly, do not change`
        })),
        ...batch
      ];

      const prompt = buildBatchPrompt(actionDisplay, promptFrames, allFrames.length, extra, !isFirst);

      const requestBody = {
        init_images: [`data:${initMime};base64,${initBase64}`],
        prompt,
        negative_prompt: 'text, labels, watermark, signature, borders, multiple rows, frame numbers, annotations, words',
        width: frameW * requestFrameCount,
        height: frameH,
        steps: 28,
        cfg_scale: 1,
        denoising_strength: isFirst ? 0.78 : 0.65,
        sampler_name: 'Euler',
        batch_size: 1,
        restore_faces: false,
        tiling: false,
      };

      currentAbortController = new AbortController();

      try {
        const resp = await fetch(`${localUrl}/sdapi/v1/img2img`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: currentAbortController.signal,
        });

        if (!resp.ok) {
          const e = await resp.json().catch(() => ({}));
          throw new Error(e.error || e.detail || `API error ${resp.status}`);
        }

        const data = await resp.json();
        const ds = JSON.stringify({ images: data.images ? [`[base64 len=${data.images[0]?.length}]`] : null, parameters: data.parameters }, null, 2);
        debugToggle.style.display = 'block';
        debugPanel.textContent += `── BATCH ${bi+1} ──\n${ds}\n\n`;

        const rawImageUrl = extractImage(data);
        if (!rawImageUrl) throw new Error('No image returned from Flux. Check model is loaded. See debug panel.');

        const batchStrip = actualOverlap > 0
          ? await cropStripFrames(rawImageUrl, actualOverlap, batch.length, frameW, frameH)
          : rawImageUrl;

        overlapDataUrl = await cropStripFrames(
          batchStrip,
          Math.max(0, batch.length - OVERLAP),
          Math.min(OVERLAP, batch.length),
          frameW, frameH
        );

        rawStripSection.style.display = 'block';
        rawStripImg.innerHTML += `<div style="margin-bottom:4px;font-family:'Space Mono',monospace;font-size:9px;color:#888;">Batch ${bi+1}</div><img src="${batchStrip}" style="image-rendering:pixelated;max-height:100px;margin-bottom:12px;" /><br>`;

        rawStripUrls.push(batchStrip);
        completedBatchStrips.push(batchStrip);
        completedBatchOverlaps.push(overlapDataUrl);
        retryBatchIndex = bi + 1;

        previewArea.classList.remove('empty');
        ensurePreviewImg();
        previewImg.src = batchStrip;

      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
        setStatus(`Error on batch ${bi+1}: ${err.message}`, 'error');
        debugToggle.style.display = 'block';
        progressContainer.classList.remove('visible');
        cancelBtn.style.display = 'none';
        retryBtn.style.display = 'block';
        retryBtn.textContent = `↻ Retry from batch ${bi + 1}`;
        isGenerating = false;
        generateBtn.disabled = false;
        checkReady();
        return;
      }
    }

    progressBar.style.width = '100%';
    progressLabel.textContent = `${pendingBatches.length} / ${pendingBatches.length}`;
    setTimeout(() => progressContainer.classList.remove('visible'), 1500);

    cancelBtn.style.display = 'none';
    savedRawStripUrls = [...rawStripUrls];
    savedAllFrameLabels = allFrames.map(f => f.label);
    savedBatches = [...pendingBatches];

    setStatus(`Done! ${allFrames.length} frames in ${pendingBatches.length} batches — choose split mode`, 'done');
    showSplitChooser();
  }

  // ─── MANUAL CROP ─────────────────────────────
  let manualStripImages = [];
  let manualAllLabels = [];
  let manualCropIdx = 0;
  let manualCroppedFrames = [];
  let cropX = 0, cropY = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragStartCropX = 0, dragStartCropY = 0;
  let combinedStripCanvas = null;

  function startManualCrop(stripDataUrls, labels) {
    manualAllLabels = labels;
    manualCropIdx = 0;
    manualCroppedFrames = [];
    cropX = 0; cropY = 0;

    const images = stripDataUrls.map(url => {
      const img = new Image();
      img.src = url;
      return img;
    });

    Promise.all(images.map(img => new Promise(r => { if (img.complete) r(); else img.onload = r; }))).then(() => {
      const totalW = images.reduce((s, i) => s + i.naturalWidth, 0);
      const maxH = Math.max(...images.map(i => i.naturalHeight));

      combinedStripCanvas = document.createElement('canvas');
      combinedStripCanvas.width = totalW;
      combinedStripCanvas.height = maxH;
      const ctx = combinedStripCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalW, maxH);
      let ox = 0;
      for (const img of images) { ctx.drawImage(img, ox, 0); ox += img.naturalWidth; }

      manualCropSection.classList.add('visible');
      if (spriteWidth && spriteHeight) { cropWInput.value = spriteWidth; cropHInput.value = spriteHeight; }
      drawCropCanvas();
      updateCropUI();
    });
  }

  function drawCropCanvas() {
    if (!combinedStripCanvas) return;
    const cw = parseInt(cropWInput.value) || 128;
    const ch = parseInt(cropHInput.value) || 128;

    const maxDisplayW = Math.min(1200, window.innerWidth - 500);
    const maxDisplayH = 380;
    const scaleByW = maxDisplayW / combinedStripCanvas.width;
    const scaleByH = maxDisplayH / combinedStripCanvas.height;
    const displayScale = Math.max(1, Math.min(scaleByW, scaleByH, 4));
    const dw = Math.round(combinedStripCanvas.width * displayScale);
    const dh = Math.round(combinedStripCanvas.height * displayScale);

    cropCanvas.width = dw; cropCanvas.height = dh;
    const ctx = cropCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(combinedStripCanvas, 0, 0, dw, dh);

    const rx = Math.round(cropX * displayScale), ry = Math.round(cropY * displayScale);
    const rw = Math.round(cw * displayScale), rh = Math.round(ch * displayScale);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, dw, ry);
    ctx.fillRect(0, ry + rh, dw, dh - ry - rh);
    ctx.fillRect(0, ry, rx, rh);
    ctx.fillRect(rx + rw, ry, dw - rx - rw, rh);

    ctx.strokeStyle = '#ff4d00'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(rx, ry, rw, rh); ctx.setLineDash([]);

    ctx.fillStyle = '#ff4d00';
    const hs = 6;
    [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]].forEach(([hx, hy]) => {
      ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
    });

    const ps = Math.max(2, Math.min(4, 200 / Math.max(cw, ch)));
    cropPreview.width = Math.round(cw * ps); cropPreview.height = Math.round(ch * ps);
    const pctx = cropPreview.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, cropPreview.width, cropPreview.height);
    pctx.drawImage(combinedStripCanvas, cropX, cropY, cw, ch, 0, 0, cropPreview.width, cropPreview.height);
  }

  function updateCropUI() {
    const total = manualAllLabels.length;
    const done = manualCropIdx >= total;
    cropFrameTag.textContent = done ? `All ${total} done` : `Frame ${manualCropIdx + 1} / ${total}`;
    cropFrameLabel.textContent = done ? '' : (manualAllLabels[manualCropIdx] || '');
    cropUndoBtn.disabled = manualCropIdx === 0;
    cropFinishBtn.disabled = manualCroppedFrames.length === 0;
    cropDoneBtn.disabled = done;
    cropDoneBtn.textContent = manualCropIdx >= total - 1 ? 'Crop Last Frame' : 'Crop Frame →';
  }

  cropCanvasWrap.addEventListener('mousedown', e => {
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartCropX = cropX; dragStartCropY = cropY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging || !combinedStripCanvas) return;
    const displayScale = cropCanvas.width / combinedStripCanvas.width;
    const dx = (e.clientX - dragStartX) / displayScale;
    const dy = (e.clientY - dragStartY) / displayScale;
    const cw = parseInt(cropWInput.value) || 128;
    const ch = parseInt(cropHInput.value) || 128;
    cropX = Math.max(0, Math.min(combinedStripCanvas.width - cw, Math.round(dragStartCropX + dx)));
    cropY = Math.max(0, Math.min(combinedStripCanvas.height - ch, Math.round(dragStartCropY + dy)));
    drawCropCanvas();
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  cropWInput.addEventListener('input', drawCropCanvas);
  cropHInput.addEventListener('input', drawCropCanvas);
  cropMatchSprite.addEventListener('click', () => {
    if (spriteWidth && spriteHeight) { cropWInput.value = spriteWidth; cropHInput.value = spriteHeight; drawCropCanvas(); }
  });

  cropDoneBtn.addEventListener('click', async () => {
    if (!combinedStripCanvas || manualCropIdx >= manualAllLabels.length) return;
    const cw = parseInt(cropWInput.value) || 128;
    const ch = parseInt(cropHInput.value) || 128;
    const fc = document.createElement('canvas');
    fc.width = cw; fc.height = ch;
    const fctx = fc.getContext('2d');
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, cw, ch);
    fctx.drawImage(combinedStripCanvas, cropX, cropY, cw, ch, 0, 0, cw, ch);

    const rawUrl = fc.toDataURL('image/png');
    const doRemove = removeBgCheckbox.checked;
    const displayUrl = doRemove ? await removeBackground(rawUrl, parseInt(bgThresholdInput.value) || 30) : rawUrl;

    manualCroppedFrames.push({ label: manualAllLabels[manualCropIdx], rawDataUrl: rawUrl, dataUrl: displayUrl });
    addFrameCard(manualAllLabels[manualCropIdx], displayUrl);
    manualCropIdx++;

    if (manualCropIdx < manualAllLabels.length) {
      cropX = Math.min(combinedStripCanvas.width - cw, cropX + cw);
      drawCropCanvas();
      updateCropUI();
    } else {
      updateCropUI();
      cropFinishBtn.click();
    }
  });

  cropUndoBtn.addEventListener('click', () => {
    if (manualCropIdx <= 0) return;
    manualCropIdx--;
    manualCroppedFrames.pop();
    if (framesGrid.lastChild) framesGrid.removeChild(framesGrid.lastChild);
    const cw = parseInt(cropWInput.value) || 128;
    cropX = Math.max(0, cropX - cw);
    drawCropCanvas();
    updateCropUI();
  });

  cropFinishBtn.addEventListener('click', () => {
    if (manualCropIdx === manualAllLabels.length - 1 && manualCroppedFrames.length < manualAllLabels.length) {
      cropDoneBtn.click();
    }
    manualCropSection.classList.remove('visible');
    generatedFrames = [...manualCroppedFrames];
    framesGridWrapper.classList.add('visible');
    buildSpritesheet();
    startAnimPreview();
    setStatus(`Done! ${generatedFrames.length} frames manually cropped`, 'done');
    isGenerating = false;
    generateBtn.disabled = false;
    checkReady();
  });

  // ─── FRAME CARDS ─────────────────────────────
  function addFrameCard(label, dataUrl) {
    framesGridWrapper.classList.add('visible');
    const card = document.createElement('div');
    card.className = 'frame-card';
    const imgWrapClass = removeBgCheckbox.checked ? 'frame-card-img transparent-bg' : 'frame-card-img';
    card.innerHTML = `<div class="${imgWrapClass}"><img src="${dataUrl}" /></div><div class="frame-card-label">${label}</div>`;
    framesGrid.appendChild(card);
  }

  // ─── SPRITESHEET ─────────────────────────────
  function buildSpritesheet() {
    if (!generatedFrames.length) return;
    spritesheetSection.classList.add('visible');
    const images = generatedFrames.map(f => { const i = new Image(); i.src = f.dataUrl; return i; });
    Promise.all(images.map(i => new Promise(r => { if (i.complete) r(); else i.onload = r; }))).then(() => {
      const mw = Math.max(...images.map(i => i.naturalWidth));
      const mh = Math.max(...images.map(i => i.naturalHeight));
      spritesheetCanvas.width = mw * images.length;
      spritesheetCanvas.height = mh;
      const ctx = spritesheetCanvas.getContext('2d');
      ctx.clearRect(0, 0, spritesheetCanvas.width, spritesheetCanvas.height);
      images.forEach((img, i) => {
        ctx.drawImage(img, i * mw + (mw - img.naturalWidth) / 2, (mh - img.naturalHeight) / 2);
      });
    });
  }

  // ─── ANIMATION PREVIEW ───────────────────────
  let previewImg = null;

  function ensurePreviewImg() {
    if (!previewImg || !previewArea.contains(previewImg)) {
      previewArea.classList.remove('empty');
      previewArea.innerHTML = '';
      previewImg = document.createElement('img');
      previewImg.className = 'preview-sprite';
      previewArea.appendChild(previewImg);
    }
  }

  function updateAnimFrames() {
    if (!animInterval || !generatedFrames.length) return;
    // The interval already closes over generatedFrames array, just update the src on next tick
  }

  function runAnimLoop(fps) {
    if (animInterval) clearInterval(animInterval);
    if (!generatedFrames.length) return;
    let cur = 0;
    ensurePreviewImg();
    previewImg.src = generatedFrames[0].dataUrl;
    animPreviewImg.src = generatedFrames[0].dataUrl;
    animInterval = setInterval(() => {
      cur = (cur + 1) % generatedFrames.length;
      const url = generatedFrames[cur].dataUrl;
      previewImg.src = url;
      animPreviewImg.src = url;
    }, 1000 / fps);
  }

  function startAnimPreview() {
    if (!generatedFrames.length) return;
    animPreviewBar.classList.add('visible');
    runAnimLoop(parseInt(fpsSlider.value));
  }

  fpsSlider.addEventListener('input', () => {
    const fps = parseInt(fpsSlider.value);
    fpsValue.textContent = `${fps} FPS`;
    if (generatedFrames.length) runAnimLoop(fps);
  });

  // ─── GIF EXPORT ──────────────────────────────
  downloadGifBtn.addEventListener('click', async () => {
    if (!generatedFrames.length) return;
    downloadGifBtn.textContent = 'Building GIF...';
    downloadGifBtn.disabled = true;

    const fps = parseInt(fpsSlider.value) || 8;
    const delay = Math.round(1000 / fps);

    const gif = new GIF({
      workers: 2,
      quality: 8,
      workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
    });

    for (const frame of generatedFrames) {
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = frame.dataUrl; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      gif.addFrame(c, { delay, copy: true });
    }

    gif.on('finished', blob => {
      const a = document.createElement('a');
      a.download = `${(animAction.value.trim() || 'animation').replace(/\s+/g,'_')}.gif`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
      downloadGifBtn.textContent = 'Download Animated GIF';
      downloadGifBtn.disabled = false;
    });

    gif.on('error', () => {
      alert('GIF generation failed. Make sure gif.js worker script is reachable.');
      downloadGifBtn.textContent = 'Download Animated GIF';
      downloadGifBtn.disabled = false;
    });

    gif.render();
  });

  // ─── DOWNLOADS ───────────────────────────────
  downloadSheetBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `spritesheet_${(animAction.value.trim() || 'sprite').replace(/\s+/g,'_')}.png`;
    a.href = spritesheetCanvas.toDataURL('image/png');
    a.click();
  });

  downloadZipBtn.addEventListener('click', async () => {
    if (!generatedFrames.length) return;
    const zip = new JSZip();
    const act = (animAction.value.trim() || 'frames').replace(/\s+/g,'_');
    const folder = zip.folder(`${act}_frames`);
    for (const f of generatedFrames) {
      const r = await fetch(f.dataUrl);
      folder.file(`${f.label}.png`, await r.blob());
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.download = `${act}_frames.zip`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  });

  generateBtn.addEventListener('click', generate);
})();
