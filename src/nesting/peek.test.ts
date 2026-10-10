// Peek (A5, D121): a block stirs the first time it is seen this session, never again.
import { beforeEach, expect, it } from "vitest";
import { firstPeek, resetPeeksForTests } from "./peek";

beforeEach(resetPeeksForTests);

it("answers yes once per block, then no", () => {
  expect(firstPeek("a")).toBe(true);
  expect(firstPeek("a")).toBe(false);
  expect(firstPeek("b")).toBe(true);
  expect(firstPeek("a")).toBe(false);
});
