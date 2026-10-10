// Kubernetes cluster, with each namespace as a Nested Block.
//
// **Deliberately drawn with generic shapes, not Kubernetes icons.** The spec is explicit: use
// the official icon set only if it is added to the library with proper NOTICE attribution,
// otherwise generic shapes and no vendor artwork. No Kubernetes icon set is in the repo, and
// adding one is a licensing and provenance task of its own (CLAUDE.md's guardrail), not
// something to slip in under a template. So this reads as a cluster because of its structure
// and labels rather than because of borrowed logos.
//
// Namespaces are the natural Nested Block: a namespace is exactly "a chunk of the cluster with
// its own contents", and a cluster diagram that inlines every workload is unreadable by the
// third namespace. The ingress path into each namespace is a port, so it survives the drill-in.
import type { Diagram, NestedNode } from "../../model/types";
import { templateDoc, tid } from "../starters/basicFlowchart";
import { ACCENT, BOUNDARY, LINK, MANAGEMENT, PLAIN, ZONE, boundary, link, node, page } from "./archKit";

const ROUND = "general/rounded-rect";

/** One namespace's child diagram: the workloads and the services in front of them. */
function namespace(key: string, title: string, workloads: { slug: string; caption: string; replicas: string }[]): Diagram {
  const k = (s: string) => `${key}${s}`;
  return page(
    k("d"),
    title,
    [
      ...boundary(k("ns"), `namespace/${title.toLowerCase().replace(/\s+/g, "-")}`, 20, 20, 720, 380, BOUNDARY),
      node(k("svc"), ROUND, "Service\n(ClusterIP)", 70, 100, 150, 70, 2, ACCENT),
      ...workloads.flatMap((w, i) => [
        node(k(w.slug), ROUND, `Deployment\n${w.caption}`, 290, 80 + i * 130, 170, 70, 3 + i, PLAIN),
        node(k(`${w.slug}Pods`), ROUND, w.replicas, 520, 80 + i * 130, 150, 70, 3 + i, ZONE),
      ]),
      node(k("cfg"), ROUND, "ConfigMap\n+ Secret", 70, 260, 150, 70, 8, ZONE),
    ],
    [
      ...workloads.flatMap((w, i) => [
        link(k(`s${i}`), k("svc"), k(w.slug), LINK, undefined, ["right", "left"]),
        link(k(`p${i}`), k(w.slug), k(`${w.slug}Pods`), LINK, "replicas", ["right", "left"]),
      ]),
      // Into the deployment's underside, so it never shares the Service's line in.
      link(k("cfgLink"), k("cfg"), k(workloads[workloads.length - 1].slug), MANAGEMENT, "mounted", ["right", "bottom"]),
    ],
  );
}

const storefront = namespace("nsS", "Storefront", [
  { slug: "web", caption: "web", replicas: "3 pods" },
  { slug: "api", caption: "api", replicas: "4 pods" },
]);

const payments = namespace("nsP", "Payments", [
  { slug: "gw", caption: "gateway", replicas: "2 pods" },
  { slug: "ledger", caption: "ledger", replicas: "2 pods" },
]);

function namespaceBlock(slug: string, title: string, child: Diagram, innerNodeId: string, y: number, z: number): NestedNode {
  return {
    id: tid(slug),
    type: "nested",
    childDiagramId: child.id,
    position: { x: 870, y },
    size: { w: 260, h: 150 },
    z,
    style: {},
    label: { text: title, align: "center" },
    collapsed: { icons: [], summary: "service · deployments · pods" },
    ports: [
      { id: tid(`${slug}P`), side: "left", offset: 0.5, innerNodeId: tid(innerNodeId), label: "ingress" },
    ],
  };
}

const storefrontBlock = namespaceBlock("kStore", "namespace/storefront", storefront, "nsSsvc", 353, 6);
const paymentsBlock = namespaceBlock("kPay", "namespace/payments", payments, "nsPsvc", 540, 7);

// Three columns, as cluster diagrams are usually drawn: the control plane over the worker nodes
// it schedules onto, the ingress controller in the middle, the namespaces on the right. Users
// come in from above, outside the cluster. No line crosses a shape or another line.
const cluster: Diagram = page(
  "dK8sCluster",
  "Kubernetes cluster",
  [
    node("kUsers", "business/group", "Users", 687, 20, 56, 56, 11, {}),

    ...boundary("cluster", "Cluster", 160, 120, 1000, 580, BOUNDARY),

    ...boundary("cp", "Control plane", 200, 160, 390, 200, ZONE),
    node("kApi", ROUND, "API server", 220, 210, 160, 56, 2, ACCENT),
    node("kEtcd", "general/cylinder", "etcd", 230, 280, 140, 70, 4, PLAIN),
    node("kSched", ROUND, "Scheduler", 420, 200, 150, 44, 3, PLAIN),
    node("kCtrl", ROUND, "Controller\nmanager", 420, 270, 150, 50, 3, PLAIN),

    ...boundary("nodes", "Worker nodes", 200, 500, 390, 160, ZONE),
    node("kNode1", ROUND, "node-1\nkubelet", 220, 560, 110, 56, 8, PLAIN),
    node("kNode2", ROUND, "node-2\nkubelet", 340, 560, 110, 56, 9, PLAIN),
    node("kNode3", ROUND, "node-3\nkubelet", 460, 560, 110, 56, 10, PLAIN),

    node("kIngress", ROUND, "Ingress\ncontroller", 640, 396, 150, 64, 5, ACCENT),

    storefrontBlock,
    paymentsBlock,
  ],
  [
    link("kEtcdApi", "kApi", "kEtcd", MANAGEMENT, undefined, ["bottom", "top"]),
    link("kSchedApi", "kSched", "kApi", MANAGEMENT, undefined, ["left", "right"]),
    link("kCtrlApi", "kCtrl", "kApi", MANAGEMENT, undefined, ["left", "right"]),
    link("kApiNodes", "cp", "nodes", MANAGEMENT, "schedules pods", ["bottom", "top"]),
    link("kUsersIngress", "kUsers", "kIngress", LINK, "HTTPS", ["right", "top"]),
    {
      id: tid("kIngStore"),
      source: { nodeId: tid("kIngress") },
      target: { nodeId: storefrontBlock.id, portId: storefrontBlock.ports[0].id },
      style: { ...LINK, sourceHandle: "right", targetHandle: "left" },
      label: { text: "route", fontSize: 10, color: "#66707D" },
    },
    {
      id: tid("kIngPay"),
      source: { nodeId: tid("kIngress") },
      target: { nodeId: paymentsBlock.id, portId: paymentsBlock.ports[0].id },
      style: { ...LINK, sourceHandle: "right", targetHandle: "left" },
      label: { text: "route", fontSize: 10, color: "#66707D" },
    },
  ],
);

// The scheduler and controller manager meet the API server at their own heights on its right.
cluster.edges = cluster.edges.map((e) => {
  if (e.id.startsWith("kSchedApi")) return { ...e, target: { ...e.target, anchor: { x: 1, y: 0.25 } } };
  if (e.id.startsWith("kCtrlApi")) return { ...e, target: { ...e.target, anchor: { x: 1, y: 0.8 } } };
  return e;
});

export default templateDoc("Kubernetes cluster", [cluster, storefront, payments]);
