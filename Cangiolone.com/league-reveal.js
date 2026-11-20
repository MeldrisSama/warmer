'use strict';

const revealAnimations = {
  warp: { times: [3.59, 3.92, 4.14, 4.37], ready: 4.61 },
  bolter: { times: [5.2, 5.2, 5.2, 5.2], ready: 5.2 },
  orks: { times: [4.98, 4.98, 4.98, 4.98], ready: 4.98 }
};

// Kept separate from fixture ordering: future choices can depend on a player or be random.
function animationForFixture(fixture, preference) {
  return Object.hasOwn(revealAnimations, preference) ? preference : 'warp';
}

class BolterEngraving {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.texture = document.createElement('canvas');
    this.texture.width = 174;
    this.texture.height = 112;
    this.layer = document.createElement('canvas');
  }

  setNames(round, first, second) {
    const ctx = this.texture.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 174, 112);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [`GIORNATA ${round}`, first, 'VS', second].forEach((text, index) => {
      let size = index === 0 || index === 2 ? 12 : 18;
      ctx.font = `bold ${size}px Consolas, monospace`;
      while (size > 5 && ctx.measureText(text).width > 168) ctx.font = `bold ${--size}px Consolas, monospace`;
      ctx.fillText(text, 87, [17, 42, 65, 89][index], 168);
    });
    this.mask = ctx.getImageData(0, 0, 174, 112).data;
  }

  draw(time) {
    const ctx = this.context;
    ctx.clearRect(0, 0, 640, 360);
    if (!this.mask || time < 2) return;
    const t = Math.floor(Math.min(time, 7 - 1 / 30) * 30) / 30;
    const age = t - 1.43;
    const ease = (a, b, value) => { const p = Math.min(1, Math.max(0, (value - a) / (b - a))); return p * p * (3 - 2 * p); };
    const wrap = angle => ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const tracking = ease(.11, .55, age);
    const zoom = 1 + 3.68 * ease(.28, 1.46, age);
    const muzzle = 268 - 99 * ease(.12, 1.39, t);
    const world = muzzle + 303 * age + 105 * age ** 2 - 23.5;
    const cx = 193 + (world - (world - 193) * tracking - 193) * zoom;
    const kick = Math.exp(-age * 10) * Math.sin(44 * age);
    const cy = 75 + 13 * ease(.12, 1.39, t) + 3 * kick + tracking * (1.5 * Math.sin(t * 3.4) + .55 * Math.sin(t * 8.1));
    const tilt = .52 * Math.sin(t * 5.6) + .24 * Math.sin(t * 9.2);
    const roll = -1.05 + .92 * age - .58 * Math.max(0, age - 3.9) ** 1.7 + .075 * Math.sin(age * 2.8) + .026 * Math.sin(age * 7.7);
    const length = Math.round(47 * zoom);
    const radius = length * .193;
    this.layer.width = length;
    this.layer.height = Math.ceil(radius * 2) + 2;
    const layer = this.layer.getContext('2d');
    const image = layer.createImageData(length, this.layer.height);
    const mid = Math.floor(this.layer.height / 2);
    for (let x = Math.ceil(length * .315); x < length * .665; x++) {
      const u = x / (length - 1);
      const tx = Math.floor((u - .315) * 174 / .35);
      if (tx < 0 || tx >= 174) continue;
      for (let y = Math.max(0, mid - Math.floor(radius)); y <= Math.min(this.layer.height - 1, mid + Math.floor(radius)); y++) {
        const alpha = Math.asin((y - mid) / radius);
        let angle = wrap(alpha + roll);
        if (Math.abs(angle) <= Math.PI / 2) continue; // The Aquila is already in the film on this side.
        angle = wrap(angle - Math.PI);
        if (Math.abs(angle) >= .72) continue;
        const ty = Math.floor((angle / 1.5 + .5) * 112);
        const ink = this.mask[(ty * 174 + tx) * 4 + 3] >= 100;
        const edge = ty > 1 && this.mask[((ty - 1) * 174 + tx) * 4 + 3] >= 100;
        if (!ink && !edge) continue;
        const color = ink ? [42, 24, 18] : [250, 197, 67];
        image.data.set([...color, 255], (y * length + x) * 4);
      }
    }
    layer.putImageData(image, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(2, 2);
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(-tilt * Math.PI / 180);
    ctx.drawImage(this.layer, -length / 2, -this.layer.height / 2);
    ctx.restore();
  }
}

