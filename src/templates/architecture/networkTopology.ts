// A network topology: where traffic enters, what inspects it, and what it reaches.
//
// Vendor-neutral on purpose — this is the one architecture template that should not assume a
// cloud. It uses the Network section's own shapes, so it reads the same whether the kit is in a
// rack or a data centre.
//
// Laid out the way a perimeter design is usually drawn: the internet on the left, then the edge
// router and the firewall in line, a DMZ above the firewall for what the public may reach, and
// the internal LAN behind it in two layers — a core switch for servers, an access switch for
// people's devices. Every device's name hangs below it, so links join devices at their sides.
import type { DEdge, StyleMap } from "../../model/types";
import { DIRECT, LINK, ZONE, boundary, link, node, page } from "./archKit";
import { templateDoc } from "../starters/basicFlowchart";

const N = "network";
const DEVICE: StyleMap = {};
const DMZ: StyleMap = { ...ZONE, stroke: "#C98A0B", dash: "dashed" };
const LAN: StyleMap = { ...ZONE, stroke: "#3C7FC0" };

/** A device, placed by its centre so a row of them lines up whatever each one's size. */
function device(slug: string, ref: string, text: string, cx: number, cy: number, w: number, h: number, z: number) {
  return node(slug, `${N}/${ref}`, text, cx - w / 2, cy - h / 2, w, h, z, DEVICE);
}

const ROW = 440;

const diagram = page(
  "dNetTopology",
  "Network topology",
  [
    device("tInternet", "cloud", "Internet", 100, ROW, 110, 72, 3),
    device("tRouter", "router", "Edge router", 260, ROW, 90, 50, 4),
    device("tFirewall", "firewall", "Perimeter firewall", 410, ROW, 64, 64, 5),

    ...boundary("dmz", "DMZ", 520, 100, 360, 170, DMZ),
    device("tProxy", "security", "Reverse proxy", 600, 190, 56, 56, 6),
    device("tWeb", "server", "Web servers", 780, 190, 50, 70, 7),

    ...boundary("lan", "Internal LAN", 520, 340, 520, 520, LAN),
    device("tCore", "switch", "Core switch", 610, ROW, 100, 50, 8),
    device("tApp", "server", "App servers", 780, ROW, 50, 70, 9),
    device("tDb", "database", "Database", 940, ROW, 80, 72, 10),
    device("tAccess", "switch", "Access switch", 610, 700, 100, 50, 11),
    device("tDesktop", "desktop-windows", "Workstations", 830, 600, 56, 56, 12),
    device("tLaptop", "laptop-mac", "Laptops", 830, 700, 56, 56, 13),
    device("tPrinter", "print", "Printers", 830, 800, 56, 56, 14),

    device("tRemote", "phone-iphone", "Remote workers", 100, 700, 56, 56, 15),
    device("tVpn", "vpn-lock", "VPN gateway", 410, 700, 56, 56, 16),
  ],
  [
    link("nInetRouter", "tInternet", "tRouter", LINK, undefined, ["right", "left"]),
    link("nRouterFw", "tRouter", "tFirewall", LINK, undefined, ["right", "left"]),
    link("nFwProxy", "tFirewall", "tProxy", LINK, "HTTPS", ["top", "left"]),
    link("nProxyWeb", "tProxy", "tWeb", LINK, undefined, ["right", "left"]),
    link("nWebApp", "tWeb", "tApp", LINK, undefined, ["right", "top"]),
    link("nFwCore", "tFirewall", "tCore", LINK, undefined, ["right", "left"]),
    link("nCoreApp", "tCore", "tApp", LINK, undefined, ["right", "left"]),
    link("nAppDb", "tApp", "tDb", LINK, undefined, ["right", "left"]),
    link("nCoreAccess", "tCore", "tAccess", LINK, "uplink", ["bottom", "top"]),
    link("nAccessDesk", "tAccess", "tDesktop", LINK, undefined, ["right", "left"]),
    link("nAccessLaptop", "tAccess", "tLaptop", LINK, undefined, ["right", "left"]),
    link("nAccessPrinter", "tAccess", "tPrinter", LINK, undefined, ["right", "left"]),
    link("nRemoteVpn", "tRemote", "tVpn", DIRECT, "encrypted tunnel", ["right", "left"]),
    link("nVpnAccess", "tVpn", "tAccess", DIRECT, undefined, ["right", "left"]),
  ],
);

// The uplink drops from the core switch's left end, clear of its name, to the access switch.
diagram.edges = diagram.edges.map((e): DEdge =>
  e.id.startsWith("nCoreAccess")
    ? { ...e, source: { ...e.source, anchor: { x: 0.06, y: 1 } }, target: { ...e.target, anchor: { x: 0.06, y: 0 } } }
    : e,
);

export default templateDoc("Network topology", [diagram]);
