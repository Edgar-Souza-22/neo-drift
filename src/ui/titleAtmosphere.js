import Phaser from 'phaser';

const DUST_COUNT = 22;

export function paintTitleBackdrop(scene) {
  const w = scene.scale.width;
  const h = scene.scale.height;

  const bg = scene.add.graphics().setDepth(0);
  bg.fillGradientStyle(0x080a14, 0x080a14, 0x121a32, 0x0e162c, 1);
  bg.fillRect(0, 0, w, h);

  const floor = scene.add.graphics().setDepth(1);
  const horizon = h * 0.40;
  const vanishX = w / 2;
  floor.lineStyle(1, 0x37f0ff, 0.10);
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    const y = horizon + (h - horizon) * (t * t);
    floor.lineBetween(0, y, w, y);
  }
  for (let i = -12; i <= 12; i++) {
    floor.lineBetween(vanishX, horizon, vanishX + i * 78, h);
  }

  const pool = scene.add.image(w / 2, h * 0.28, 'light_pool')
    .setDepth(2)
    .setScale(3.4)
    .setAlpha(0.55)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: pool,
    alpha: 0.32,
    scale: 3.7,
    duration: 2200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut'
  });

  scene.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(40).setAlpha(0.92);

  const scan = scene.add.graphics().setDepth(41).setAlpha(0.07);
  for (let y = 0; y < h; y += 3) {
    scan.fillStyle(0x000000, 1);
    scan.fillRect(0, y, w, 1);
  }
}

export function createTitleLogo(scene, x, y, scale = 1.55) {
  const logo = scene.add.image(x, y, 'floor_logo').setDepth(8).setScale(scale);
  if (logo.preFX) {
    const glow = logo.preFX.addGlow(0x37f0ff, 1.1, 0, false);
    scene.tweens.add({
      targets: glow,
      outerStrength: 2.1,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }
  scene.tweens.add({
    targets: logo,
    y: y - 6,
    duration: 1800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut'
  });
  return logo;
}

export function createDustField(scene, depth = 6) {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const motes = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const img = scene.add.image(
      Phaser.Math.Between(0, w),
      Phaser.Math.Between(0, h),
      'particle'
    )
      .setDepth(depth)
      .setTint(0x37f0ff)
      .setAlpha(Phaser.Math.FloatBetween(0.08, 0.26))
      .setScale(Phaser.Math.FloatBetween(0.4, 1.15));
    motes.push({
      img,
      vx: Phaser.Math.FloatBetween(-10, 10),
      vy: Phaser.Math.FloatBetween(-16, -5),
      pulse: Phaser.Math.FloatBetween(0, Math.PI * 2),
      baseAlpha: img.alpha
    });
  }
  return {
    update(delta) {
      const dt = delta / 1000;
      for (const m of motes) {
        m.pulse += dt * 1.5;
        m.img.x += m.vx * dt;
        m.img.y += m.vy * dt;
        m.img.alpha = m.baseAlpha * (0.65 + Math.sin(m.pulse) * 0.35);
        if (m.img.y < -10) {
          m.img.y = h + 8;
          m.img.x = Phaser.Math.Between(0, w);
        }
        if (m.img.x < -10) m.img.x = w + 8;
        if (m.img.x > w + 10) m.img.x = -8;
      }
    }
  };
}

export function fadeToScene(scene, key, data, duration = 700) {
  if (scene._sceneLeaving) return;
  scene._sceneLeaving = true;
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(duration, 4, 5, 10);
  scene.cameras.main.once('camerafadeoutcomplete', () => {
    scene.scene.start(key, data);
  });
}

export function hudText(scene, x, y, text, size, color, extra = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: 'Courier New',
    fontSize: `${size}px`,
    color,
    stroke: '#05060c',
    strokeThickness: size >= 28 ? 5 : size >= 16 ? 4 : 2,
    ...extra
  });
}
