// What only these templates can get wrong.
//
// The catalogue test already checks every document validates, every shapeRef resolves and every
// port is mapped. What it cannot know is whether a *cloud* template is architecturally honest:
// whether a boundary box would paint over the links inside it, whether the Kubernetes template
// really avoids vendor artwork the repo has no licence for, and whether the things drawn inside
// a VPC or a cluster actually belong there.
import { describe, expect, it } from "vitest";
import { getStencil, loadSection } from "../../library/stencils";
import type { DNode, DiagramDocument, NestedNode } from "../../model/types";
import awsBedrockRag from "./awsBedrockRag";
import awsThreeTier from "./awsThreeTier";
import azureFoundryChat from "./azureFoundryChat";
import azureLandingZone from "./azureLandingZone";
import gcpMlPlatform from "./gcpMlPlatform";
import gcpWebApp from "./gcpWebApp";
import kubernetesCluster from "./kubernetesCluster";
import networkTopology from "./networkTopology";

const ALL: [string, DiagramDocument][] = [
  ["azure-landing-zone", azureLandingZone],
  ["network-topology", networkTopology],
  ["aws-three-tier", awsThreeTier],
  ["gcp-web-app", gcpWebApp],
  ["kubernetes-cluster", kubernetesCluster],
  ["aws-bedrock-rag", awsBedrockRag],
  ["azure-foundry-chat", azureFoundryChat],
  ["gcp-ml-platform", gcpMlPlatform],
];

const nodesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.nodes);
const edgesOf = (doc: DiagramDocument) => Object.values(doc.diagrams).flatMap((d) => d.edges);
const shapes = (doc: DiagramDocument) => nodesOf(doc).filter((n): n is Extract<DNode, { type: "shape" }> => n.type === "shape");

/** A node fully inside another's box. */
function contains(outer: DNode, inner: DNode): boolean {
  return (
    inner.position.x >= outer.position.x &&
    inner.position.y >= outer.position.y &&
    inner.position.x + inner.size.w <= outer.position.x + outer.size.w &&
    inner.position.y + inner.size.h <= outer.position.y + outer.size.h
  );
}

