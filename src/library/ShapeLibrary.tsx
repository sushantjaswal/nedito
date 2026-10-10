import { memo, useEffect, useMemo, useRef, useState } from "react";
import { viewCenter } from "../canvas/canvasApi";
import { shapeDash } from "../canvas/shapeEffects";
import { useDocStore } from "../model/store";
import { readCollapsedSections, writeCollapsedSections } from "./collapsedSections";
import { readEnabledSections, writeEnabledSections } from "./enabledSections";
import { BrowseLibrariesDialog } from "./BrowseLibrariesDialog";
import { LIBRARY_GROUPS, readCollapsedGroups, revealEssentialsOnce, sectionDisplayLabel, writeCollapsedGroups, type LibraryGroup } from "./libraryGroups";
import { readRecentShapes, recordShapeUse, subscribeRecentShapes } from "./recentShapes";
import { ScratchpadSection } from "./ScratchpadSection";
import { cacheStencils, getStencil, loadSection, pickerShapes, SECTION_IDS, type SectionId, sectionLabel } from "./stencils";
import { getStencilPreviewStyle, getStencilRenderFill, isIconStyleStencil, stencilBody } from "./stencils/defaultStyle";
import type { StencilDef, StencilSection } from "./stencils/types";
import { StencilGlyph } from "./stencils/StencilGlyph";
import { stencilMatches } from "./stencilSearch";
import styles from "./ShapeLibrary.module.css";
import { TemplateBrowser } from "../templates/TemplateBrowser";

const STENCIL_MIME = "application/nd-stencil";

const NESTED_STENCIL_ID = "general/nested";

function viewportCenter(size: { w: number; h: number }): { x: number; y: number } {
  const center = viewCenter();
  return { x: center.x - size.w / 2, y: center.y - size.h / 2 };
}

function placeAtViewportCenter(stencil: StencilDef) {
  recordShapeUse(stencil.id);
  const position = viewportCenter(stencil.defaultSize);
  if (stencil.id === NESTED_STENCIL_ID) {
    useDocStore.getState().addNestedNode(position, stencil.defaultSize);
  } else {
    useDocStore.getState().addShapeNode(stencil.id, position, stencil.defaultSize);
  }
}

function onStencilDragStart(event: React.DragEvent, stencil: StencilDef) {
  const kind = stencil.id === NESTED_STENCIL_ID ? "nested" : "shape";
  event.dataTransfer.setData(STENCIL_MIME, JSON.stringify({ id: stencil.id, w: stencil.defaultSize.w, h: stencil.defaultSize.h, kind }));
  event.dataTransfer.effectAllowed = "copy";
}

// Memoized: Azure/AWS now ship hundreds of stencils in one grid (see vendorIcons.ts), so this
// re-rendering on every unrelated ShapeLibrary state change (search query, section toggles)
// would otherwise mean hundreds of button re-renders for a change that touches none of them.
const ShapeButton = memo(function ShapeButton({ stencil, testIdPrefix = "nd-stencil-" }: { stencil: StencilDef; testIdPrefix?: string }) {
  const previewStyle = getStencilPreviewStyle(stencil);
  // The nested-diagram stencil isn't an ordinary shape — placing it creates a whole child
  // diagram — so its glyph carries the nesting accent. Colour only, deliberately: tinting the
  // tile itself made the entry look permanently selected.
  const isNested = stencil.id === NESTED_STENCIL_ID;
  return (
    <button
      type="button"
      className={isNested ? `${styles.shapeItem} ${styles.shapeItemNested}` : styles.shapeItem}
      draggable
      onDragStart={(e) => onStencilDragStart(e, stencil)}
      onClick={() => placeAtViewportCenter(stencil)}
      title={stencil.label}
      data-testid={`${testIdPrefix}${stencil.id}`}
    >
      <StencilGlyph
        svgBody={stencilBody(stencil)}
        raw={stencil.raw}
        fill={isNested ? "var(--nd-color-nest-soft-fill)" : getStencilRenderFill(stencil)}
        stroke={isNested ? "var(--nd-color-nest-deep)" : previewStyle.stroke}
        strokeWidth={previewStyle.strokeWidth}
        className={styles.shapeGlyph}
        aspectRatio={isIconStyleStencil(stencil) ? undefined : stencil.defaultSize.w / stencil.defaultSize.h}
        dash={stencil.defaultStyle ? shapeDash(stencil.defaultStyle) : undefined}
      />
      <span className={styles.shapeLabel}>{stencil.label}</span>
    </button>
  );
});

