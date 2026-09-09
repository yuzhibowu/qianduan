import { describe, expect, it } from "vitest";
import { interactionAt, type InteractionSample } from "./interaction";

describe("recorded interaction timeline", () => {
  const samples: InteractionSample[] = [
    { time: 0, x: 0.1, y: 0.2, active: true, pressed: false },
    { time: 1, x: 0.9, y: 0.8, active: true, pressed: true },
    { time: 2, x: 0.5, y: 0.5, active: false, pressed: false },
  ];

  it("interpolates normalized pointer coordinates at absolute time", () => {
    expect(interactionAt(samples, 0.5)).toMatchObject({ x: 0.5, y: 0.5, active: true });
  });

  it("repeats the recorded sequence without depending on render speed", () => {
    expect(interactionAt(samples, 2.5)).toEqual(interactionAt(samples, 0.5));
  });
});
