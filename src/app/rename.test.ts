// The rename from DeepDraw to Nedito, and the move from myconifer.app to nedito.app (D100): nothing
// made under the old name may stop working, and nothing new may be written under it. The old host
// itself is retired (D106); its links' fragments still open on nedito.app.
import { beforeEach, describe, expect, it } from "vitest";
import { decodeDoc, encodeDoc } from "../file/documentFormat";
import { decodeEditablePng } from "../file/editablePngFormat";
import { isOpenableFileName, openFile } from "../file/openFile";
import { embedTextChunk } from "../file/pngChunks";
import { copyRecent, listRecent, memoryBackend, rememberDocument } from "../file/recentDocs";
import { createEmptyDoc } from "../model/store";
import type { DiagramDocument } from "../model/types";
import { bytesToBase64Url } from "../share/base64url";
import { gzip } from "../share/gzip";
import { decodeFragmentToDoc, encodeDocToFragment } from "../share/urlCodec";
import { appBaseUrl } from "./appOrigin";
import { ALIAS_HOSTS, BRAND, EDITABLE_PNG_EXT } from "./brand";
import { EXPORT_FORMATS, readLastExport } from "./fileActions";
import { acknowledgeMove, canonicalUrlFor, decideOrigin } from "./originGuard";
import { MIGRATION_KEY, migrateStorage } from "./storageMigration";

function docWithShape(title = "Payments"): DiagramDocument {
  const doc = createEmptyDoc();
  doc.meta = { ...doc.meta, title };
  doc.diagrams[doc.rootDiagramIds[0]].nodes.push({
    id: "n1",
    type: "shape",
    shapeRef: "general/rect",
    position: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    z: 0,
    style: {},
    label: { text: "API" },
  });
  return doc;
}

/** The document as the app wrote it before the rename: same JSON, the old format id. */
const asWrittenBeforeRename = (doc: DiagramDocument) => encodeDoc(doc).replace('"format": "nedito"', '"format": "deepdraw"');