function SectionHeader({
  id,
  label,
  collapsed,
  onToggle,
  count,
  sub = false,
}: {
  id: SectionId;
  label: string;
  collapsed: boolean;
  onToggle: (id: SectionId) => void;
  count?: number;
  /** A section shown inside its purpose group (R4), so a step down from the group's heading. */
  sub?: boolean;
}) {
  return (
    <button
      type="button"
      // Top level (Favorites) reads as a group heading; inside a group, as a quieter sub-heading.
      // Both in sentence case: the all-caps section style predates the groups (fixed in review).
      className={sub ? styles.subToggle : styles.groupToggle}
      onClick={() => onToggle(id)}
      aria-expanded={!collapsed}
      data-testid={`nd-section-toggle-${id}`}
    >
      <span className={styles.sectionChevron} data-collapsed={collapsed}>
        ▾
      </span>
      {label}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  );
}

/** A purpose group's heading (R4, D93): its name and how many shapes are in it. */
function GroupHeader({ group, collapsed, count, onToggle }: { group: LibraryGroup; collapsed: boolean; count?: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={styles.groupToggle}
      onClick={onToggle}
      aria-expanded={!collapsed}
      data-testid={`nd-group-toggle-${group.id}`}
    >
      <span className={styles.sectionChevron} data-collapsed={collapsed}>
        ▾
      </span>
      {group.label}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  );
}

/** The last shapes placed from the library, newest first (R4, D93). Hidden until there is one. */
function RecentlyUsed({ revision }: { revision: number }) {
  const [ids, setIds] = useState(readRecentShapes);
  useEffect(() => subscribeRecentShapes(() => setIds(readRecentShapes())), []);
  // `revision` changes as sections load, so ids placed in an earlier visit resolve once theirs has.
  const stencils = useMemo(
    () => ids.map((id) => getStencil(id)).filter((s): s is StencilDef => !!s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, revision],
  );
  if (stencils.length === 0) return null;
  return (
    <div data-testid="nd-recent-shapes">
      <div className={styles.recentHeading}>Recently used</div>
      <div className={styles.shapeGrid}>
        {stencils.map((stencil) => (
          <ShapeButton key={stencil.id} stencil={stencil} testIdPrefix="nd-recent-stencil-" />
        ))}
      </div>
    </div>
  );
}

