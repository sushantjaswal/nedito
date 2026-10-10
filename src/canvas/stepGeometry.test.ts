// Walkthrough's dot (A6, D123): rests at each step, travels to the next, and the cycle closes.
import { expect, it } from "vitest";
import { stepWidth, STEP_SIZE, walkTiming, WALK_REST_S, WALK_TRAVEL_S } from "./stepGeometry";

it("rests at each step for the same time, then travels on, ending exactly at the end of the cycle", () => {
  const t = walkTiming([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 300 },
  ])!;
  expect(t.dur).toBeCloseTo(3 * WALK_REST_S + 2 * WALK_TRAVEL_S);
  const points = t.keyPoints.split(";").map(Number);
  const times = t.keyTimes.split(";").map(Number);
  // Two key points per step (arrive, leave), at the step's share of the path.
  expect(points).toEqual([0, 0, 0.25, 0.25, 1, 1]);
  expect(times[0]).toBe(0);
  expect(times[times.length - 1]).toBe(1);
  for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
});

it("has nothing to travel with one step, or with every step in one place", () => {
  expect(walkTiming([{ x: 0, y: 0 }])).toBeNull();
  expect(walkTiming([{ x: 5, y: 5 }, { x: 5, y: 5 }])).toBeNull();
});

it("widens the badge for two digits", () => {
  expect(stepWidth(9)).toBe(STEP_SIZE);
  expect(stepWidth(12)).toBeGreaterThan(STEP_SIZE);
});
