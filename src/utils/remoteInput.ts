import type { RemotePointerEvent } from '../types/session';

export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Computes normalized [0, 1] pointer coordinates mapped to the actual rendered video/image
 * content inside an `object-contain` element, compensating for any letterbox/pillarbox bars.
 */
export function computeContainedPointerCoords(
  clientX: number,
  clientY: number,
  rect: BoxRect,
  mediaWidth: number = 0,
  mediaHeight: number = 0
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0.5, y: 0.5 };
  }

  let contentLeft = rect.left;
  let contentTop = rect.top;
  let contentWidth = rect.width;
  let contentHeight = rect.height;

  if (mediaWidth > 0 && mediaHeight > 0) {
    const mediaAspect = mediaWidth / mediaHeight;
    const boxAspect = rect.width / rect.height;

    if (boxAspect > mediaAspect) {
      // Pillarbox (bars on left/right)
      contentWidth = rect.height * mediaAspect;
      contentLeft = rect.left + (rect.width - contentWidth) / 2;
    } else if (boxAspect < mediaAspect) {
      // Letterbox (bars on top/bottom)
      contentHeight = rect.width / mediaAspect;
      contentTop = rect.top + (rect.height - contentHeight) / 2;
    }
  }

  const x = Math.min(1, Math.max(0, (clientX - contentLeft) / contentWidth));
  const y = Math.min(1, Math.max(0, (clientY - contentTop) / contentHeight));
  return { x, y };
}

/**
 * Discrete button/scroll actions must travel on the reliable ordered channel so clicks
 * are never dropped or reordered behind high-frequency cursor movement updates.
 */
export function getPointerTransportPriority(
  kind: RemotePointerEvent['kind']
): 'control' | 'reliable' {
  return kind === 'move' ? 'control' : 'reliable';
}

export function detectClientOsPlatform(): 'windows' | 'macos' | 'linux' {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  return 'linux';
}
