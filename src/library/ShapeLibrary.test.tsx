import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../model/store";
import { writeCollapsedSections } from "./collapsedSections";
import { ShapeLibrary } from "./ShapeLibrary";

// The stencil sections are dynamic imports; under the full suite they routinely need more than
// React Testing Library's 1s default. These tests assert behaviour, not load time.
const STENCIL_WAIT = { timeout: 8000 };

function resetStore() {
  const initial = useDocStore.getState();
  const diagramId = initial.currentDiagramId();
  useDocStore.setState({
    doc: {
      ...initial.doc,
      diagrams: { ...initial.doc.diagrams, [diagramId]: { ...initial.doc.diagrams[diagramId], nodes: [], edges: [] } },
    },
    selection: { nodeIds: [], edgeIds: [] },
  });
  useDocStore.temporal.getState().clear();
}

describe("ShapeLibrary", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
    // Sections now default to collapsed on a genuinely first-ever visit (D31); most of these
    // tests are about what's inside a section, not the collapse/expand affordance itself, so
    // start every section expanded here — matching a returning user who already opened them.
    writeCollapsedSections(new Set());
  });

  it("click-to-place adds a shape node to the current diagram and selects it", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);

    const rect = await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);
    await user.click(rect);

    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("shape");
    expect(useDocStore.getState().selection.nodeIds).toEqual([nodes[0].id]);
  });

  it("click-to-place on the nested-diagram stencil creates a NestedNode + child diagram, not a plain shape", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);

    const nestedStencil = await screen.findByTestId("nd-stencil-general/nested", undefined, STENCIL_WAIT);
    await user.click(nestedStencil);

    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("nested");
    const childDiagramId = (nodes[0] as { childDiagramId: string }).childDiagramId;
    expect(useDocStore.getState().doc.diagrams[childDiagramId]).toBeDefined();
  });

  it("search filters shapes across sections by label, case-insensitively", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    await user.type(screen.getByTestId("nd-shape-search"), "decision");

    expect(await screen.findByTestId("nd-stencil-flowchart/decision", undefined, STENCIL_WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId("nd-stencil-general/rect")).not.toBeInTheDocument();
  });

  // Slice 4 of the icon library sweep (CLAUDE_HISTORY.md D54): a pictogram has one label but
  // several honest names, and the picker is 700+ shapes deep. Search reads keywords and the
  // stencil id as well, which is what keeps a renamed shape reachable by its old name.
  it("search finds a shape by a keyword that is not in its label", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    // "Flame" is labelled Flame; nobody types that. They type "fire".
    await user.type(screen.getByTestId("nd-shape-search"), "fire");
    expect(
      await screen.findByTestId("nd-stencil-misc/local-fire-department", undefined, STENCIL_WAIT),
    ).toBeInTheDocument();
  });

  it("search still finds a renamed shape under the Material Symbols name it used to carry", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    // misc/filter-drama was labelled "Filter Drama" and is now "Cloud". Anyone who learned the
    // old name must not lose the shape: the id's own words are part of the haystack.
    await user.type(screen.getByTestId("nd-shape-search"), "filter drama");
    expect(await screen.findByTestId("nd-stencil-misc/filter-drama", undefined, STENCIL_WAIT)).toBeInTheDocument();
  });

  it("search shows a 'no results' state that still lets the user clear it", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    await user.type(screen.getByTestId("nd-shape-search"), "nonexistent-shape-xyz");
    expect(screen.getByText("0 results")).toBeInTheDocument();

    await user.clear(screen.getByTestId("nd-shape-search"));
    expect(await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT)).toBeInTheDocument();
  });

  it("Favorites shows a captured item and supports removing it", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().addSelectionToScratchpad();
    const itemId = useDocStore.getState().scratchpad[0].id;

    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    expect(screen.getByTestId(`nd-scratchpad-${itemId}`)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Remove from Favorites"));
    expect(useDocStore.getState().scratchpad).toHaveLength(0);
    expect(screen.queryByTestId(`nd-scratchpad-${itemId}`)).not.toBeInTheDocument();
  });

  it("clicking a Favorites item places a new node with its captured style", async () => {
    const id = useDocStore.getState().addShapeNode("general/rect", { x: 0, y: 0 }, { w: 100, h: 60 });
    useDocStore.getState().setNodeStyle([id], { fill: "#ff0000" });
    useDocStore.getState().setSelection([id]);
    useDocStore.getState().addSelectionToScratchpad();
    const itemId = useDocStore.getState().scratchpad[0].id;

    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await user.click(await screen.findByTestId(`nd-scratchpad-${itemId}`, undefined, STENCIL_WAIT));

    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes).toHaveLength(2); // the original captured shape, plus the newly placed one
    const placed = nodes.find((n) => n.id !== id);
    expect(placed?.type).toBe("shape");
    if (placed?.type === "shape") expect(placed.style).toEqual({ shadow: true, fill: "#ff0000" }); // the captured shape was placed with its shadow on (R6)
  });

  it("clicking a section header collapses it (hiding its shapes) and clicking again reopens it", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    const header = screen.getByTestId("nd-section-toggle-general");
    expect(header).toHaveAttribute("aria-expanded", "true");

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nd-stencil-general/rect")).not.toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT)).toBeInTheDocument();
  });

  // "More Shapes…" became "Browse all libraries" in R4 (D93); same job, same setting.
  it("Browse all libraries hides a disabled section from the sidebar and search results", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);

    await user.click(screen.getByTestId("nd-browse-libraries-trigger"));
    const dialog = screen.getByTestId("nd-browse-libraries-dialog");
    expect(within(dialog).getByRole("dialog", { name: "Browse all libraries" })).toBeInTheDocument();
    await user.click(within(dialog).getByText("Essentials"));
    await user.click(within(dialog).getByLabelText("Close"));

    expect(screen.queryByTestId("nd-stencil-general/rect")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("nd-shape-search"), "rectangle");
    expect(screen.queryByTestId("nd-stencil-general/rect")).not.toBeInTheDocument();
  });

  it("lists the sections under their purpose groups, and hides a group whose sections are all off", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);
    expect(screen.getByTestId("nd-group-toggle-cloud")).toHaveTextContent("Cloud");
    await user.click(screen.getByTestId("nd-browse-libraries-trigger"));
    const dialog = screen.getByTestId("nd-browse-libraries-dialog");
    expect(within(dialog).getByRole("group", { name: "Cloud" })).toHaveTextContent(/Azure.*AWS.*GCP/);
    for (const id of ["azure", "aws", "gcp"]) await user.click(within(dialog).getByTestId(`nd-browse-section-${id}`));
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("nd-browse-libraries-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nd-group-toggle-cloud")).not.toBeInTheDocument();
  });

  // ---- purpose groups and Recently used (R4, D93)

  it("closing a group hides its sections, and the sections inside keep their own open state", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);
    const basics = screen.getByTestId("nd-group-toggle-basics");
    expect(basics).toHaveAttribute("aria-expanded", "true");
    await user.click(basics);
    expect(basics).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nd-section-toggle-general")).not.toBeInTheDocument();
    await user.click(basics);
    expect(screen.getByTestId("nd-section-toggle-general")).toHaveAttribute("aria-expanded", "true");
  });

  it("a group of one section is that section: its heading opens and closes it", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    const network = await screen.findByTestId("nd-group-toggle-network", undefined, STENCIL_WAIT);
    expect(network).toHaveTextContent("Network");
    expect(screen.queryByTestId("nd-section-toggle-network")).not.toBeInTheDocument();
    await user.click(network);
    expect(network).toHaveAttribute("aria-expanded", "false");
  });

  // Raised in review: "Basic" under "Basics" read oddly, and the sub-headings were in capitals.
  it("names the sections inside Basics for what they hold", async () => {
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);
    expect(screen.getByTestId("nd-section-toggle-general")).toHaveTextContent(/^▾Essentials\d+$/);
    expect(screen.getByTestId("nd-section-toggle-basic")).toHaveTextContent(/^▾Geometric\d+$/);
    expect(screen.getByTestId("nd-section-toggle-advanced")).toHaveTextContent(/^▾Frames & Brackets\d+$/);
  });

  it("shows a shape count on each group once its sections have loaded", async () => {
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);
    const basics = screen.getByTestId("nd-group-toggle-basics");
    expect(basics.textContent).toMatch(/Basics\d+$/);
  });

  it("puts a shape placed from the library into Recently used, which places it again", async () => {
    const user = userEvent.setup();
    render(<ShapeLibrary />);
    expect(screen.queryByTestId("nd-recent-shapes")).not.toBeInTheDocument();
    await user.click(await screen.findByTestId("nd-stencil-general/ellipse", undefined, STENCIL_WAIT));
    const recent = await screen.findByTestId("nd-recent-stencil-general/ellipse");
    await user.click(recent);
    const diagramId = useDocStore.getState().currentDiagramId();
    const nodes = useDocStore.getState().doc.diagrams[diagramId].nodes;
    expect(nodes.filter((n) => n.type === "shape" && n.shapeRef === "general/ellipse")).toHaveLength(2);
  });

  it("opens Basics alone, with General open inside it, on a first visit (D87)", async () => {
    localStorage.clear();
    render(<ShapeLibrary />);
    await screen.findByTestId("nd-stencil-general/rect", undefined, STENCIL_WAIT);
    expect(screen.getByTestId("nd-group-toggle-basics")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nd-section-toggle-basic")).toHaveAttribute("aria-expanded", "false");
    for (const id of ["lines", "flow", "data", "software", "cloud", "network", "people", "icons"]) {
      expect(screen.getByTestId(`nd-group-toggle-${id}`)).toHaveAttribute("aria-expanded", "false");
    }
  });
});