function minimalPng(): Uint8Array {
  const sig = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const ihdr = new Uint8Array(25);
  ihdr.set(Uint8Array.of(0, 0, 0, 13), 0);
  ihdr.set(Uint8Array.from("IHDR", (c) => c.charCodeAt(0)), 4);
  const iend = Uint8Array.of(0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0);
  const out = new Uint8Array(sig.length + ihdr.length + iend.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  out.set(iend, sig.length + ihdr.length);
  return out;
}

/** What a share link's payload was before the rename: the same pipeline, the old format id. */
async function gzipBase64Url(text: string): Promise<string> {
  return bytesToBase64Url(await gzip(new TextEncoder().encode(text)));
}

describe("files made before the rename", () => {
  it("open: the old format id is read, forever", () => {
    const result = decodeDoc(asWrittenBeforeRename(docWithShape()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.meta.title).toBe("Payments");
  });

  it("open by their old extensions, .deepdraw and .deepdraw.png, beside the new ones", async () => {
    for (const name of ["a.deepdraw", "a.deepdraw.png", "a.nedito", "a.nedito.png"]) expect(isOpenableFileName(name), name).toBe(true);
    const old = await openFile(new File([asWrittenBeforeRename(docWithShape())], "plan.deepdraw"));
    expect(old.ok).toBe(true);
  });

  it("open as an old editable image (.deepdraw.png)", async () => {
    const png = embedTextChunk(minimalPng(), asWrittenBeforeRename(docWithShape("Old image")));
    const result = await decodeEditablePng(new File([png as Uint8Array<ArrayBuffer>], "plan.deepdraw.png", { type: "image/png" }));
    expect(result.ok && result.doc.meta.title).toBe("Old image");
  });

  it("share links made before the rename still decode", async () => {
    const fragment = `d=${await gzipBase64Url(asWrittenBeforeRename(docWithShape("Shared")))}&v=2`;
    const result = await decodeFragmentToDoc(fragment);
    expect(result.ok && result.doc.meta.title).toBe("Shared");
  });
});

describe("what the app writes now", () => {
  it("saves only the new format id and extensions", () => {
    expect(JSON.parse(encodeDoc(docWithShape())).format).toBe("nedito");
    const exts = EXPORT_FORMATS.map((f) => f.ext);
    expect(exts).toContain(".nedito");
    expect(exts).toContain(".nedito.png");
    expect(exts.some((e) => e.includes("deepdraw"))).toBe(false);
    expect(EDITABLE_PNG_EXT).toBe(".nedito.png");
    expect(BRAND).toMatchObject({ name: "Nedito", fileExt: ".nedito", formatId: "nedito", storagePrefix: "nedito", host: "nedito.app" });
  });

  it("puts the new format id in a share link's payload", async () => {
    const fragment = await encodeDocToFragment(docWithShape());
    const result = await decodeFragmentToDoc(fragment);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------- storage

describe("an existing user's browser storage", () => {
  beforeEach(() => localStorage.clear());

  const PROFILE: Record<string, string> = {
    "deepdraw:autosave": asWrittenBeforeRename(docWithShape("My work")),
    "deepdraw:theme": "dark",
    "deepdraw:scratchpad": JSON.stringify([{ id: "fav1", shapeRef: "general/rect", size: { w: 100, h: 60 }, style: {} }]),
    "deepdraw:recentShapes": JSON.stringify(["general/ellipse", "general/rect"]),
    "deepdraw:tourDone": "1",
    "deepdraw:tourVersion": "2",
    "deepdraw:demoDismissed": "true",
    "deepdraw:collapsedSections": JSON.stringify(["azure"]),
    "deepdraw:collapsedGroups": JSON.stringify(["cloud"]),
    "deepdraw:enabledSections": JSON.stringify({ enabled: ["general"], known: ["general"] }),
    "deepdraw:sidebarTab": "templates",
    "deepdraw:lastExport": "deepdraw-png",
    "deepdraw:liveLinkTipShown": "true",
  };

  it("carries every old-prefix key over on first load, keeping the originals until confirmed", () => {
    for (const [k, v] of Object.entries(PROFILE)) localStorage.setItem(k, v);
    const first = migrateStorage();
    expect(first.copied).toBe(Object.keys(PROFILE).length);
    for (const [k, v] of Object.entries(PROFILE)) {
      expect(localStorage.getItem(k.replace("deepdraw:", "nedito:")), k).toBe(v);
      expect(localStorage.getItem(k), `${k} kept until confirmed`).toBe(v);
    }
    // A later load confirms the copies and lets the originals go.
    const second = migrateStorage();
    expect(second.removed).toBe(Object.keys(PROFILE).length);
    for (const k of Object.keys(PROFILE)) expect(localStorage.getItem(k)).toBeNull();
    expect(JSON.parse(localStorage.getItem(MIGRATION_KEY)!).deepdraw.confirmed).toBe(true);
    // Nothing changes on any load after that.
    expect(migrateStorage()).toEqual({ copied: 0, removed: 0 });
  });

  it("never overwrites a key the new prefix already has", () => {
    localStorage.setItem("deepdraw:theme", "dark");
    localStorage.setItem("nedito:theme", "light");
    migrateStorage();
    expect(localStorage.getItem("nedito:theme")).toBe("light");
  });

  it("is what the app then reads: the last export, under its old id, still chosen", () => {
    localStorage.setItem("deepdraw:lastExport", "deepdraw-png");
    migrateStorage();
    expect(readLastExport().id).toBe("editable-png");
  });

  it("carries the Recent list into the new database", async () => {
    const oldDb = memoryBackend();
    const newDb = memoryBackend();
    await rememberDocument(docWithShape("Recent one"), oldDb);
    expect(await copyRecent(oldDb, newDb)).toBe(true);
    expect((await listRecent(newDb)).map((e) => e.title)).toEqual(["Recent one"]);
  });
});

// ---------------------------------------------------------------- hosts

describe("the move to nedito.app", () => {
  beforeEach(() => localStorage.clear());

  const at = (url: string) => {
    const u = new URL(url);
    return { hostname: u.hostname, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash };
  };

  it("sends a www.nedito.app share link to nedito.app with the # fragment intact, and it still decodes", async () => {
    const fragment = await encodeDocToFragment(docWithShape("From www"));
    const target = canonicalUrlFor(at(`https://www.nedito.app/#${fragment}`))!;
    expect(target).toBe(`https://nedito.app/#${fragment}`);
    const result = await decodeFragmentToDoc(new URL(target).hash);
    expect(result.ok && result.doc.meta.title).toBe("From www");
  });

  it("an old myconifer.app link's fragment opens unchanged on nedito.app; that host itself is retired (D106)", async () => {
    const fragment = await encodeDocToFragment(docWithShape("From the old host"));
    const result = await decodeFragmentToDoc(new URL(`https://nedito.app/#${fragment}`).hash);
    expect(result.ok && result.doc.meta.title).toBe("From the old host");
    expect(ALIAS_HOSTS).toEqual(["www.nedito.app"]);
    expect(canonicalUrlFor(at("https://myconifer.app/#d=abc"))).toBeNull();
  });

  it("keeps path and query on www.nedito.app, and leaves the canonical host alone", () => {
    expect(canonicalUrlFor(at("https://www.nedito.app/some/path?x=1#d=abc&v=5"))).toBe("https://nedito.app/some/path?x=1#d=abc&v=5");
    expect(canonicalUrlFor(at("https://nedito.app/#d=abc"))).toBeNull();
    expect(canonicalUrlFor(at("http://localhost:5173/#d=abc"))).toBeNull();
  });

  it("goes straight through when this origin holds no work", () => {
    expect(decideOrigin(at("https://www.nedito.app/"), localStorage)).toEqual({ kind: "redirect", to: "https://nedito.app/" });
    localStorage.setItem("deepdraw:autosave", encodeDoc(createEmptyDoc()));
    expect(decideOrigin(at("https://www.nedito.app/"), localStorage).kind).toBe("redirect");
  });

  it("asks first when this origin holds work, under the old prefix or the new, readable or not", () => {
    localStorage.setItem("deepdraw:autosave", asWrittenBeforeRename(docWithShape()));
    expect(decideOrigin(at("https://www.nedito.app/#d=x"), localStorage)).toEqual({ kind: "notice", to: "https://nedito.app/#d=x" });
    localStorage.clear();
    localStorage.setItem("nedito:autosave", "{ not a diagram");
    expect(decideOrigin(at("https://www.nedito.app/"), localStorage).kind).toBe("notice");
  });

  it("asks only once for the same work, and again if the work changes", () => {
    localStorage.setItem("nedito:autosave", encodeDoc(docWithShape("A")));
    acknowledgeMove(localStorage);
    expect(decideOrigin(at("https://www.nedito.app/"), localStorage).kind).toBe("redirect");
    localStorage.setItem("nedito:autosave", encodeDoc(docWithShape("B")));
    expect(decideOrigin(at("https://www.nedito.app/"), localStorage).kind).toBe("notice");
  });

  it("builds every link the app hands out on nedito.app, from any production host; elsewhere on the page itself", () => {
    expect(appBaseUrl(at("https://www.nedito.app/"))).toBe("https://nedito.app/");
    expect(appBaseUrl(at("https://nedito.app/"))).toBe("https://nedito.app/");
    expect(appBaseUrl(at("http://localhost:5173/"))).toBe("http://localhost:5173/");
  });
});
