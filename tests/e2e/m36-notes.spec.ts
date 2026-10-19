// Notes in a real browser: where they are written from, what opening one does to the view, and
// what the markers say. The camera work is the part that cannot be tested anywhere else — whether
// the lit shapes really end up clear of the card depends on a laid-out canvas.
import { expect, test, type Page } from "@playwright/test";
import { getDoc, gotoWithStorage, openPalette } from "./helpers";

const meta = { title: "Notes", created: "2026-10-15T00:00:00Z", modified: "2026-10-15T00:00:00Z", appVersion: "0.1.0" };
const shape = (id: string, x: number, y: number) => ({
  id,
  type: "shape",
  shapeRef: "general/rect",
  position: { x, y },
  size: { w: 140, h: 70 },
  z: 1,
  style: {},
  label: { text: id },
});

/** Two shapes far apart on the page, and a Nested Block holding a third, with a note on each level. */
const doc = {
  format: "nedito",
  formatVersion: 7,
  meta,
  rootDiagramIds: ["page"],
  diagrams: {
    page: {
      id: "page",
      title: "Main",
      nodes: [
        shape("left", 0, 0),
        // Close enough to "left" to still be on screen once the camera has framed it: React Flow
        // does not render what is out of view, so a far shape cannot be clicked.
        shape("near", 0, 220),
        shape("right", 1600, 0),
        {
          id: "block",
          type: "nested",
          childDiagramId: "inside",
          position: { x: 800, y: 400 },
          size: { w: 200, h: 120 },
          z: 1,
          style: {},
          label: { text: "Block" },
          collapsed: { icons: [] },
          ports: [],
        },
      ],
      edges: [],
    },
    inside: { id: "inside", title: "Inside", nodes: [shape("deep", 0, 0)], edges: [] },
  },
  notes: [
    { id: "n1", title: "About the left one", body: "It is over on the left.", focus: { diagramId: "page", nodeIds: ["left"] } },
    { id: "n2", title: "About the right one", body: "It is over on the right.", focus: { diagramId: "page", nodeIds: ["right"] } },
    { id: "n3", title: "One level down", body: "Inside the block.", focus: { diagramId: "inside" } },
  ],
};

const storage = (document: unknown) => ({
  "nedito:collapsedSections": "[]",
  "nedito:collapsedGroups": JSON.stringify(["cloud"]),
  "nedito:demoDismissed": "true",
  "nedito:splashSeen": "1",
  "nedito:autosave": JSON.stringify(document),
});

const open = (page: Page) => gotoWithStorage(page, storage(doc));

