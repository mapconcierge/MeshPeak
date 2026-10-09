/* MeshPeak — 標高ラスタ教育ビューア */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

  /* ================= 状態 ================= */
  const S = {
    data: [], rows: 0, cols: 0, min: 0, max: 0, mean: 0,
    size: 5, src: null, mode: 'dn', view: 'bars', exag: 1, sel: null, hover: null,
    wire: true, labels: true, drops: true, rot: true, water: false, level: 0, cellSize: 10
  };

  /* ================= カラーランプ ================= */
  const STOPS = [[0, [10, 60, 220]], [.25, [0, 200, 255]], [.5, [90, 255, 200]], [.75, [255, 214, 90]], [1, [255, 110, 0]]];
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const [t0, a] = STOPS[i - 1], [t1, b] = STOPS[i], u = (t - t0) / (t1 - t0);
        return a.map((v, k) => v + (b[k] - v) * u);
      }
    }
    return STOPS[STOPS.length - 1][1];
  }
  const rgb = (c) => `rgb(${c.map(Math.round).join(',')})`;
  const norm = (v) => (S.max === S.min ? 0.5 : (v - S.min) / (S.max - S.min));
  $('#ramp').style.background = `linear-gradient(90deg,${STOPS.map(([t, c]) => rgb(c) + ' ' + t * 100 + '%').join(',')})`;

  /* ================= ログ ================= */
  const logEl = $('#log');
  function log(msg) {
    const d = document.createElement('div');
    const t = new Date().toTimeString().slice(0, 8);
    d.innerHTML = `<i>${t}</i>` + msg.replace(/</g, '&lt;');
    logEl.appendChild(d);
    while (logEl.children.length > 6) logEl.removeChild(logEl.firstChild);
  }

  /* ================= グリッドサイズ ================= */
  // 5×5の元データを双一次補間して n×n にする(形を保ったまま細かいグリッドへ)
  function resample(d, n) {
    const m = d.length;
    if (m === n && d[0].length === n) return d.map((r) => r.slice());
    const at = (r, c) => d[Math.min(m - 1, r)][Math.min(d[0].length - 1, c)];
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
      const y = i * (m - 1) / (n - 1), x = j * (d[0].length - 1) / (n - 1);
      const y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
      return Math.round(at(y0, x0) * (1 - fy) * (1 - fx) + at(y0, x0 + 1) * (1 - fy) * fx + at(y0 + 1, x0) * fy * (1 - fx) + at(y0 + 1, x0 + 1) * fy * fx);
    }));
  }
  function syncSizeButtons() {
    const sq = S.rows === S.cols ? S.rows : 0;
    $$('[data-size]').forEach((b) => b.classList.toggle('on', +b.dataset.size === sq));
  }
  function setSize(n) {
    S.size = n;
    // サンプル由来で未編集なら元データから作り直す(5→9→5 でも情報が劣化しない)
    const base = S.src ? S.src.data : S.data;
    setData(resample(base, n), { msg: `GRID → ${n}×${n} (${n * n} CELLS)`, keepSrc: true });
  }
  $$('[data-size]').forEach((b) => b.addEventListener('click', () => setSize(+b.dataset.size)));

  /* ================= CSV ================= */
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) throw new Error('データが空です');
    const data = lines.map((l, r) => l.split(/[,;\t\s]+/).filter((x) => x !== '').map((x, c) => {
      const v = Number(x);
      if (!isFinite(v)) throw new Error(`行${r + 1} 列${c + 1}: 「${x}」は数値ではありません`);
      return v;
    }));
    const w = data[0].length;
    data.forEach((row, r) => { if (row.length !== w) throw new Error(`行${r + 1}の列数(${row.length})が1行目(${w})と一致しません`); });
    if (data.length < 2 || w < 2) throw new Error('2×2以上のグリッドが必要です');
    if (data.length > 32 || w > 32) throw new Error('32×32以下のグリッドにしてください');
    return data;
  }
  const toCSV = () => S.data.map((r) => r.join(',')).join('\n') + '\n';

  function setData(data, opts = {}) {
    if (!opts.keepSrc && !opts.sample) S.src = null;
    if (opts.sample) S.src = opts.sample;
    S.data = data; S.rows = data.length; S.cols = data[0].length;
    if (S.rows === S.cols && [5, 7, 9].includes(S.rows)) S.size = S.rows;
    const flat = data.flat();
    S.min = Math.min(...flat); S.max = Math.max(...flat);
    S.mean = flat.reduce((a, b) => a + b, 0) / flat.length;
    const w = $('#water');
    w.min = Math.floor(S.min); w.max = Math.ceil(S.max); w.step = (S.max - S.min) > 20 ? 1 : 0.1;
    if (!opts.keepLevel) { S.level = Math.floor(S.min); w.value = S.level; }
    if (S.sel && (S.sel[0] >= S.rows || S.sel[1] >= S.cols)) S.sel = null;
    $('#csvText').value = toCSV().trim();
    renderAll(opts.rebuildMatrix !== false);
    Scene.rebuild(!!opts.keepHeights);
    syncSizeButtons();
    $('#stGrid').textContent = `${S.cols}×${S.rows}`;
    $('#stCells').textContent = S.cols * S.rows;
    if (opts.msg) log(opts.msg);
  }

  /* ================= マトリクス ================= */
  const matrixEl = $('#matrix');
  let cellEls = [];
  function ranks() {
    const flat = S.data.flat().map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const r = []; flat.forEach(([, i], k) => (r[i] = k + 1)); return r;
  }
  function buildMatrix() {
    matrixEl.innerHTML = ''; cellEls = [];
    matrixEl.style.gridTemplateColumns = `repeat(${S.cols},1fr)`;
    const dense = S.cols > 6 || S.rows > 6;
    matrixEl.classList.toggle('dense', dense); $('#axisX').classList.toggle('dense', dense); $('#axisY').classList.toggle('dense', dense);
    matrixEl.style.setProperty('--dly', Math.min(28, 700 / (S.rows * S.cols)).toFixed(1) + 'ms');
    $('#axisX').style.gridTemplateColumns = `repeat(${S.cols},1fr)`;
    $('#axisY').style.gridTemplateRows = `repeat(${S.rows},1fr)`;
    $('#axisX').innerHTML = Array.from({ length: S.cols }, (_, c) => `<span>列${c}</span>`).join('');
    $('#axisY').innerHTML = Array.from({ length: S.rows }, (_, r) => `<span>行${r}</span>`).join('');
    for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) {
      const d = document.createElement('div');
      d.className = 'cell'; d.style.setProperty('--i', r * S.cols + c);
      d.dataset.r = r; d.dataset.c = c;
      d.innerHTML = '<span class="rc"></span><span class="dn"></span><span class="tag"></span><i class="bar"></i>';
      matrixEl.appendChild(d); cellEls.push(d);
    }
  }
  function renderMatrix() {
    const rk = ranks();
    S.data.forEach((row, r) => row.forEach((v, c) => {
      const i = r * S.cols + c, d = cellEls[i], t = norm(v);
      d.style.setProperty('--c', rgb(ramp(t)));
      d.style.setProperty('--t', t.toFixed(3));
      d.querySelector('.rc').textContent = `${r},${c}`;
      const dn = d.querySelector('.dn');
      dn.textContent = S.mode === 'dn' ? fmt(v) : S.mode === 'pct' ? Math.round(t * 100) + '%' : S.mode === 'rank' ? '#' + rk[i] : '';
      dn.classList.toggle('xs', S.cols > 8);
      dn.classList.toggle('sm', S.cols <= 8 && (S.cols > 6 || String(dn.textContent).length > 4));
      d.querySelector('.tag').textContent = S.mode === 'dn' ? '' : fmt(v);
      d.classList.toggle('flood', S.water && v <= S.level);
    }));
    $('#sMin').textContent = fmt(S.min); $('#sMax').textContent = fmt(S.max);
    $('#sMean').textContent = fmt(+S.mean.toFixed(1)); $('#sRange').textContent = fmt(S.max - S.min);
    $('#lgMin').textContent = fmt(S.min); $('#lgMax').textContent = fmt(S.max);
  }
  function renderAll(rebuild) { if (rebuild) buildMatrix(); renderMatrix(); renderSel(); }

  function cellAt(e) { const d = e.target.closest('.cell'); return d ? [+d.dataset.r, +d.dataset.c] : null; }
  matrixEl.addEventListener('pointerover', (e) => { const p = cellAt(e); if (p) setHover(p, 'matrix'); });
  matrixEl.addEventListener('pointerleave', () => setHover(null));
  matrixEl.addEventListener('click', (e) => { if (e.target.tagName === 'INPUT') return; const p = cellAt(e); if (p) select(p); });
  matrixEl.addEventListener('dblclick', (e) => { const p = cellAt(e); if (p) editCell(p); });

  function editCell([r, c]) {
    const d = cellEls[r * S.cols + c], dn = d.querySelector('.dn');
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = S.data[r][c]; inp.step = 'any';
    dn.style.display = 'none'; d.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const end = (ok) => {
      if (done) return; done = true;
      const v = Number(inp.value);
      inp.remove(); dn.style.display = '';
      if (ok && inp.value !== '' && isFinite(v) && v !== S.data[r][c]) {
        S.data[r][c] = v;
        setData(S.data, { keepHeights: true, keepLevel: true, rebuildMatrix: false, msg: `CELL (${r},${c}) DN → ${fmt(v)}` });
      }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); });
    inp.addEventListener('blur', () => end(true));
  }

  function setHover(p, from) {
    const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
    if (same(p, S.hover) || (!p && !S.hover)) return;
    S.hover = p;
    cellEls.forEach((d) => d.classList.remove('hover'));
    if (p) cellEls[p[0] * S.cols + p[1]].classList.add('hover');
    Scene.setHover(p);
    if (from === 'matrix' && p) hudCell(p); else if (!p) $('#hudR').textContent = '';
  }
  function hudCell([r, c]) { $('#hudR').innerHTML = `CELL (${r},${c})<br>DN ${fmt(S.data[r][c])}`; }

  function select(p) {
    const same = S.sel && S.sel[0] === p[0] && S.sel[1] === p[1];
    S.sel = same ? null : p;
    renderSel(); Scene.setSel(S.sel);
    if (S.sel) log(`SELECT (${p[0]},${p[1]}) DN=${fmt(S.data[p[0]][p[1]])}`);
  }

  /* ================= インスペクタ ================= */
  const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  function renderSel() {
    cellEls.forEach((d) => d.classList.remove('sel', 'nb'));
    const mini = $('#mini'), kv = $('#kv');
    mini.innerHTML = Array.from({ length: 9 }, () => '<div class="na">·</div>').join('');
    if (!S.sel) { kv.textContent = 'セルを選択してください'; return; }
    const [r, c] = S.sel, v = S.data[r][c];
    cellEls[r * S.cols + c].classList.add('sel');
    const win = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc, ok = rr >= 0 && cc >= 0 && rr < S.rows && cc < S.cols;
      win.push(ok ? S.data[rr][cc] : null);
      if (ok && (dr || dc)) cellEls[rr * S.cols + cc].classList.add('nb');
    }
    mini.innerHTML = win.map((x, i) => x == null ? '<div class="na">·</div>'
      : `<div class="${i === 4 ? 'ctr' : ''}" style="--c:${rgb(ramp(norm(x)))}">${fmt(x)}</div>`).join('');
    let slope = '<b>—</b> (縁のセル)', asp = '';
    if (win.every((x) => x != null)) {
      const [a, b, cc, d, , f, g, h, i] = win, cs = S.cellSize || 1;
      const dx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * cs);
      const dy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (8 * cs);
      const sl = Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI;
      slope = `<span class="o">${sl.toFixed(1)}°</span>`;
      if (sl < 0.5) asp = '平坦';
      else {
        const brg = (Math.atan2(-dx, dy) * 180 / Math.PI + 360) % 360; // 下り方向(方位)
        asp = `${DIRS[Math.round(brg / 45) % 8]}向き (${Math.round(brg)}°)`;
      }
    }
    const diff = v - S.mean;
    kv.innerHTML = `位置 <b>行${r} 列${c}</b><br>DN値 <span class="o">${fmt(v)}</span><br>平均との差 <b>${diff >= 0 ? '+' : ''}${fmt(+diff.toFixed(1))}</b><br>`
      + `順位 <b>${ranks()[r * S.cols + c]} / ${S.rows * S.cols}</b><br>傾斜 ${slope}${asp ? '<br>斜面の向き <b>' + asp + '</b>' : ''}`;
  }

  /* ================= UI ================= */
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    S.mode = b.dataset.mode; $$('[data-mode]').forEach((x) => x.classList.toggle('on', x === b)); renderMatrix();
  }));
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
    S.view = b.dataset.view; $$('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); Scene.applyVisibility();
    log(`VIEW MODE → ${S.view === 'bars' ? 'BLOCK (raster cells)' : 'SURFACE (interpolated)'}`);
  }));
  $$('[data-cam]').forEach((b) => b.addEventListener('click', () => Scene.camPreset(b.dataset.cam)));
  $('#exag').addEventListener('input', (e) => { S.exag = +e.target.value; $('#exagV').textContent = '×' + S.exag.toFixed(1); Scene.setTargets(); });
  [['#cWire', 'wire'], ['#cLabel', 'labels'], ['#cDrop', 'drops'], ['#cRot', 'rot']].forEach(([id, k]) =>
    $(id).addEventListener('change', (e) => { S[k] = e.target.checked; Scene.applyVisibility(); }));
  $('#cWater').addEventListener('change', (e) => { S.water = e.target.checked; renderMatrix(); Scene.applyVisibility(); log(S.water ? 'WATER SIM ENGAGED' : 'WATER SIM OFF'); });
  $('#water').addEventListener('input', (e) => { S.level = +e.target.value; $('#waterV').textContent = fmt(S.level); if (S.water) renderMatrix(); });
  $('#cellSize').addEventListener('input', (e) => { S.cellSize = Math.max(1, +e.target.value || 1); renderSel(); });

  function loadText(text, name) {
    try { setData(parseCSV(text), { msg: `LOADED ${name} (${S.cols}x${S.rows})` + (S.cols === S.rows && [5, 7, 9].includes(S.cols) ? '' : ' — 標準外のサイズ') }); $('#err').textContent = ''; }
    catch (e) { $('#err').textContent = '✖ ' + e.message; log('PARSE ERROR: ' + e.message); }
  }
  $('#file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) f.text().then((t) => loadText(t, f.name.toUpperCase())); e.target.value = ''; });
  $('#btnApply').addEventListener('click', () => loadText($('#csvText').value, 'PASTED TEXT'));
  $('#btnExport').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV()], { type: 'text/csv' })); a.download = 'meshpeak.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); log('EXPORT meshpeak.csv');
  });
  $('#btnRandom').addEventListener('click', () => {
    // 2〜3個の山をガウス関数で足し合わせ → ランダムでも地形っぽくなる
    const peaks = Array.from({ length: 2 + (Math.random() * 2 | 0) }, () => ({ x: Math.random() * 4, y: Math.random() * 4, h: 60 + Math.random() * 140, s: .8 + Math.random() * 1.2 }));
    const n = S.size, k = (n - 1) / 4; // ピーク位置・広がりをグリッドサイズに合わせる
    const d = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) =>
      Math.round(10 + peaks.reduce((a, p) => a + p.h * Math.exp(-((c - p.x * k) ** 2 + (r - p.y * k) ** 2) / (2 * (p.s * k) ** 2)), 0) + Math.random() * 8)));
    setData(d, { msg: 'GENERATED RANDOM TERRAIN' });
  });
  const samplesEl = $('#samples');
  window.MESH_SAMPLES.forEach((s) => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = s.name; b.title = s.desc;
    b.addEventListener('click', () => setData(resample(s.data, S.size), { sample: { id: s.id, data: s.data }, msg: `SAMPLE "${s.name}" — ${s.desc}` }));
    samplesEl.appendChild(b);
  });
  // drag & drop
  let dragN = 0; const dropEl = $('#drop');
  addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; dropEl.classList.add('show'); });
  addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; dropEl.classList.remove('show'); } });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault(); dragN = 0; dropEl.classList.remove('show');
    const f = e.dataTransfer.files[0]; if (f) f.text().then((t) => loadText(t, f.name.toUpperCase()));
  });

  /* ================= 3D シーン ================= */
  const Scene = (function () {
    const canvas = $('#gl'), host = canvas.parentElement;
    if (!window.THREE) { host.insertAdjacentHTML('beforeend', '<p style="position:absolute;inset:0;display:grid;place-items:center">WebGL library failed to load</p>'); return { rebuild() {}, setHover() {}, setSel() {}, applyVisibility() {}, setTargets() {}, camPreset() {} }; }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01060d);
    scene.fog = new THREE.FogExp2(0x01060d, 0.028);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    scene.add(new THREE.AmbientLight(0x4488aa, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(-6, 12, 8); scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xff7a00, 0.45); dl2.position.set(8, 4, -6); scene.add(dl2);

    // post: bloom
    let composer = null, bloom = null;
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.6, 0.3);
      composer.addPass(bloom);
    } catch (e) { composer = null; }

    /* --- 床グリッド (シェーダ) --- */
    const floorMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uOff: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vP;uniform float uT;uniform vec2 uOff;
        float ln(float x,float w){float d=abs(fract(x)-.5);return 1.-smoothstep(0.,w,d);}
        void main(){
          vec2 p=vP-uOff; float r=length(vP);
          float fade=exp(-r/16.);
          float g=max(ln(p.x+.5,.045),ln(p.y+.5,.045));
          float maj=max(ln((p.x+.5)/5.,.012),ln((p.y+.5)/5.,.012));
          float ring=smoothstep(.9,0.,abs(mod(r-uT*3.,14.)-.3))*.55;
          vec3 col=vec3(0.,.9,1.)*g*.55+vec3(.1,.7,1.)*maj*.9+vec3(0.,.8,1.)*ring*(.4+g);
          gl_FragColor=vec4(col*fade*1.0,1.);
        }`
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor);

    // 浮遊粒子
    const pn = 260, pp = new Float32Array(pn * 3);
    for (let i = 0; i < pn; i++) { pp[i * 3] = (Math.random() - .5) * 40; pp[i * 3 + 1] = Math.random() * 14; pp[i * 3 + 2] = (Math.random() - .5) * 40; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x66f6ff, size: 0.06, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(particles);

    // glow texture
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    { const x = gc.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
    const glowTex = new THREE.CanvasTexture(gc);

    // text sprite
    const texCache = new Map();
    function textSprite(text, color, size, font) {
      const key = text + color + font;
      let tex = texCache.get(key);
      if (!tex) {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
        const x = cv.getContext('2d'); x.font = `700 ${font || 64}px Orbitron, "Share Tech Mono", monospace`;
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = color; x.shadowBlur = 16; x.fillStyle = color;
        x.fillText(text, 128, 64); x.fillText(text, 128, 64);
        tex = new THREE.CanvasTexture(cv); texCache.set(key, tex);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(size * 2, size, 1); sp.renderOrder = 10; return sp;
    }

    /* --- 地形グループ --- */
    let root = new THREE.Group(); scene.add(root);
    let G = null; // 現在のジオメトリ情報
    const cur = { h: [], growth: 0 };
    const hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    const selBox = new THREE.LineSegments(hoverBox.geometry, new THREE.LineBasicMaterial({ color: 0xff7a00 }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: .8, blending: THREE.AdditiveBlending }));
    const waterPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a7bff, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const waterEdge = new THREE.LineSegments(new THREE.EdgesGeometry(waterPlane.geometry), new THREE.LineBasicMaterial({ color: 0x6fb4ff }));
    for (const o of [hoverBox, selBox, beam, waterPlane, waterEdge]) { o.visible = false; scene.add(o); }
    let H0 = 3; // 基準の最大高

    const px = (c) => c - (S.cols - 1) / 2, pz = (r) => r - (S.rows - 1) / 2;
    const targetH = (r, c) => 0.08 + norm(S.data[r][c]) * H0 * S.exag;
    const levelH = () => 0.08 + norm(S.level) * H0 * S.exag;

    function disposeRoot() {
      root.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material && !o.userData.keepMat) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
      scene.remove(root); root = new THREE.Group(); scene.add(root);
    }

    function rebuild(keepHeights) {
      const R = S.rows, C = S.cols;
      H0 = 0.75 * (Math.max(R, C) - 1);
      const old = cur.h.length === R * C && keepHeights ? cur.h.slice() : null;
      disposeRoot();
      G = { bars: new THREE.Group(), surf: new THREE.Group(), common: new THREE.Group(), barMeshes: [], labels: [], drops: [] };
      root.add(G.bars, G.surf, G.common);
      cur.h = old || new Array(R * C).fill(0.0);
      if (!old) cur.growth = 0;
      floorMat.uniforms.uOff.value.set((C % 2) ? 0 : 0.5, (R % 2) ? 0 : 0.5);
      waterPlane.scale.set(C + 0.4, 1, R + 0.4); waterEdge.scale.copy(waterPlane.scale);
      selBox.visible = hoverBox.visible = false; hoverBox.userData.cell = null;

      // バー
      const boxGeo = new THREE.BoxGeometry(1, 1, 1), edgeGeo = new THREE.EdgesGeometry(boxGeo);
      G.barGeo = boxGeo; G.edgeGeo = edgeGeo;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const col = new THREE.Color(...ramp(norm(S.data[r][c])).map((v) => v / 255));
        const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.55), emissive: col.clone().multiplyScalar(0.35), transparent: true, opacity: .86 }));
        m.userData = { r, c, shared: true };
        m.scale.set(0.86, 0.01, 0.86);
        const e = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), .35) }));
        m.add(e); e.userData.shared = true; e.userData.role = 'wire';
        G.bars.add(m); G.barMeshes.push(m);
      }
      // サーフェス
      const pos = new Float32Array(R * C * 3), colA = new Float32Array(R * C * 3);
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const i = r * C + c; pos[i * 3] = px(c); pos[i * 3 + 2] = pz(r);
        const k = ramp(norm(S.data[r][c])); colA.set(k.map((v) => v / 255), i * 3);
      }
      const idx = [], lidx = [];
      for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const a = r * C + c; if (c < C - 1) lidx.push(a, a + 1); if (r < R - 1) lidx.push(a, a + C); }
      const sg = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(pos, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
      sg.setAttribute('position', posAttr); sg.setAttribute('color', new THREE.BufferAttribute(colA, 3)); sg.setIndex(idx);
      G.surfGeo = sg; G.posAttr = posAttr;
      G.surfMesh = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .55, side: THREE.DoubleSide, emissive: 0x000000 }));
      G.surf.add(G.surfMesh);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', posAttr); lg.setAttribute('color', new THREE.BufferAttribute(colA, 3)); lg.setIndex(lidx);
      G.surfWire = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true })); G.surf.add(G.surfWire);
      G.surfWire.userData.role = 'wire';
      G.pts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.34, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); G.surf.add(G.pts);

      // ラベル・落下線・行列番号
      const dropPos = new Float32Array(R * C * 6);
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const s = textSprite(fmt(S.data[r][c]), '#ffffff', 0.4, 60); G.common.add(s); G.labels.push(s);
      }
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
      G.dropGeo = dg; G.dropLines = new THREE.LineSegments(dg, new THREE.LineDashedMaterial({ color: 0x00f0ff, dashSize: .12, gapSize: .1, transparent: true, opacity: .5 }));
      G.common.add(G.dropLines);
      for (let c = 0; c < C; c++) { const s = textSprite('C' + c, '#00f0ff', 0.4, 56); s.position.set(px(c), 0.05, pz(R - 1) + 1.0); s.material.depthTest = true; G.common.add(s); }
      for (let r = 0; r < R; r++) { const s = textSprite('R' + r, '#ff7a00', 0.4, 56); s.position.set(px(0) - 1.0, 0.05, pz(r)); s.material.depthTest = true; G.common.add(s); }
      const n = textSprite('N ▲', '#ffc24a', 0.55, 60); n.position.set(0, 0.05, pz(0) - 1.25); G.common.add(n);

      // フットプリント枠
      const fp = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(C, R).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0x00f0ff }));
      fp.position.y = 0.01; fp.userData.shared = false; G.common.add(fp);

      applyVisibility(); applyHeights(); fitCamera();
      if (S.sel) setSel(S.sel);
    }

    function applyVisibility() {
      if (!G) return;
      G.bars.visible = S.view === 'bars'; G.surf.visible = S.view === 'surf';
      G.bars.traverse((o) => { if (o.userData.role === 'wire') o.visible = S.wire; });
      G.surfWire.visible = S.wire;
      G.labels.forEach((s) => (s.visible = S.labels)); G.dropLines.visible = S.drops;
      waterPlane.visible = waterEdge.visible = S.water;
    }
    function setTargets() { /* 目標高さはフレームごとに targetH() で参照 */ }

    function applyHeights() {
      if (!G) return;
      const R = S.rows, C = S.cols, dp = G.dropGeo.attributes.position.array;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const i = r * C + c, h = cur.h[i], m = G.barMeshes[i];
        m.scale.y = Math.max(h, 0.01); m.position.set(px(c), h / 2, pz(r));
        G.posAttr.setY(i, h);
        G.labels[i].position.set(px(c), h + 0.5, pz(r));
        dp.set([px(c), 0, pz(r), px(c), h, pz(r)], i * 6);
      }
      G.posAttr.needsUpdate = true; G.surfGeo.computeVertexNormals();
      G.dropGeo.attributes.position.needsUpdate = true; G.dropLines.computeLineDistances();
      updateMarkers();
    }
    function updateMarkers() {
      const place = (box, p, hh) => { box.position.set(px(p[1]), 0.02, pz(p[0])); box.scale.set(1, 1, 1); };
      if (hoverBox.userData.cell) { place(hoverBox, hoverBox.userData.cell); hoverBox.visible = true; } else hoverBox.visible = false;
      if (S.sel) {
        place(selBox, S.sel); selBox.visible = true;
        const h = cur.h[S.sel[0] * S.cols + S.sel[1]] + 1.4;
        beam.scale.set(1, h, 1); beam.position.set(px(S.sel[1]), h / 2, pz(S.sel[0])); beam.visible = true;
      } else selBox.visible = beam.visible = false;
    }
    function setHover(p) { hoverBox.userData.cell = p; updateMarkers(); }
    function setSel() { updateMarkers(); }

    /* --- カメラ (自前オービット) --- */
    let fitKey = '';
    const cam = { th: .7, ph: 1.0, rad: 11, tth: .7, tph: 1.0, trad: 11, auto: true, idle: 0 };
    function fitCamera() { cam.trad = Math.max(S.cols, S.rows) * 2.1 + 2.5; if (fitKey !== S.rows + 'x' + S.cols) { cam.rad = cam.trad * 1.6; fitKey = S.rows + 'x' + S.cols; } }
    function camPreset(k) {
      S.rot = false; $('#cRot').checked = false;
      if (k === 'iso') { cam.tth = .7; cam.tph = 1.0; } else if (k === 'top') { cam.tth = 0; cam.tph = 0.001; } else { cam.tth = 0; cam.tph = Math.PI / 2 - 0.06; }
      cam.th = ((cam.th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); if (cam.th > Math.PI) cam.th -= Math.PI * 2;
      log('CAMERA → ' + k.toUpperCase());
    }
    const ptrs = new Map(); let down = null, moved = false, pinch = 0;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); down = [e.clientX, e.clientY]; moved = false; if (ptrs.size === 2) pinch = pdist(); });
    canvas.addEventListener('pointermove', (e) => {
      const prev = ptrs.get(e.pointerId);
      if (prev) {
        const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (ptrs.size === 1) {
          if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) moved = true;
          cam.tth -= dx * 0.008; cam.th = cam.tth; cam.tph = Math.max(0.001, Math.min(Math.PI / 2 - 0.02, cam.tph - dy * 0.008)); cam.ph = cam.tph;
        } else if (ptrs.size === 2) { const d = pdist(); cam.trad = clampR(cam.trad * pinch / d); pinch = d; moved = true; }
      } else pick(e, false);
    });
    const pdist = () => { const a = [...ptrs.values()]; return Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1; };
    const clampR = (r) => Math.max(4, Math.min(60, r));
    canvas.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (!moved && ptrs.size === 0) pick(e, true); });
    canvas.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
    canvas.addEventListener('pointerleave', () => { if (!ptrs.size) { tip.style.display = 'none'; setHover(null); S.hover = null; cellEls.forEach((d) => d.classList.remove('hover')); } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.trad = clampR(cam.trad * (1 + e.deltaY * 0.001)); }, { passive: false });

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = $('#tip');
    function pick(e, click) {
      if (!G) return;
      const rc = canvas.getBoundingClientRect();
      mouse.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      let cell = null;
      if (S.view === 'bars') {
        const hit = ray.intersectObjects(G.barMeshes, false)[0];
        if (hit) cell = [hit.object.userData.r, hit.object.userData.c];
      } else {
        const hit = ray.intersectObject(G.surfMesh, false)[0];
        if (hit) cell = [Math.max(0, Math.min(S.rows - 1, Math.round(hit.point.z + (S.rows - 1) / 2))), Math.max(0, Math.min(S.cols - 1, Math.round(hit.point.x + (S.cols - 1) / 2)))];
      }
      if (click) { if (cell) select(cell); return; }
      setHover(cell);
      // matrix 側ハイライトのみ同期 (setHover は Scene を再呼出しないよう直接処理)
      S.hover = cell; cellEls.forEach((d) => d.classList.remove('hover'));
      if (cell) {
        cellEls[cell[0] * S.cols + cell[1]].classList.add('hover'); hudCell(cell);
        tip.style.display = 'block'; tip.style.left = e.clientX - rc.left + 'px'; tip.style.top = e.clientY - rc.top + 'px';
        tip.innerHTML = `(${cell[0]},${cell[1]}) &nbsp;DN <b>${fmt(S.data[cell[0]][cell[1]])}</b>`;
      } else { tip.style.display = 'none'; $('#hudR').textContent = ''; }
    }

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false); if (composer) composer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host); resize();

    /* --- ループ --- */
    const clock = new THREE.Clock(); let fps = 60, acc = 0;
    function loop() {
      requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      floorMat.uniforms.uT.value = t;
      if (S.rot && !ptrs.size) { cam.tth += dt * 0.12; cam.th = cam.th + (cam.tth - cam.th) * Math.min(1, dt * 6); }
      else { cam.th += (cam.tth - cam.th) * Math.min(1, dt * 5); }
      cam.ph += (cam.tph - cam.ph) * Math.min(1, dt * 5);
      cam.rad += (cam.trad - cam.rad) * Math.min(1, dt * 4);
      const cy = Math.max(S.max === S.min ? 0 : 0, 0) + H0 * 0.25;
      camera.position.set(Math.sin(cam.th) * Math.sin(cam.ph) * cam.rad, cy + Math.cos(cam.ph) * cam.rad, Math.cos(cam.th) * Math.sin(cam.ph) * cam.rad);
      camera.lookAt(0, cy * 0.55, 0);
      if (G) {
        let changed = false;
        for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) {
          const i = r * S.cols + c, tgt = targetH(r, c);
          // 左上から順に立ち上がる演出
          const delay = (r + c) * 0.06;
          const k = Math.min(1, Math.max(0, (cur.growth - delay) * 1.8));
          const goal = tgt * (cur.growth >= 3 ? 1 : k);
          if (Math.abs(goal - cur.h[i]) > 0.0005) { cur.h[i] += (goal - cur.h[i]) * Math.min(1, dt * 7); changed = true; }
        }
        if (cur.growth < 3) cur.growth += dt * 1.2;
        if (changed) applyHeights();
        // 色の更新(編集時)は rebuild で行う
        if (S.water) { const y = levelH(); waterPlane.position.y = waterEdge.position.y = y; waterPlane.material.opacity = .26 + .08 * Math.sin(t * 3); }
        beam.material.opacity = .55 + .3 * Math.sin(t * 5);
        selBox.material.color.setHSL(.07, 1, .5 + .15 * Math.sin(t * 6));
        particles.rotation.y = t * 0.02; particles.position.y = Math.sin(t * .5) * .2;
      }
      acc += dt; fps = fps * .9 + (1 / Math.max(dt, 1e-3)) * .1;
      if (acc > .25) { acc = 0; $('#hudL').innerHTML = `AZ ${(((cam.th * 180 / Math.PI) % 360) + 360) % 360 | 0}° &nbsp;EL ${(90 - cam.ph * 180 / Math.PI) | 0}°<br>ZOOM ${cam.rad.toFixed(1)} &nbsp;FPS ${fps | 0}`; }
      if (composer) composer.render(); else renderer.render(scene, camera);
    }
    loop();
    return { rebuild, setHover, setSel, applyVisibility, setTargets, camPreset };
  })();

  /* ================= 起動 ================= */
  function boot() {
    const el = $('#boot'), pre = $('#bootText');
    const lines = ['> MESHPEAK // FURUHASHI LAB.', '> INITIALIZING RASTER ENGINE ........ OK', '> LOADING ELEVATION MATRIX ......... OK', '> MOUNTING 3D TERRAIN RENDERER ..... OK', '> WELCOME, USER.'];
    let i = 0, j = 0, finished = false;
    const done = () => { if (finished) return; finished = true; el.classList.add('done'); };
    el.addEventListener('click', done);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    (function type() {
      if (finished) return;
      if (i >= lines.length) return setTimeout(done, 450);
      pre.textContent = lines.slice(0, i).join('\n') + (i ? '\n' : '') + lines[i].slice(0, ++j);
      if (j >= lines[i].length) { i++; j = 0; setTimeout(type, 120); } else setTimeout(type, 14);
    })();
  }

  setData(window.MESH_SAMPLES[0].data.map((r) => r.slice()), { sample: { id: 'volcano', data: window.MESH_SAMPLES[0].data }, msg: 'SAMPLE "火山" LOADED — SYSTEM READY' });
  log('ドラッグで3Dを回転 / セルをクリックで解析');
  boot();
})();
