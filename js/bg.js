/* TRON風 背景: 遠近グリッド + ライトサイクルの軌跡 + 粒子 */
(function () {
  const cv = document.getElementById('bg'), g = cv.getContext('2d');
  let W, H, dpr, t = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cycles = [], stars = [];
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
  }
  addEventListener('resize', resize); resize();
  for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random() * .5, s: Math.random() * 1.5 + .3, p: Math.random() * 6 });
  function spawn() {
    const col = Math.random() < .7 ? [0, 240, 255] : [255, 122, 0];
    cycles.push({ lane: Math.round((Math.random() - .5) * 24), z: 0.02 + Math.random() * .1, dir: Math.random() < .5 ? 1 : -1,
      x: -14 * (Math.random() < .5 ? 1 : -1), sp: 8 + Math.random() * 10, col, tail: 4 + Math.random() * 6, life: 0 });
  }
  // 地面は y=0 平面。カメラ高さ1、焦点距離f。x(横),z(奥行き) → 画面
  function proj(x, z) {
    const hz = H * 0.42, f = H * 0.55;
    return [W / 2 + (x / z) * f, hz + (1 / z) * f * .5];
  }
  function frame() {
    t += reduce ? 0 : 0.016;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#000611'); grad.addColorStop(.42, '#02121f'); grad.addColorStop(1, '#00060c');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // stars
    for (const s of stars) {
      g.fillStyle = `rgba(160,240,255,${.25 + .35 * Math.sin(t * 2 + s.p)})`;
      g.fillRect(s.x * W, s.y * H, s.s * dpr, s.s * dpr);
    }
    const hz = H * 0.42;
    // horizon glow
    const hg = g.createLinearGradient(0, hz - 140 * dpr, 0, hz + 20 * dpr);
    hg.addColorStop(0, 'rgba(0,240,255,0)'); hg.addColorStop(1, 'rgba(0,240,255,.22)');
    g.fillStyle = hg; g.fillRect(0, hz - 140 * dpr, W, 160 * dpr);
    // 遠景のシルエット(ワイヤーフレームの山)
    g.strokeStyle = 'rgba(0,240,255,.25)'; g.lineWidth = dpr; g.beginPath();
    for (let x = 0; x <= W; x += 14 * dpr) {
      const u = x / W * 9;
      const y = hz - (Math.abs(Math.sin(u * 1.3) * 26 + Math.sin(u * 3.1 + 1) * 12) + 6) * dpr;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    // 地面
    g.save(); g.beginPath(); g.rect(0, hz, W, H - hz); g.clip();
    g.fillStyle = 'rgba(0,12,22,.9)'; g.fillRect(0, hz, W, H - hz);
    g.lineWidth = dpr;
    // 奥行き方向の線(横線) 流れる
    const off = (t * 1.2) % 1;
    for (let i = 0; i < 40; i++) {
      const z = 0.02 + Math.pow((i + (1 - off)) / 40, 2.2) * 6; // 近いほど間隔が広い
      const [, y] = proj(0, z);
      const a = Math.min(1, 1 / (z * 1.4)) * .5;
      g.strokeStyle = `rgba(0,240,255,${Math.min(.55, a)})`;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    // 放射状の線
    for (let k = -30; k <= 30; k++) {
      const [x1, y1] = proj(k, 6), [x2, y2] = proj(k, 0.02);
      const gg = g.createLinearGradient(0, y1, 0, y2);
      gg.addColorStop(0, 'rgba(0,240,255,0)'); gg.addColorStop(1, 'rgba(0,240,255,.5)');
      g.strokeStyle = gg; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    // ライトサイクル
    if (!reduce && cycles.length < 6 && Math.random() < .02) spawn();
    g.globalCompositeOperation = 'lighter';
    for (let i = cycles.length - 1; i >= 0; i--) {
      const c = cycles[i];
      c.x += c.dir * c.sp * .016; c.life += .016;
      const z = 0.05 + (Math.abs(c.lane) % 6) * .22 + c.z;
      const head = proj(c.x, z), tail = proj(c.x - c.dir * c.tail, z);
      const lg = g.createLinearGradient(tail[0], 0, head[0], 0);
      lg.addColorStop(0, `rgba(${c.col},0)`); lg.addColorStop(1, `rgba(${c.col},.95)`);
      g.strokeStyle = lg; g.lineWidth = 3 * dpr; g.shadowColor = `rgb(${c.col})`; g.shadowBlur = 14 * dpr;
      g.beginPath(); g.moveTo(tail[0], tail[1]); g.lineTo(head[0], head[1]); g.stroke();
      g.shadowBlur = 0;
      if (Math.abs(c.x) > 40) cycles.splice(i, 1);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
    requestAnimationFrame(frame);
  }
  frame();
})();