// The same silent film is reused for every fixture; player names remain plain DOM text.
class LeagueReveal {
  constructor() {
    this.dialog = document.getElementById('league-reveal');
    this.video = document.getElementById('reveal-video');
    this.stage = document.getElementById('reveal-stage');
    this.day = document.getElementById('reveal-day');
    this.first = document.getElementById('reveal-first');
    this.versus = document.getElementById('reveal-versus');
    this.second = document.getElementById('reveal-second');
    this.progress = document.getElementById('reveal-progress');
    this.pause = document.getElementById('reveal-pause');
    this.next = document.getElementById('reveal-next');
    this.animation = document.getElementById('reveal-animation');
    this.canvas = document.getElementById('reveal-engraving');
    this.animation.addEventListener('change', () => { if (this.dialog.open) this.showFixture(); });
    this.video.addEventListener('seeking', () => { this.stopFrames(); this.clearCanvas(); });
    this.video.addEventListener('seeked', () => { this.sync(); this.drawFrames(); });
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.video.addEventListener('timeupdate', () => this.sync());
    this.video.addEventListener('ended', () => this.showNames());
    this.video.addEventListener('error', () => this.showNames());
    this.pause.addEventListener('click', () => {
      if (this.video.paused) this.play();
      else this.video.pause();
    });
    this.video.addEventListener('play', () => { this.pause.textContent = 'Pausa'; this.drawFrames(); });
    this.video.addEventListener('pause', () => { this.pause.textContent = 'Riprendi'; this.stopFrames(); });
    document.getElementById('reveal-now').addEventListener('click', () => this.showNames());
    this.next.addEventListener('click', () => {
      if (this.index + 1 < this.fixtures.length) {
        this.index++;
        this.showFixture();
      } else this.dialog.close();
    });
    document.getElementById('reveal-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => {
      this.playbackToken = null;
      this.renderToken = null;
      this.video.pause();
      this.stopFrames();
      this.clearCanvas();
      this.onClose?.();
    });
    this.motion.addEventListener('change', () => {
      if (this.motion.matches && this.dialog.open) this.showNames();
    });
  }

  open({ round, fixtures, users, onClose }) {
    if (this.dialog.open) return;
    this.fixtures = fixtures.filter(fixture => fixture.round === round && fixture.b !== null);
    if (!this.fixtures.length) return;
    this.users = new Map(users.map(user => [user.id, user.name]));
    const byes = fixtures.filter(fixture => fixture.round === round && fixture.b === null);
    document.getElementById('reveal-bye').textContent = byes.length
      ? `Riposo: ${byes.map(fixture => this.users.get(fixture.a) || 'Giocatore').join(', ')}` : '';
    this.round = round;
    this.index = 0;
    this.onClose = onClose;
    this.dialog.showModal();
    this.showFixture();
  }

  showFixture() {
    this.video.pause();
    this.stopFrames();
    this.clearCanvas();
    const renderToken = this.renderToken = {};
    this.playbackToken = null;
    const fixture = this.fixtures[this.index];
    this.kind = animationForFixture(fixture, this.animation.value);
    this.config = revealAnimations[this.kind];
    const source = this.video.dataset[this.kind];
    if (this.video.getAttribute('src') !== source) this.video.setAttribute('src', source);
    this.video.currentTime = 0;
    this.immediate = false;
    this.stage.classList.toggle('bolter', this.kind === 'bolter');
    this.stage.classList.toggle('orks', this.kind === 'orks');
    this.stage.classList.toggle('film', this.kind === 'bolter' || this.kind === 'orks');
    this.canvas.hidden = this.kind === 'warp' || this.motion.matches;
    this.day.textContent = `Giornata ${this.round}`;
    this.first.textContent = this.users.get(fixture.a) || 'Giocatore';
    this.versus.textContent = 'VS';
    this.second.textContent = this.users.get(fixture.b) || 'Giocatore';
    if (this.kind === 'bolter') {
      this.engraving ??= new BolterEngraving(this.canvas);
      this.painter = this.engraving;
    } else if (this.kind === 'orks') {
      this.speedFreeks ??= new SpeedFreeksOverlay(this.canvas);
      this.painter = this.speedFreeks;
      if (!this.motion.matches) this.speedFreeks.load(this.video.dataset.orksMotion).then(() => {
        if (this.renderToken === renderToken && this.dialog.open) this.sync();
      }).catch(() => {
        if (this.renderToken === renderToken && this.dialog.open) this.showNames();
      });
    } else {
      this.painter = null;
    }
    this.painter?.setNames(this.round, this.first.textContent, this.second.textContent);
    this.progress.textContent = `Abbinamento ${this.index + 1} di ${this.fixtures.length}`;
    this.next.textContent = this.index + 1 < this.fixtures.length ? 'Prossimo abbinamento' : 'Vai alla giornata';
    this.next.disabled = true;
    this.pause.hidden = this.motion.matches;
    this.stage.classList.toggle('still', this.motion.matches);
    this.sync();
    if (this.motion.matches) this.showNames();
    else this.play();
  }

  play() {
    const token = this.playbackToken = {};
    this.video.play().catch(() => {
      // A missing film or refused playback must never hide an existing pairing.
      if (this.dialog.open && this.playbackToken === token) this.showNames();
    });
  }

  sync() {
    const time = this.immediate ? Infinity : this.video.currentTime;
    [this.day, this.first, this.versus, this.second].forEach((node, index) => {
      node.hidden = time < this.config.times[index];
    });
    this.painter?.draw(this.video.currentTime);
    if (time >= this.config.ready) this.next.disabled = false;
    if (time >= this.config.ready) {
      document.getElementById('reveal-announcement').textContent =
        `${this.day.textContent}: ${this.first.textContent}, ${this.second.textContent}.`;
    } else document.getElementById('reveal-announcement').textContent = '';
  }

  showNames() {
    this.stage.classList.toggle('still', this.motion.matches);
    this.canvas.hidden = this.kind === 'warp' || this.motion.matches;
    this.video.pause();
    this.immediate = true;
    this.pause.hidden = true;
    this.sync();
  }

  drawFrames() {
    this.stopFrames();
    if (!this.painter || this.video.paused || !this.dialog.open) return;
    const epoch = this.frameEpoch;
    const draw = (_, frame) => {
      if (this.frameEpoch !== epoch) return;
      this.painter.draw(revealFrameTime(this.video, frame?.mediaTime));
      if (!this.video.paused && this.dialog.open) this.scheduleFrame(draw);
    };
    this.scheduleFrame(draw);
  }

  scheduleFrame(draw) {
    this.frameId = this.video.requestVideoFrameCallback
      ? this.video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
  }

  stopFrames() {
    this.frameEpoch = (this.frameEpoch || 0) + 1;
    if (this.frameId === undefined) return;
    if (this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.frameId);
    else cancelAnimationFrame(this.frameId);
    this.frameId = undefined;
  }

  clearCanvas() {
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
