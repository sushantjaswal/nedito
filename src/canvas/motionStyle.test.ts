// How motion is drawn (D116, D118): one helper for the canvas and the exports.
import { describe, expect, it } from "vitest";
import type { DEdge } from "../model/types";
import { asTraced, edgeDashArray, edgeStrokeWidth, FLOW_DASH, flowVars, packetRestPoint, packetTiming } from "./motionStyle";

const line = (motion?: DEdge["motion"], dash?: string): Pick<DEdge, "style" | "motion"> => ({ style: dash ? { dash } : {}, ...(motion ? { motion } : {}) });

describe("Flow", () => {
  it("marches Flow's own pattern on a solid line, or the line's own dashes", () => {
    expect(edgeDashArray(line({ kind: "flow" }))).toBe(FLOW_DASH);
    expect(edgeDashArray(line({ kind: "flow" }, "dashed"))).toBe("6 4");
    expect(edgeDashArray(line())).toBeUndefined();
  });

  it("forward moves the dashes from start to end: one pattern length per cycle, a step a pixel", () => {
    expect(flowVars(line({ kind: "flow" }))).toEqual({ "--nd-flow-shift": "-14px", "--nd-flow-duration": "0.7s", "--nd-flow-steps": "14", "--nd-flow-turn": "normal" });
  });

  it("reverse moves them back toward the start", () => {
    expect(flowVars(line({ kind: "flow", direction: "reverse" }))?.["--nd-flow-shift"]).toBe("14px");
  });

  it("both ways travels several pattern lengths, then turns and comes back", () => {
    const v = flowVars(line({ kind: "flow", direction: "both" }))!;
    expect(v["--nd-flow-turn"]).toBe("alternate");
    expect(v["--nd-flow-shift"]).toBe("-56px");
    expect(v["--nd-flow-duration"]).toBe("2.8s");
  });

  it("a traced line keeps its own motion; a still one marches as Flow does", () => {
    expect(asTraced(line({ kind: "packets", direction: "reverse", speed: "slow" })).motion).toEqual({ kind: "packets", direction: "reverse", speed: "slow" });
    expect(asTraced(line()).motion).toEqual({ kind: "flow" });
  });
});

describe("Throughput (A3, D119)", () => {
  it("carries its volume in the line's weight, moving or still, and marches faster the more it carries", () => {
    expect(edgeStrokeWidth(line({ kind: "throughput", volume: 1 }), 1.5)).toBeCloseTo(1.43, 1);
    expect(edgeStrokeWidth(line({ kind: "throughput" }), 1.5)).toBeCloseTo(2.48, 1);
    expect(edgeStrokeWidth(line({ kind: "throughput", volume: 5 }), 1.5)).toBeCloseTo(3.53, 1);
    expect(edgeStrokeWidth(line({ kind: "flow" }), 1.5)).toBe(1.5);
    expect(flowVars(line({ kind: "throughput", volume: 1 }))?.["--nd-flow-duration"]).toBe("0.91s");
    expect(flowVars(line({ kind: "throughput", volume: 5 }))?.["--nd-flow-duration"]).toBe("0.35s");
    expect(edgeDashArray(line({ kind: "throughput" }))).toBe(FLOW_DASH);
  });
});

describe("Packets (A3, D119)", () => {
  const d = "M0,0 L240,0";
  it("travel at a constant speed, in the line's direction", () => {
    expect(packetTiming(d, line({ kind: "packets" }))).toEqual({ dur: 2, keyPoints: "0;1", keyTimes: "0;1" });
    expect(packetTiming(d, line({ kind: "packets", speed: "fast" })).dur).toBe(1);
    expect(packetTiming(d, line({ kind: "packets", direction: "reverse" })).keyPoints).toBe("1;0");
    expect(packetTiming(d, line({ kind: "packets", direction: "both" }))).toEqual({ dur: 4, keyPoints: "0;1;0", keyTimes: "0;0.5;1" });
    // A very short line still takes a moment, not a blink.
    expect(packetTiming("M0,0 L10,0", line({ kind: "packets" })).dur).toBe(0.6);
  });

  it("rest 60% of the way along, in the direction they travel; a plain line has no dashes", () => {
    expect(packetRestPoint(d, line({ kind: "packets" }))).toEqual({ x: 144, y: 0 });
    expect(packetRestPoint(d, line({ kind: "packets", direction: "reverse" }))).toEqual({ x: 96, y: 0 });
    expect(edgeDashArray(line({ kind: "packets" }))).toBeUndefined();
  });
});
