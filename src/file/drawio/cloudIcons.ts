// Cloud icons on draw.io import (X1, CLAUDE_HISTORY.md D132): an AWS, Azure or GCP icon in a
// .drawio file becomes the official icon Nedito ships for the same service, instead of a coloured
// box. draw.io names the service in its style — `resIcon=mxgraph.aws4.lambda`,
// `shape=mxgraph.aws4.bucket`, `image=img/lib/azure2/compute/Virtual_Machine.svg`,
// `shape=mxgraph.gcp2.hexIcon;prIcon=cloud_run` — and Nedito's icons are named for the service in
// the vendors' own packs, so the two meet by name: exactly, through a short list of draw.io's own
// abbreviations, or by every word of draw.io's name appearing in one of ours. Nothing is drawn
// from draw.io; only its names are read (CLAUDE.md's provenance guardrail). An icon that matches
// nothing keeps the old fallback and its notice.
import awsManifest from "../../library/stencils/assets/aws/manifest";
import azureManifest from "../../library/stencils/assets/azure/manifest";
import gcpManifest from "../../library/stencils/assets/gcp/manifest";
import type { IconManifestEntry } from "../../library/stencils/vendorIcons";
import type { MxStyle } from "./mxStyle";

type Vendor = "aws" | "azure" | "gcp";

/** Words that name the vendor rather than the service. */
const VENDOR_WORDS = new Set(["amazon", "aws", "azure", "microsoft", "google", "gcp", "arch", "48"]);

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\.svg$/, "")
    .replace(/^\d+-/, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !VENDOR_WORDS.has(w));
}

const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const key = (ws: string[]) => ws.map(singular).join(" ");

/** draw.io's abbreviations for services our packs spell out. Keys and values are word lists. */
const ALIASES: Record<Vendor, Record<string, string>> = {
  aws: {
    bucket: "simple storage service",
    s3: "simple storage service",
    eks: "elastic kubernetes service",
    ecs: "elastic container service",
    ecr: "elastic container registry",
    sqs: "simple queue service",
    sns: "simple notification service",
    ses: "simple email service",
    efs: "efs",
    elb: "elastic load balancing",
    "application load balancer": "elastic load balancing",
    "network load balancer": "elastic load balancing",
    "api gateway endpoint": "api gateway",
    "dynamodb table": "dynamodb",
    "rds instance": "rds",
    "lambda function": "lambda",
    instance: "ec2",
    "ec2 instance": "ec2",
  },
  azure: {
    vm: "virtual machine",
    "virtual machines": "virtual machine",
    aks: "kubernetes service",
    "kubernetes services": "kubernetes service",
  },
  gcp: {
    "kubernetes engine": "gke",
    "google kubernetes engine": "gke",
    spanner: "cloud spanner",
    sql: "cloud sql",
    run: "cloud run",
    storage: "cloud storage",
    gcs: "cloud storage",
    gce: "compute engine",
  },
};

interface Index {
  exact: Map<string, string>;
  all: { id: string; words: string[] }[];
}

const MANIFESTS: Record<Vendor, Record<string, IconManifestEntry>> = { aws: awsManifest, azure: azureManifest, gcp: gcpManifest };
const indexes = new Map<Vendor, Index>();

function index(vendor: Vendor): Index {
  let ix = indexes.get(vendor);
  if (ix) return ix;
  ix = { exact: new Map(), all: [] };
  for (const { id } of Object.values(MANIFESTS[vendor])) {
    // GCP's category tiles are section headings, not services.
    if (id.startsWith("gcp/category/")) continue;
    const ws = words(id.split("/").pop()!);
    const k = key(ws);
    if (!ix.exact.has(k)) ix.exact.set(k, id);
    ix.all.push({ id, words: ws.map(singular) });
  }
  indexes.set(vendor, ix);
  return ix;
}

/** Nedito's icon for a service name, or null. */
export function matchCloudIcon(vendor: Vendor, name: string): string | null {
  const ix = index(vendor);
  const ws = words(name);
  if (ws.length === 0) return null;
  const k = key(ws);
  const exact = ix.exact.get(k);
  if (exact) return exact;
  const alias = ALIASES[vendor][ws.join(" ")] ?? ALIASES[vendor][k];
  if (alias) {
    const viaAlias = ix.exact.get(key(words(alias)));
    if (viaAlias) return viaAlias;
  }
  // Every word of draw.io's name in one of ours, with the fewest words over (a near miss like
  // "Lambda Function" finding "Lambda" goes the other way, through the aliases).
  const wanted = k.split(" ");
  let best: { id: string; extra: number } | null = null;
  for (const c of ix.all) {
    if (!wanted.every((w) => c.words.includes(w))) continue;
    const extra = c.words.length - wanted.length;
    if (extra <= 2 && (!best || extra < best.extra)) best = { id: c.id, extra };
  }
  return best?.id ?? null;
}

/** The vendor and service a draw.io style names, if it is one of the three clouds' icons. */
export function cloudServiceOf(style: MxStyle, imageRef: string | null): { vendor: Vendor; name: string } | null {
  const shape = (style.keys.shape ?? "").toLowerCase();
  const resIcon = (style.keys.resIcon ?? "").toLowerCase();
  if (resIcon.startsWith("mxgraph.aws4.") || resIcon.startsWith("mxgraph.aws3.")) return { vendor: "aws", name: resIcon.split(".").slice(2).join(" ") };
  if (shape.startsWith("mxgraph.aws4.") || shape.startsWith("mxgraph.aws3.")) {
    const name = shape.split(".").slice(2).join(" ");
    // Containers and frames (groups, region boxes) are not services.
    if (/^(group|groupcenter|resourceicon|producticon|illustration)/.test(name)) return null;
    return { vendor: "aws", name };
  }
  if (shape.startsWith("mxgraph.gcp2.")) {
    const prIcon = style.keys.prIcon;
    if (prIcon) return { vendor: "gcp", name: prIcon };
    const name = shape.split(".").slice(2).join(" ");
    return /^(hexicon|doubleRect|rect|frame)/i.test(name) ? null : { vendor: "gcp", name };
  }
  if (imageRef && /img\/lib\/(azure2|mscae)\//i.test(imageRef)) {
    return { vendor: "azure", name: imageRef.split("/").pop()! };
  }
  return null;
}
