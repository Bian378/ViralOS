/** Render purely procedural visuals; no third-party footage or external requests. */
import type { VideoScene, VideoStyle, VideoTimeline } from './video-timeline';

const W = 1080;
const H = 1920;

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];
  let current = '';
  for (const token of value.split(/\s+/u)) {
    const next = current ? current + ' ' + token : token;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = token;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function easeOut(t: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}
function softIn(t: number) {
  return Math.min(1, Math.max(0, t));
}

export function drawShortFrame(
  ctx: CanvasRenderingContext2D,
  timeline: VideoTimeline,
  frameIndex: number,
  style: VideoStyle
) {
  const time = frameIndex / 30;
  const scene = timeline.scenes.find(
    part => frameIndex >= part.startFrame && frameIndex < part.endFrame
  ) || timeline.scenes[timeline.scenes.length - 1];
  const local = (frameIndex - scene.startFrame) / (scene.endFrame - scene.startFrame);
  const sceneSeconds = (scene.endFrame - scene.startFrame) / 30;
  const transition = Math.min(1, local * Math.max(3, sceneSeconds * 2));
  const isBold = style === 'bold';
  const accent = isBold ? '#ffa879' : '#72f0d0';
  const accentSoft = isBold ? 'rgba(255,168,121,0.20)' : 'rgba(114,240,208,0.20)';
  const gradient = ctx.createLinearGradient(
    Math.sin(time * 0.10) * 250, 0, W, H
  );
  if (isBold) {
    gradient.addColorStop(0, '#171225');
    gradient.addColorStop(0.56, '#15172c');
    gradient.addColorStop(1, '#151116');
  } else {
    gradient.addColorStop(0, '#091826');
    gradient.addColorStop(0.55, '#102233');
    gradient.addColorStop(1, '#080d19');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Decorative motion layers with deterministic positions, no photos.
  ctx.save();
  ctx.translate(500 + 105 * Math.sin(time * .24), 680 + 95 * Math.cos(time * .18));
  ctx.rotate(time * (isBold ? .045 : .018));
  ctx.strokeStyle = accentSoft;
  ctx.lineWidth = isBold ? 4 : 2;
  for (let i = 0; i < 5; i++) {
    const width = 250 + i * 135;
    if (isBold) {
      ctx.strokeRect(-width / 2, -width / 2, width, width);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, width, width * .55, .5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Light particles in safe, low contrast. No random per-frame jitter.
  for (let i = 0; i < 15; i++) {
    const x = 75 + ((i * 293) % 930) + Math.sin(time * .25 + i) * 15;
    const y = 145 + ((i * 193) % 1540) + Math.cos(time * .20 + i) * 22;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2);
    ctx.fillStyle = isBold ? 'rgba(255,196,160,0.16)' : 'rgba(255,255,255,0.11)';
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = '500 27px sans-serif';
  ctx.fillText('VIRALOS  /  ORIGINAL SHORT', 100, 172);
  ctx.fillStyle = accent;
  ctx.fillRect(100, 205, 73, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillRect(100, 277, 880, 1);

  // A fast visual hook, numbered scene and softly animated transition.
  ctx.font = '600 29px sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(scene.isHook ? 'THE HOOK' : 'SCENE ' + String(scene.index + 1).padStart(2, '0'), 100, 390);
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.textAlign = 'right';
  ctx.fillText(String(scene.index + 1).padStart(2, '0') + ' / ' +
    String(timeline.scenes.length).padStart(2, '0'), 980, 390);
  ctx.textAlign = 'left';

  const activeCue = scene.captions.find(c =>
    frameIndex >= c.startFrame && frameIndex < c.endFrame
  ) || scene.captions[scene.captions.length - 1];
  const lines = (() => {
    ctx.font = isBold ? '800 92px sans-serif' : '700 88px sans-serif';
    return wrap(ctx, activeCue.text.toUpperCase(), 850);
  })();
  const baseline = 850 - (lines.length - 1) * 58;
  const slide = (1 - easeOut(transition)) * (isBold ? 100 : 52);
  const visible = softIn(local * sceneSeconds * 5);
  const ending = Math.min(1, (1 - local) * sceneSeconds * 7);
  ctx.save();
  ctx.globalAlpha = visible * Math.max(.06, ending);
  ctx.translate(isBold ? slide : 0, isBold ? 0 : slide);
  ctx.fillStyle = 'rgba(0,0,0,.27)';
  ctx.fillRect(75, baseline - 142, 930, lines.length * 108 + 80);
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, index) => {
    ctx.fillText(line, 105, baseline + index * 110);
  });
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.font = '500 26px sans-serif';
  ctx.fillText('STORY IN MOTION', 540, 1398);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(100, 1585, 880, 6);
  ctx.fillStyle = accent;
  ctx.fillRect(100, 1585, Math.min(880, Math.round(880 * frameIndex / timeline.frames)), 6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 25px sans-serif';
  ctx.fillText('DRAFT  •  HUMAN REVIEW REQUIRED', 100, 1665);
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.ceil((timeline.frames - frameIndex) / 30)) + 's', 980, 1665);
  ctx.textAlign = 'left';
}