/** Where a shape sits on screen, and where the card does. */
const boxOf = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} has no box`);
  return box;
};

/** Opens a note the way a reader would: from the Notes popover in the canvas chip. */
async function openFromList(page: Page, number: number) {
  await page.getByTestId("nd-notes-button").click();
  await page.getByTestId(`nd-note-list-row-${number}`).click();
}

test.describe("reading notes", () => {
  test("is closed until something opens it, and closes again when the reader moves on", async ({ page }) => {
    await open(page);
    // A document with notes puts Notes in the chip, never a card: one appears because a reader asked.
    await expect(page.getByTestId("nd-notes-button")).toBeVisible();
    await expect(page.getByTestId("nd-note-card")).toHaveCount(0);

    await openFromList(page, 1);
    await expect(page.getByTestId("nd-note-card")).toBeVisible();
    await expect(page.getByTestId("nd-note-card-count")).toHaveText("1 of 3");

    // Opening a note sets a trace, which is what dims everything else.
    await expect(page.getByTestId("nd-trace-hint")).toBeVisible();

    // The camera framed the shape clear of the card, which is the point of the reserve.
    const card = await boxOf(page, "nd-note-card");
    const shapeBox = await boxOf(page, "rf__node-left");
    expect(shapeBox.x + shapeBox.width).toBeLessThanOrEqual(card.x + 1);

    // Choosing something else to look at ends the reading, rather than leaving the card to follow
    // the author around the canvas while they work.
    await page.getByTestId("rf__node-near").click({ position: { x: 40, y: 40 } });
    await expect(page.getByTestId("nd-note-card")).toHaveCount(0);
  });

  test("stepping moves the card to the other side when the subject is clearly over", async ({ page }) => {
    await open(page);
    await openFromList(page, 1);
    const first = await boxOf(page, "nd-note-card");

    await page.getByTestId("nd-note-card-next").click();
    await expect(page.getByTestId("nd-note-card-count")).toHaveText("2 of 3");
    const second = await boxOf(page, "nd-note-card");
    // The shapes are at opposite ends of a wide page, so the card has to move across.
    expect(Math.abs(second.x - first.x)).toBeGreaterThan(200);
  });

  test("a note one level down takes the reader there, and Escape leaves them there", async ({ page }) => {
    await open(page);
    await openFromList(page, 3);

    await expect(page.getByTestId("nd-note-card-level")).toContainText("Inside");
    // A note that names nothing is about the level, and says so rather than looking unfinished.
    await expect(page.getByTestId("nd-note-card-level")).toContainText("whole level");
    expect(await page.evaluate(() => window.__ddStore!.getState().navStack.length)).toBe(2);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-note-card")).toBeHidden();
    // Leaving a note does not navigate back: the reader may want to keep looking from here.
    expect(await page.evaluate(() => window.__ddStore!.getState().navStack.length)).toBe(2);
  });

  test("Escape closes the Notes popover before the open note", async ({ page }) => {
    await open(page);
    await openFromList(page, 1);
    await page.getByTestId("nd-notes-button").click();
    await expect(page.getByTestId("nd-notes-popover")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nd-notes-popover")).toHaveCount(0);
    await expect(page.getByTestId("nd-note-card")).toBeVisible();
  });

  test("a document with no notes has no Notes in the chip at all", async ({ page }) => {
    await gotoWithStorage(page, storage({ ...doc, notes: undefined, formatVersion: 6 }));
    await expect(page.getByTestId("nd-canvas")).toBeVisible();
    await expect(page.getByTestId("nd-notes-button")).toHaveCount(0);
    expect((await getDoc(page)).notes).toBeUndefined();
  });
});

test.describe("writing notes", () => {
  test("the shape's own bar offers it, whatever kind of shape it is", async ({ page }) => {
    await open(page);
    // The first place anyone looks after clicking a shape: the bar above it. One button, in the
    // same place, for every selection — it used to be a line at the bottom of a different popover
    // each time, and nobody found it.
    await page.getByTestId("rf__node-left").click({ position: { x: 40, y: 40 } });
    await page.getByTestId("nd-bar-note").click();
    await expect(page.getByTestId("nd-open-note")).toBeVisible();
    await page.getByTestId("nd-add-note").click();
    await expect(page.getByTestId("nd-note-card-title")).toBeFocused();
    // Beside the note already about "left", not at the end of the document: a reading order that
    // visits the same shape at 1 and again at 8 is not a walk through anything.
    expect((await getDoc(page)).notes?.map((n) => n.focus.nodeIds?.[0])).toEqual(["left", "left", "right", undefined]);

    // A Nested Block has no More popover at all, and used to hide this at the foot of a long panel.
    await page.getByTestId("rf__node-block").click({ position: { x: 100, y: 60 } });
    await page.getByTestId("nd-bar-note").click();
    await page.getByTestId("nd-add-note").click();
    // Nothing had been written about the block, so this one goes at the end.
    expect((await getDoc(page)).notes?.[4].focus.nodeIds).toEqual(["block"]);
  });

  test("Alt+N writes one about the selection, with the title ready to type", async ({ page }) => {
    await open(page);
    await page.getByTestId("rf__node-left").click({ position: { x: 40, y: 40 } });
    await page.keyboard.press("Alt+n");

    await expect(page.getByTestId("nd-note-card-title")).toBeFocused();
    await page.keyboard.type("Written here");
    await page.getByTestId("nd-note-card-body").fill("And a body.");
    await page.getByTestId("nd-note-card-body").blur();

    const notes = (await getDoc(page)).notes;
    expect(notes).toHaveLength(4);
    expect(notes?.[1]).toMatchObject({ title: "Written here", body: "And a body.", focus: { diagramId: "page", nodeIds: ["left"] } });
  });

  test("a typed sentence is one undo step, not one per keystroke", async ({ page }) => {
    await open(page);
    await openFromList(page, 1);
    const body = page.getByTestId("nd-note-card-body");

    await body.click();
    await body.fill("");
    await page.keyboard.type("Several words typed in one go.");
    await body.blur();
    await expect(body).toHaveValue("Several words typed in one go.");

    await page.keyboard.press("Control+z");
    // One press, the whole session: the text it had before, not a word of what was typed.
    await expect(body).toHaveValue("It is over on the left.");
  });

  test("the right-click menu writes one, on a shape and on bare canvas", async ({ page }) => {
    await open(page);
    await page.getByTestId("rf__node-left").click({ button: "right", position: { x: 40, y: 40 } });
    await page.getByText("Add note", { exact: true }).click();
    expect((await getDoc(page)).notes?.[1].focus.nodeIds).toEqual(["left"]);

    await page.keyboard.press("Escape");
    await page.getByTestId("nd-canvas").click({ button: "right", position: { x: 500, y: 420 } });
    await page.getByText("Add note about this level").click();
    const added = (await getDoc(page)).notes?.[4];
    // It says "about this level" and means it, whatever happens to be selected elsewhere.
    expect(added?.focus.nodeIds).toBeUndefined();
    expect(added?.focus.diagramId).toBe("page");
  });

  test("the list reorders by dragging, and the reading order follows", async ({ page }) => {
    await open(page);
    await page.getByTestId("nd-notes-button").click();
    await page.getByTestId("nd-note-list-row-3").dragTo(page.getByTestId("nd-note-list-row-1"));

    expect((await getDoc(page)).notes?.map((n) => n.id)).toEqual(["n3", "n1", "n2"]);
  });
});

test.describe("markers", () => {
  test("a shape wears a dot, a count past one, and clicking it opens that note", async ({ page }) => {
    await open(page);
    // "left" is named by one note; the marker is a bare dot rather than a number.
    await expect(page.getByTestId("nd-note-marker-left")).toHaveText("");

    await page.getByTestId("nd-note-marker-left").click();
    await expect(page.getByTestId("nd-note-card-count")).toHaveText("1 of 3");

    // A second note about the same shape turns the dot into a count: a bare dot would be a lie.
    await page.getByTestId("rf__node-left").click({ position: { x: 40, y: 40 } });
    await page.keyboard.press("Alt+n");
    await expect(page.getByTestId("nd-note-marker-left")).toHaveText("2");

    // And numbered, it shows the span those two cover rather than hiding one of them. They are
    // adjacent because a new note joins its siblings.
    await page.getByTestId("nd-notes-button").click();
    await page.getByTestId("nd-notes-numbers-toggle").check();
    await expect(page.getByTestId("nd-note-marker-left")).toHaveText("1–2");
  });

  test("numbering turns the markers into a walk through the diagram", async ({ page }) => {
    await open(page);
    await page.getByTestId("nd-notes-button").click();
    await page.getByTestId("nd-notes-numbers-toggle").check();

    // The marker now says where its shape comes in the reading order, not how many notes it has.
    // Only "left" is checked: "right" sits 1600px away and React Flow does not render what is off
    // screen, so there is no element to read.
    await expect(page.getByTestId("nd-note-marker-left")).toHaveText("1");

    // And the order is the author's: dragging the list renumbers the diagram.
    await page.getByTestId("nd-note-list-row-2").dragTo(page.getByTestId("nd-note-list-row-1"));
    await expect(page.getByTestId("nd-note-marker-left")).toHaveText("2");
  });

  test("markers can be turned off, and numbering goes with them", async ({ page }) => {
    await open(page);
    await page.getByTestId("nd-notes-button").click();
    await page.getByTestId("nd-notes-markers-toggle").uncheck();

    await expect(page.getByTestId("nd-note-marker-left")).toHaveCount(0);
    // Numbering is meaningless without markers to carry it, so it cannot be set on its own.
    await expect(page.getByTestId("nd-notes-numbers-toggle")).toBeDisabled();
  });

  test("a Nested Block advertises the writing beneath it, and clicking drills in", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("nd-note-marker-below-inside")).toHaveText(/1/);

    await page.getByTestId("nd-note-marker-below-inside").click();
    await expect(page.getByTestId("nd-note-card-level")).toContainText("Inside");
    expect(await page.evaluate(() => window.__ddStore!.getState().navStack.length)).toBe(2);
  });

  test("the palette finds a note by what it says, not only by its title", async ({ page }) => {
    await open(page);
    await openPalette(page, "over on the right");
    await page.getByText("Note: About the right one").click();
    await expect(page.getByTestId("nd-note-card-count")).toHaveText("2 of 3");
  });
});
