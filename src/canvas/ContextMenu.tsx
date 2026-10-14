import { useEffect } from "react";
import { useDocStore } from "../model/store";
import { groupOfSelection } from "../model/selectionGroup";
import { chooseAndReplaceImage, insertImageFiles, pasteFromMenu, pickImageFiles } from "../app/insertImage";
import { markShapesOnSystemClipboard } from "../app/systemClipboard";
import { IMAGE_SHAPE_REF } from "../model/assets";
import { getCanvasInstance } from "./canvasApi";
import { computeGhostLinks } from "../nesting/ghostLinkGeometry";
import { convertSelectionAndName, navigateIntoNested } from "../nesting/navigation";
import styles from "./ContextMenu.module.css";

export type ContextMenuTarget = "canvas" | "node" | "edge";

interface ContextMenuProps {
  target: ContextMenuTarget;
  x: number;
  y: number;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

// The right-click menu adapts to what was clicked: empty canvas gets paste/select-all;
// a shape or edge gets cut/copy/paste/duplicate/delete plus type-specific actions
// (z-order/group for shapes, "Convert to nested block" for a shape selection, "Open child
// diagram" for a single nested node). Closes on any outside click or Escape.
export function ContextMenu({ target, x, y, onClose }: ContextMenuProps) {
  const doc = useDocStore((s) => s.doc);
  const diagramId = useDocStore((s) => s.currentDiagramId());
  const navStack = useDocStore((s) => s.navStack);
  const selection = useDocStore((s) => s.selection);
  const viewerMode = useDocStore((s) => s.ui.viewerMode);
  const tidyingUp = useDocStore((s) => s.ui.tidyingUp);
  const store = useDocStore.getState;

  const diagram = doc.diagrams[diagramId];
  const selectedNodes = diagram.nodes.filter((n) => selection.nodeIds.includes(n.id));
  const selectedEdges = diagram.edges.filter((e) => selection.edgeIds.includes(e.id));
  const singleNode = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : undefined;
  const canTidy = !viewerMode && !tidyingUp && diagram.nodes.length > 1;

  useEffect(() => {
    const onPointerDown = () => onClose();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const groups: MenuItem[][] = [];

  if (target === "canvas") {
    // Where the menu was opened: an inserted picture goes there, not at the view's centre.
    const at = getCanvasInstance()?.screenToFlowPosition({ x, y });
    groups.push([
      // Always offered: the system clipboard may hold an image even when nothing was copied here.
      // A pasted picture lands where the menu was opened.
      { label: "Paste", onClick: run(() => void pasteFromMenu(at)) },
      { label: "Select All", onClick: run(() => store().selectAll()) },
    ]);
    groups.push([
      { label: "Insert image…", onClick: run(() => void pickImageFiles(true).then((files) => insertImageFiles(files, at))) },
    ]);
    // Auto-layout with nothing selected: the level, and the levels under it when there are any.
    if (canTidy) {
      const tidy: MenuItem[] = [
        { label: "Tidy up this level", onClick: run(() => void store().tidyUp({ scope: "level" })) },
      ];
      if (diagram.nodes.some((n) => n.type === "nested")) {
        tidy.push({
          label: "Tidy up every level below",
          onClick: run(() => void store().tidyUp({ scope: "all-levels" })),
        });
      }
      groups.push(tidy);
    }
  } else {
    groups.push([
      {
        label: "Cut",
        onClick: run(() => (store().cutSelection(), markShapesOnSystemClipboard())),
        disabled: selectedNodes.length === 0,
      },
      {
        label: "Copy",
        onClick: run(() => (store().copySelection(), markShapesOnSystemClipboard())),
        disabled: selectedNodes.length === 0,
      },
      { label: "Paste", onClick: run(() => void pasteFromMenu()) },
      { label: "Duplicate", onClick: run(() => store().duplicateSelection()), disabled: selectedNodes.length === 0 },
      { label: "Delete", onClick: run(() => store().removeSelection()) },
    ]);

    if (selectedNodes.length > 0) {
      const nodeIds = selection.nodeIds;
      groups.push([
        { label: "To Front", onClick: run(() => store().bringToFront(nodeIds)) },
        { label: "To Back", onClick: run(() => store().sendToBack(nodeIds)) },
        { label: "Forward", onClick: run(() => store().moveForward(nodeIds)) },
        { label: "Backward", onClick: run(() => store().moveBackward(nodeIds)) },
      ]);

      const relatedGroup = groupOfSelection(diagram.nodes, nodeIds);
      const groupUngroup: MenuItem[] = [];
      if (selectedNodes.length >= 2 && !relatedGroup) {
        groupUngroup.push({ label: "Group", onClick: run(() => store().groupSelection()) });
      }
      if (relatedGroup) {
        groupUngroup.push({ label: "Ungroup", onClick: run(() => store().ungroupSelection()) });
      }
      if (groupUngroup.length > 0) groups.push(groupUngroup);

      if (canTidy && selectedNodes.length >= 2) {
        groups.push([
          { label: "Tidy up selection", onClick: run(() => void store().tidyUp({ scope: "selection" })) },
        ]);
      }

      if (singleNode?.type === "shape" && singleNode.shapeRef === IMAGE_SHAPE_REF) {
        groups.push([
          { label: "Replace image…", onClick: run(() => void chooseAndReplaceImage(singleNode.id)) },
          { label: "Original size", onClick: run(() => store().resetImageSize(singleNode.id)) },
        ]);
      }

      const nestingItems: MenuItem[] = [];
      if (singleNode?.type !== "nested" && singleNode?.type !== "group") {
        nestingItems.push({ label: "Convert to nested block", onClick: run(convertSelectionAndName) });
      }
      if (singleNode?.type === "nested") {
        nestingItems.push({ label: "Open child diagram", onClick: run(() => navigateIntoNested(singleNode.id)) });
      }
      // Keyboard/menu-accessible counterpart to dragging a loose ghost endpoint onto a node.
      // Each waiting connection gets its own entry rather than a submenu, so the author can see
      // which one they're linking without a second level of navigation.
      if (singleNode && singleNode.type !== "group") {
        for (const link of computeGhostLinks(doc, navStack).filter((l) => !l.innerNodeId)) {
          nestingItems.push({
            label: `Link "${link.label} · parent" here`,
            onClick: run(() => store().mapUnlinkedPort(link.portId, singleNode.id)),
          });
        }
      }
      if (nestingItems.length > 0) groups.push(nestingItems);

      // Not just a single plain shape: a multi-shape selection or a selected group (favoriting
      // captures each of its member shapes individually) can be saved too — restricting this
      // to exactly one bare "shape" node meant right-clicking the very icons a user had just
      // grouped together offered no way to favorite them at all.
      const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
      const canFavorite = selectedNodes.some(
        (n) => n.type === "shape" || (n.type === "group" && n.childIds.some((id) => nodeById.get(id)?.type === "shape")),
      );
      if (canFavorite) {
        groups.push([{ label: "Add to Favorites", onClick: run(() => store().addSelectionToScratchpad()) }]);
      }
    }

    // A label dragged off the middle of its line can be put back (D97).
    const moved = selectedEdges.filter((e) => e.labelPosition).map((e) => e.id);
    if (moved.length > 0) {
      groups.push([{ label: "Reset label position", onClick: run(() => store().setEdgeLabelPosition(moved, null)) }]);
    }
  }

  return (
    <div
      className={styles.menu}
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="nd-context-menu"
    >
      {groups.map((items, i) => (
        <div key={i} className={styles.section}>
          {i > 0 && <div className={styles.divider} />}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={styles.item}
              onClick={item.onClick}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
