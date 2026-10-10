// Cloud icons on draw.io import (X1, D132): draw.io's AWS, Azure and GCP icons become the
// official icons Nedito ships for the same service; what matches nothing keeps the fallback.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloudServiceOf, matchCloudIcon } from "./cloudIcons";
import { decodeDrawio } from "./drawioImport";
import { parseMxStyle } from "./mxStyle";
import type { ShapeNode } from "../../model/types";

describe("matching a service name", () => {
  it.each([
    ["aws", "lambda", "aws/compute/aws-lambda"],
    ["aws", "bucket", "aws/storage/amazon-simple-storage-service"],
    ["aws", "simple_storage_service", "aws/storage/amazon-simple-storage-service"],
    ["aws", "ec2", "aws/compute/amazon-ec2"],
    ["aws", "dynamodb", "aws/databases/amazon-dynamodb"],
    ["aws", "rds", "aws/databases/amazon-rds"],
    ["aws", "lambda_function", "aws/compute/aws-lambda"],
    ["aws", "elastic_kubernetes_service", "aws/containers/amazon-elastic-kubernetes-service"],
    ["azure", "Virtual_Machine.svg", "azure/compute/virtual-machine"],
    ["gcp", "google_kubernetes_engine", "gcp/core/gke"],
    ["gcp", "cloud_run", "gcp/core/cloud-run"],
    ["gcp", "bigquery", "gcp/core/bigquery"],
  ] as const)("%s %s → %s", (vendor, name, id) => {
    expect(matchCloudIcon(vendor, name)).toBe(id);
  });

  it("matches nothing rather than guessing", () => {
    expect(matchCloudIcon("aws", "some_made_up_widget")).toBeNull();
    expect(matchCloudIcon("gcp", "")).toBeNull();
  });
});

describe("reading the service from a style", () => {
  it("finds AWS by resIcon or shape, Azure by its image path, GCP by prIcon — and not their frames", () => {
    expect(cloudServiceOf(parseMxStyle("shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;"), null)).toEqual({ vendor: "aws", name: "lambda" });
    expect(cloudServiceOf(parseMxStyle("shape=mxgraph.aws4.bucket;"), null)).toEqual({ vendor: "aws", name: "bucket" });
    expect(cloudServiceOf(parseMxStyle("shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_region;"), null)).toBeNull();
    expect(cloudServiceOf(parseMxStyle("image;image=img/lib/azure2/compute/Virtual_Machine.svg;"), "img/lib/azure2/compute/Virtual_Machine.svg")).toEqual({
      vendor: "azure",
      name: "Virtual_Machine.svg",
    });
    expect(cloudServiceOf(parseMxStyle("shape=mxgraph.gcp2.hexIcon;prIcon=cloud_run"), null)).toEqual({ vendor: "gcp", name: "cloud_run" });
    expect(cloudServiceOf(parseMxStyle("shape=mxgraph.gcp2.hexIcon"), null)).toBeNull();
    expect(cloudServiceOf(parseMxStyle("ellipse;whiteSpace=wrap;"), null)).toBeNull();
  });
});

describe("the audit's cloud fixture", () => {
  it("imports Lambda, S3, the Azure VM and GKE as their official icons, and says nothing about them", async () => {
    const result = await decodeDrawio(readFileSync("src/file/drawio/fixtures/audit/cloud-pictures.drawio", "utf8"), "cloud-pictures.drawio");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.doc.diagrams[result.doc.rootDiagramIds[0]];
    const byLabel = (text: string) => page.nodes.find((n) => n.label?.text === text) as ShapeNode;
    expect(byLabel("Resize function").shapeRef).toBe("aws/compute/aws-lambda");
    expect(byLabel("Uploads").shapeRef).toBe("aws/storage/amazon-simple-storage-service");
    expect(byLabel("App VM").shapeRef).toBe("azure/compute/virtual-machine");
    expect(byLabel("Cluster").shapeRef).toBe("gcp/core/gke");
    // Drawn as the vendor publishes it: draw.io's orange fill is not carried; the label stays below.
    expect(byLabel("Resize function").style).toEqual({ verticalAlign: "top", verticalLabelPosition: "bottom" });
    const said = result.notices.map((n) => n.message).join("\n");
    expect(said).not.toMatch(/aws4|gcp2|Virtual_Machine/);
  });

  it("draws draw.io's cloud shape as our cloud", async () => {
    const xml = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="c" value="Internet" style="ellipse;shape=cloud;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="80" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;
    const result = await decodeDrawio(xml, "cloud.drawio");
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.doc.diagrams[result.doc.rootDiagramIds[0]].nodes[0] as ShapeNode).shapeRef).toBe("basic/cloud");
  });
});