export function ShapeLibrary() {
  const [sections, setSections] = useState<Record<string, StencilSection | null>>({});
  const [query, setQuery] = useState("");
  const sidebarTab = useDocStore((s) => s.ui.sidebarTab);
  const setSidebarTab = useDocStore((s) => s.setSidebarTab);
  const [enabledSections, setEnabledSections] = useState<Set<SectionId>>(() => readEnabledSections());
  const [browseOpen, setBrowseOpen] = useState(false);
  // Read together, once: groups are derived from the sections the first time (see
  // readCollapsedGroups) and then saved, so from here on a group opens and closes only when its own
  // heading is clicked; and Basics › Essentials is opened once in every browser.
  const [initial] = useState(() => {
    const sections = readCollapsedSections();
    const groups = readCollapsedGroups(sections);
    if (revealEssentialsOnce(sections, groups)) writeCollapsedSections(sections);
    writeCollapsedGroups(groups);
    return { sections, groups };
  });
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionId>>(initial.sections);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(initial.groups);
  const favoritesCount = useDocStore((s) => s.scratchpad.length);
  const prevFavoritesCount = useRef(favoritesCount);

  // "Add to Favorites" lives on the canvas context menu, far from the sidebar — if the
  // Favorites section happened to be collapsed, clicking it looked like it did nothing. Expand
  // it automatically the moment an item lands, so the capture is visibly confirmed.
  useEffect(() => {
    if (favoritesCount > prevFavoritesCount.current) {
      setCollapsedSections((prev) => {
        if (!prev.has("scratchpad")) return prev;
        const next = new Set(prev);
        next.delete("scratchpad");
        writeCollapsedSections(next);
        return next;
      });
    }
    prevFavoritesCount.current = favoritesCount;
  }, [favoritesCount]);

  useEffect(() => {
    let cancelled = false;
    for (const id of SECTION_IDS) {
      loadSection(id).then((section) => {
        if (cancelled) return;
        if (section) cacheStencils(section.shapes);
        setSections((prev) => ({ ...prev, [id]: section }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const searchResults = useMemo(() => {
    // Matches the label, the stencil id's own words and any hand-authored keywords. The id is
    // in there deliberately: every pictogram's id is the Material Symbols name it was
    // originally labelled with, so renaming "Filter Drama" to "Cloud" costs nobody the ability
    // to find it by the old name.
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const results: StencilDef[] = [];
    for (const id of SECTION_IDS) {
      if (!enabledSections.has(id)) continue;
      const section = sections[id];
      if (!section) continue;
      for (const stencil of pickerShapes(section)) {
        if (stencilMatches(stencil, q)) results.push(stencil);
      }
    }
    return results;
  }, [query, sections, enabledSections]);

  const toggleSection = (id: SectionId) => {
    setEnabledSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeEnabledSections(next);
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCollapsedGroups(next);
      return next;
    });
  };

  const sectionGrid = (id: SectionId) => {
    const section = sections[id];
    if (!section || pickerShapes(section).length === 0) return null;
    return (
      <div className={styles.shapeGrid}>
        {pickerShapes(section).map((stencil) => (
          <ShapeButton key={stencil.id} stencil={stencil} />
        ))}
      </div>
    );
  };
  const shapeCount = (id: SectionId) => (sections[id] ? pickerShapes(sections[id]!).length : 0);

  const toggleCollapsed = (id: SectionId) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCollapsedSections(next);
      return next;
    });
  };

  return (
    <aside className={`${styles.sidebar} nd-library`} data-testid="nd-shape-library">
      {/* Templates sit beside Shapes rather than in a menu: a catalogue someone has to go
          looking for is one most people never find. The search box serves whichever is showing. */}
      <div className={styles.tabs} role="tablist" aria-label="Sidebar contents">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "shapes"}
          className={`${styles.tab} ${sidebarTab === "shapes" ? styles.tabActive : ""}`}
          onClick={() => setSidebarTab("shapes")}
          data-testid="nd-sidebar-tab-shapes"
        >
          Shapes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "templates"}
          className={`${styles.tab} ${sidebarTab === "templates" ? styles.tabActive : ""}`}
          onClick={() => setSidebarTab("templates")}
          data-testid="nd-sidebar-tab-templates"
        >
          Templates
        </button>
      </div>
      <input
        className={styles.search}
        placeholder={sidebarTab === "templates" ? "Search templates" : "Search shapes"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="nd-shape-search"
      />
      {sidebarTab === "templates" ? (
        <TemplateBrowser query={query} />
      ) : searchResults ? (
        <div>
          <div className={styles.section}>
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
          </div>
          {searchResults.length > 0 && (
            <div className={styles.shapeGrid}>
              {searchResults.map((stencil) => (
                <ShapeButton key={stencil.id} stencil={stencil} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Search first, then what was used last, then Favorites, then the purpose groups (R4). */}
          <RecentlyUsed revision={Object.keys(sections).length} />
          {enabledSections.has("scratchpad") && (
            <div>
              <SectionHeader id="scratchpad" label={sectionLabel("scratchpad")} collapsed={collapsedSections.has("scratchpad")} onToggle={toggleCollapsed} />
              {!collapsedSections.has("scratchpad") && <ScratchpadSection />}
            </div>
          )}
          {LIBRARY_GROUPS.map((group) => {
            const shown = group.sections.filter((id) => enabledSections.has(id));
            if (shown.length === 0) return null;
            // Counted once every section in it has loaded, rather than flashing 0 first.
            const count = shown.every((id) => id in sections) ? shown.reduce((n, id) => n + shapeCount(id), 0) : undefined;
            // A group of one section is that section: one heading, the section's own open state.
            if (group.sections.length === 1) {
              const id = group.sections[0];
              const collapsed = collapsedSections.has(id);
              return (
                <div key={group.id} data-testid={`nd-group-${group.id}`}>
                  <GroupHeader group={group} collapsed={collapsed} count={count} onToggle={() => toggleCollapsed(id)} />
                  {!collapsed && sectionGrid(id)}
                </div>
              );
            }
            const collapsed = collapsedGroups.has(group.id);
            return (
              <div key={group.id} data-testid={`nd-group-${group.id}`}>
                <GroupHeader group={group} collapsed={collapsed} count={count} onToggle={() => toggleGroup(group.id)} />
                {!collapsed &&
                  shown.map((id) => {
                    const sectionCollapsed = collapsedSections.has(id);
                    return (
                      <div key={id}>
                        <SectionHeader
                          id={id}
                          label={sectionDisplayLabel(id)}
                          collapsed={sectionCollapsed}
                          onToggle={toggleCollapsed}
                          count={id in sections ? shapeCount(id) : undefined}
                          sub
                        />
                        {!sectionCollapsed && sectionGrid(id)}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </>
      )}
      {/* Enables and disables *stencil* sections, so it belongs to the Shapes half only. */}
      {sidebarTab === "shapes" && (
        <button
          type="button"
          className={styles.moreShapesBtn}
          onClick={() => setBrowseOpen(true)}
          data-testid="nd-browse-libraries-trigger"
        >
          Browse all libraries
        </button>
      )}
      {browseOpen && (
        <BrowseLibrariesDialog
          enabled={enabledSections}
          onToggle={toggleSection}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </aside>
  );
}