describe("the Architecture & Cloud templates", () => {
  // React Flow draws every node above the edge layer, so a filled container hides the links
  // running through it. This is the bug that made the Azure hub's icons look unconnected.
  it.each(ALL)("%s draws every boundary box as an outline, never filled", (_id, doc) => {
    for (const node of shapes(doc)) {
      if (node.shapeRef !== "general/rect") continue;
      expect(node.style.fill, `${node.id} is a filled container and would hide its own links`).toBe("none");
    }
  });

  it.each(ALL)("%s names both ends of every link", (_id, doc) => {
    // An unnamed end anchors at the node's top, which in a topology drawing means the link
    // loops over the diagram instead of joining two things (CLAUDE_HISTORY.md D67).
    for (const edge of edgesOf(doc)) {
      const hasPort = Boolean(edge.source.portId || edge.target.portId);
      if (hasPort) continue;
      expect(edge.style.sourceHandle, `${edge.id} has an unanchored source`).toBeTruthy();
      expect(edge.style.targetHandle, `${edge.id} has an unanchored target`).toBeTruthy();
    }
  });

  // The spec is explicit: Kubernetes icons only if an openly licensed set is added with NOTICE
  // attribution, otherwise generic shapes. No such set is in the repo.
  it("draws the Kubernetes cluster without any vendor artwork", async () => {
    await Promise.all([loadSection("azure"), loadSection("aws"), loadSection("gcp")]);
    for (const node of shapes(kubernetesCluster)) {
      expect(node.shapeRef.startsWith("azure/"), `${node.id} uses an Azure icon`).toBe(false);
      expect(node.shapeRef.startsWith("aws/"), `${node.id} uses an AWS icon`).toBe(false);
      expect(node.shapeRef.startsWith("gcp/"), `${node.id} uses a GCP icon`).toBe(false);
      // Nothing that renders as an unthemed vendor glyph either.
      expect(getStencil(node.shapeRef)?.raw, `${node.id} is a raw vendor icon`).toBeFalsy();
    }
  }, 20_000); // loads ~1,000 vendor icons: past the 5s default when the whole suite runs at once

  it("puts each cloud template's icons in that cloud's own set", async () => {
    await Promise.all([loadSection("azure"), loadSection("aws"), loadSection("gcp")]);
    const vendorRefs = (doc: DiagramDocument) =>
      shapes(doc)
        .map((n) => n.shapeRef)
        .filter((r) => /^(azure|aws|gcp)\//.test(r));
    // Vendor-neutral shapes (a user, a cloud) are fine anywhere; a rival's logo is not.
    for (const r of vendorRefs(azureLandingZone)) expect(r.startsWith("azure/")).toBe(true);
    for (const r of vendorRefs(awsThreeTier)) expect(r.startsWith("aws/")).toBe(true);
    for (const r of vendorRefs(gcpWebApp)) expect(r.startsWith("gcp/")).toBe(true);
    for (const r of vendorRefs(awsBedrockRag)) expect(r.startsWith("aws/")).toBe(true);
    for (const r of vendorRefs(azureFoundryChat)) expect(r.startsWith("azure/")).toBe(true);
    for (const r of vendorRefs(gcpMlPlatform)) expect(r.startsWith("gcp/")).toBe(true);
    expect(vendorRefs(networkTopology)).toEqual([]);
  }, 20_000); // loads ~1,000 vendor icons: past the 5s default when the whole suite runs at once

  it("keeps S3 outside the VPC, because that is where it is", () => {
    const byId = new Map(nodesOf(awsThreeTier).map((n) => [n.id, n]));
    const find = (frag: string) => [...byId.values()].find((n) => n.id.startsWith(frag))!;
    const vpc = find("vpc");
    expect(contains(vpc, find("aS3"))).toBe(false);
    // The tiers, by contrast, really are inside it.
    expect(contains(vpc, find("aWebA"))).toBe(true);
    expect(contains(vpc, find("aRds"))).toBe(true);
  });

  it("spans the load balancer across both availability zones, not inside one", () => {
    const byId = new Map(nodesOf(awsThreeTier).map((n) => [n.id, n]));
    const find = (frag: string) => [...byId.values()].find((n) => n.id.startsWith(frag))!;
    // Inside AZ A it would say the whole app fails when that zone does.
    expect(contains(find("azA"), find("aAlb"))).toBe(false);
    expect(contains(find("azB"), find("aAlb"))).toBe(false);
  });

  it.each([
    ["azure-landing-zone", azureLandingZone, 2],
    ["kubernetes-cluster", kubernetesCluster, 2],
  ])("%s opens each of its %i blocks onto a real child, through a mapped port", (_id, doc, count) => {
    const root = doc.diagrams[doc.rootDiagramIds[0]];
    const blocks = root.nodes.filter((n): n is NestedNode => n.type === "nested");
    expect(blocks).toHaveLength(count as number);

    for (const block of blocks) {
      const child = doc.diagrams[block.childDiagramId];
      expect(child, `${block.id} points at a diagram that is not there`).toBeDefined();
      expect(child.nodes.length).toBeGreaterThan(2);
      expect(block.ports.length).toBeGreaterThan(0);
      for (const port of block.ports) {
        expect(child.nodes.some((n) => n.id === port.innerNodeId)).toBe(true);
        const attached = root.edges.some(
          (e) =>
            (e.source.nodeId === block.id && e.source.portId === port.id) ||
            (e.target.nodeId === block.id && e.target.portId === port.id),
        );
        expect(attached, `${port.id} carries no edge`).toBe(true);
      }
    }
  });

  it("gives every spoke and namespace its own ids, so two can coexist", () => {
    for (const doc of [azureLandingZone, kubernetesCluster]) {
      const ids = [
        ...Object.keys(doc.diagrams),
        ...nodesOf(doc).map((n) => n.id),
        ...edgesOf(doc).map((e) => e.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("the AI infrastructure templates", () => {
  const finder = (doc: DiagramDocument) => {
    const nodes = nodesOf(doc);
    return (frag: string) => nodes.find((n) => n.id.startsWith(frag))!;
  };

  // The point of the PrivateLink endpoint: the orchestrator calls Bedrock from inside the VPC,
  // while Bedrock, S3 and DynamoDB are regional services that are not in it.
  it("AWS: runs the orchestrator inside the VPC and keeps the managed services outside it", () => {
    const find = finder(awsBedrockRag);
    const vpc = find("bVpc");
    expect(contains(vpc, find("bLambda"))).toBe(true);
    expect(contains(vpc, find("bEndpoint"))).toBe(true);
    for (const outside of ["bKb", "bModel", "bDocs", "bVector", "bHistory"]) expect(contains(vpc, find(outside)), outside).toBe(false);
    expect(contains(find("bBedrock"), find("bGuard"))).toBe(true);
  });

  it("AWS: reaches Bedrock only through the VPC endpoint, and screens the model with Guardrails", () => {
    const edges = edgesOf(awsBedrockRag);
    const into = (frag: string) => edges.filter((e) => e.target.nodeId?.startsWith(frag)).map((e) => e.source.nodeId!.replace(/_+$/, ""));
    expect(into("bKb")).toEqual(["bEndpoint"]);
    expect(edges.some((e) => e.source.nodeId?.startsWith("bModel") && e.target.nodeId?.startsWith("bGuard"))).toBe(true);
  });

  // The baseline's two security claims: the PaaS services sit outside the network, reached
  // through private endpoints, and the agent's internet calls leave through the firewall.
  it("Azure: keeps the platform services outside the VNet and sends egress through the firewall", () => {
    const find = finder(azureFoundryChat);
    const vnet = find("fVnet");
    for (const inside of ["fGateway", "fPe", "fFirewall"]) expect(contains(vnet, find(inside)), inside).toBe(true);
    for (const outside of ["fAgent", "fOpenAi", "fSearch", "fCosmos", "fStorage", "fTools"]) expect(contains(vnet, find(outside)), outside).toBe(false);
    const edges = edgesOf(azureFoundryChat);
    const toTools = edges.filter((e) => e.target.nodeId?.startsWith("fTools"));
    expect(toTools.map((e) => e.source.nodeId!.replace(/_+$/, ""))).toEqual(["fFirewall"]);
    expect(edges.some((e) => e.source.nodeId?.startsWith("fPe") && e.target.nodeId?.startsWith("fAgent"))).toBe(true);
  });

  it("GCP: closes the MLOps loop — monitoring drift triggers the training pipeline again", () => {
    const edges = edgesOf(gcpMlPlatform);
    const link = (from: string, to: string) => edges.some((e) => e.source.nodeId?.startsWith(from) && e.target.nodeId?.startsWith(to));
    expect(link("vBq", "vPipe")).toBe(true);
    expect(link("vPipe", "vHyper")).toBe(true);
    expect(link("vRegistry", "vGke")).toBe(true);
    expect(link("vApigee", "vGke")).toBe(true);
    expect(link("vModelMon", "vPipe")).toBe(true);
    const find = finder(gcpMlPlatform);
    expect(contains(find("vProj"), find("vApps"))).toBe(false);
  });
});
