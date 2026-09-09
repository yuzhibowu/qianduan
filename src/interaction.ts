export type InteractionSample = {
  time: number;
  x: number;
  y: number;
  active: boolean;
  pressed: boolean;
};

export function interactionAt(samples: InteractionSample[], time: number) {
  if (!samples.length) return null;
  const duration = samples[samples.length - 1].time;
  const local = duration > 0 ? time % duration : 0;
  let index = samples.findIndex((sample) => sample.time >= local);
  if (index < 0) index = samples.length - 1;
  const next = samples[index];
  const previous = samples[Math.max(0, index - 1)];
  const span = Math.max(0.0001, next.time - previous.time);
  const amount = Math.max(0, Math.min(1, (local - previous.time) / span));
  return {
    x: previous.x + (next.x - previous.x) * amount,
    y: previous.y + (next.y - previous.y) * amount,
    active: previous.active,
    pressed: previous.pressed,
  };
}
