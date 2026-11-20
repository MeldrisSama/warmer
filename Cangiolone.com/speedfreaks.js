'use strict';

// A queued callback can still carry the last film frame after a loop or seek.
function revealFrameTime(video, sample) {
  return Number.isFinite(sample) && Math.abs(sample - video.currentTime) < .25 ? sample : video.currentTime;
}

class SpeedFreeksOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.texture = document.createElement('canvas');
    this.texture.width = 224;
    this.texture.height = 124;
  }

  setNames(round, first, second) {
    const ink = this.texture.getContext('2d');
    ink.clearRect(0, 0, 224, 124);
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.fillStyle = '#ffe69b';
    ink.shadowColor = '#372316';
    ink.shadowOffsetX = ink.shadowOffsetY = 1;
    ink.font = 'bold 9px monospace';
    ink.fillText(`GIORNATA ${round}`, 77, 17);
    [[first, 42, 20], ['VS', 61, 9], [second, 82, 20]].forEach(([text, y, start]) => {
      let size = start;
      ink.font = `bold ${size}px monospace`;
      while (size > 7 && ink.measureText(text).width > 134) ink.font = `bold ${--size}px monospace`;
      ink.fillText(text, 77, y, 134);
    });
  }

  setMotion(data) {
    if (!Number.isFinite(data?.fps) || data.fps <= 0 || data.fps > 120 ||
        !Array.isArray(data.frames) || !data.frames.length || data.frames.length > 3600 ||
        data.frames.some(frame => typeof frame.front !== 'boolean' || !Array.isArray(frame.quad) ||
          frame.quad.length !== 4 || frame.quad.some(point => !Array.isArray(point) || point.length !== 2 ||
            point.some(value => !Number.isFinite(value) || Math.abs(value) > 100000)))) {
      throw new Error('Animazione non disponibile.');
    }
    this.motion = data;
  }

  load(url) {
    this.loading ??= fetch(url).then(response => {
      if (!response.ok) throw new Error('Animazione non disponibile.');
      return response.json();
    }).then(data => this.setMotion(data)).catch(error => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  clear() {
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  projection(quad) {
    const rows = [];
    [[0, 0], [224, 0], [224, 124], [0, 124]].forEach(([u, v], i) => {
      const [x, y] = quad[i];
      rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x], [0, 0, 0, u, v, 1, -y * u, -y * v, y]);
    });
    for (let c = 0; c < 8; c++) {
      let pivot = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
      [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
      const factor = rows[c][c];
      if (Math.abs(factor) < 1e-8) return null;
      rows[c] = rows[c].map(value => value / factor);
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const factor = rows[r][c];
        rows[r] = rows[r].map((value, k) => value - factor * rows[c][k]);
      }
    }
    const h = rows.map(row => row[8]);
    return (u, v) => {
      const w = h[6] * u + h[7] * v + 1;
      return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
    };
  }

  triangle(source, destination) {
    const ctx = this.context;
    const [s0, s1, s2] = source, [p0, p1, p2] = destination;
    const u1 = s1[0] - s0[0], v1 = s1[1] - s0[1], u2 = s2[0] - s0[0], v2 = s2[1] - s0[1];
    const det = u1 * v2 - u2 * v1;
    const x1 = p1[0] - p0[0], y1 = p1[1] - p0[1], x2 = p2[0] - p0[0], y2 = p2[1] - p0[1];
    const a = (x1 * v2 - x2 * v1) / det, c = (-x1 * u2 + x2 * u1) / det;
    const b = (y1 * v2 - y2 * v1) / det, d = (-y1 * u2 + y2 * u1) / det;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, p0[0] - a * s0[0] - c * s0[1], p0[1] - b * s0[0] - d * s0[1]);
    ctx.drawImage(this.texture, 0, 0);
    ctx.restore();
  }

  draw(time) {
    this.clear();
    if (!this.motion) return;
    const index = Math.min(this.motion.frames.length - 1, Math.max(0, Math.floor(time * this.motion.fps + .001)));
    const frame = this.motion.frames[index];
    if (!frame.front) return;
    const project = this.projection(frame.quad);
    if (!project) return;
    const ctx = this.context;
    ctx.save();
    ctx.scale(this.canvas.width / 256, this.canvas.height / 144);
    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < 12; row++) for (let col = 0; col < 8; col++) {
      const u = col * 28, v = row * 124 / 12;
      const source = [[u, v], [u + 28, v], [u + 28, v + 124 / 12], [u, v + 124 / 12]];
      const p = source.map(point => project(...point));
      this.triangle([source[0], source[1], source[2]], [p[0], p[1], p[2]]);
      this.triangle([source[0], source[2], source[3]], [p[0], p[2], p[3]]);
    }
    ctx.restore();
  }
}
