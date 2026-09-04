import Phaser from 'phaser';

const FONT = 'Courier New';

const COLORS = {
  fill: 0x0a0c18,
  border: 0x2c3156,
  accent: 0x37f0ff,
  accentHover: 0x9fffe8,
  accentDanger: 0xff4a5e,
  label: '#e8ecff',
  labelDisabled: '#5a6580',
  subtitle: '#7de8ff',
  subtitleDisabled: '#3a4258'
};

export function drawBracketPanel(g, w, h, {
  fill = COLORS.fill,
  border = COLORS.border,
  accent = COLORS.accent,
  fillAlpha = 0.92,
  accentAlpha = 1,
  bracket = 10
} = {}) {
  g.clear();
  const x = -w / 2;
  const y = -h / 2;
  g.fillStyle(fill, fillAlpha);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, border, 1);
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  g.lineStyle(2, accent, accentAlpha);
  const L = bracket;
  g.beginPath();
  g.moveTo(x, y + L);
  g.lineTo(x, y);
  g.lineTo(x + L, y);
  g.strokePath();

  g.beginPath();
  g.moveTo(x + w - L, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + L);
  g.strokePath();

  g.beginPath();
  g.moveTo(x, y + h - L);
  g.lineTo(x, y + h);
  g.lineTo(x + L, y + h);
  g.strokePath();

  g.beginPath();
  g.moveTo(x + w - L, y + h);
  g.lineTo(x + w, y + h);
  g.lineTo(x + w, y + h - L);
  g.strokePath();
}

// Container + Graphics + Text. O Container é o único objeto interativo.
export function createMenuButton(scene, x, y, {
  label,
  subtitle = null,
  width = 280,
  height = 52,
  disabled = false,
  danger = false,
  onClick
}) {
  const container = scene.add.container(x, y);
  const accentIdle = danger ? COLORS.accentDanger : COLORS.accent;
  const bg = scene.add.graphics();
  container.add(bg);

  const labelY = subtitle ? -8 : 0;
  const text = scene.add.text(0, labelY, label, {
    fontFamily: FONT,
    fontSize: '16px',
    color: disabled ? COLORS.labelDisabled : COLORS.label,
    stroke: '#05060c',
    strokeThickness: 3
  }).setOrigin(0.5);
  container.add(text);

  let sub = null;
  if (subtitle) {
    sub = scene.add.text(0, 12, subtitle, {
      fontFamily: FONT,
      fontSize: '10px',
      color: disabled ? COLORS.subtitleDisabled : COLORS.subtitle
    }).setOrigin(0.5);
    container.add(sub);
  }

  container.setSize(width, height);

  const hit = new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height);
  const enableInput = () => {
    container.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    container.input.cursor = 'pointer';
  };

  const state = {
    disabled,
    highlighted: false,
    pressed: false
  };

  const paint = () => {
    const hot = !state.disabled && (state.highlighted || state.pressed);
    drawBracketPanel(bg, width, height, {
      fill: COLORS.fill,
      border: hot ? accentIdle : COLORS.border,
      accent: hot ? COLORS.accentHover : accentIdle,
      fillAlpha: state.disabled ? 0.45 : state.pressed ? 1 : hot ? 0.98 : 0.88,
      accentAlpha: state.disabled ? 0.35 : 1,
      bracket: 10
    });
    container.setAlpha(state.disabled ? 0.55 : 1);
  };

  const fire = () => {
    if (state.disabled || typeof onClick !== 'function') return;
    onClick();
  };

  paint();

  if (!disabled) {
    enableInput();
    container.on('pointerover', () => {
      state.highlighted = true;
      paint();
      scene.tweens.killTweensOf(container);
      scene.tweens.add({ targets: container, scaleX: 1.04, scaleY: 1.04, duration: 90, ease: 'Quad.Out' });
    });
    container.on('pointerout', () => {
      state.highlighted = false;
      state.pressed = false;
      paint();
      scene.tweens.killTweensOf(container);
      scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 90, ease: 'Quad.Out' });
    });
    container.on('pointerdown', () => {
      state.pressed = true;
      paint();
      container.setScale(0.96);
    });
    container.on('pointerup', () => {
      state.pressed = false;
      paint();
      container.setScale(state.highlighted ? 1.04 : 1);
      fire();
    });
  }

  container.setHighlighted = (value) => {
    if (state.disabled) return;
    state.highlighted = !!value;
    paint();
    scene.tweens.killTweensOf(container);
    scene.tweens.add({
      targets: container,
      scaleX: value ? 1.04 : 1,
      scaleY: value ? 1.04 : 1,
      duration: 90,
      ease: 'Quad.Out'
    });
  };

  container.setDisabled = (value) => {
    state.disabled = !!value;
    text.setColor(state.disabled ? COLORS.labelDisabled : COLORS.label);
    if (sub) sub.setColor(state.disabled ? COLORS.subtitleDisabled : COLORS.subtitle);
    if (state.disabled) {
      container.disableInteractive();
      state.highlighted = false;
      state.pressed = false;
      container.setScale(1);
    } else {
      enableInput();
    }
    paint();
  };

  container.activate = fire;
  container.isDisabled = () => state.disabled;
  container.setInputEnabled = (enabled) => {
    if (enabled && !state.disabled) enableInput();
    else container.disableInteractive();
  };
  paint();
  return container;
}
