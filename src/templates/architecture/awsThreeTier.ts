// AWS three-tier web app: edge, web, application, data.
//
// Drawn the way AWS's own reference architectures are: traffic enters from the left and moves
// right through the tiers; the groups use AWS's group conventions (the AWS Cloud, a purple VPC,
// dashed blue Availability Zones, teal private subnets); each Availability Zone is a row holding
// a copy of every tier; and the database runs as a primary with a synchronous standby in the
// second zone. Lines join icons at their sides — an icon's name hangs below it, so a line
// leaving downward would run through the name.
import type { StyleMap } from "../../model/types";
import { BOUNDARY, LINK, MANAGEMENT, boundary, icon, link, page } from "./archKit";
import { templateDoc } from "../starters/basicFlowchart";

const NET = "aws/networking-content-delivery";

// AWS's group colours.
const CLOUD: StyleMap = { ...BOUNDARY, stroke: "#232F3E", dash: "solid" };
const VPC: StyleMap = { ...BOUNDARY, stroke: "#8C4FFF", dash: "solid" };
const AZ: StyleMap = { ...BOUNDARY, stroke: "#007CBC", dash: "dashed" };
const PRIVATE: StyleMap = { ...BOUNDARY, stroke: "#00A4A6", dash: "solid" };

/** One Availability Zone: an app subnet with the web and app tiers, a data subnet with RDS. */
function zone(key: "A" | "B", y: number, rds: string, rdsName: string) {
  return [
    ...boundary(`az${key}`, `Availability Zone ${key}`, 640, y, 880, 220, AZ),
    ...boundary(`app${key}`, "Private subnet — app", 670, y + 40, 460, 160, PRIVATE),
    ...icon(`aWeb${key}`, "aws/compute/amazon-ec2", "Web tier", 740, y + 90, 6),
    ...icon(`aApp${key}`, "aws/compute/amazon-ec2-auto-scaling", "App tier", 980, y + 90, 6),
    ...boundary(`data${key}`, "Private subnet — data", 1170, y + 40, 320, 160, PRIVATE),
    ...icon(rds, "aws/databases/amazon-rds", rdsName, 1302, y + 90, 7),
  ];
}

const diagram = page(
  "dAwsThreeTier",
  "AWS three-tier web app",
  [
    // The AWS pack ships service icons only — there is no "users" resource icon in it — so the
    // actor is the vendor-neutral People icon (Business section) rather than an invented one.
    ...icon("aUsers", "business/group", "Users", 40, 382, 5),

    ...boundary("cloud", "AWS Cloud", 160, 40, 1400, 740, CLOUD),
    ...icon("aRoute53", `${NET}/amazon-route-53`, "Route 53", 200, 222, 5),
    ...icon("aCloudfront", `${NET}/amazon-cloudfront`, "CloudFront", 200, 382, 5),
    ...icon("aWaf", "aws/security-identity/aws-waf", "AWS WAF", 330, 382, 5),
    // S3 sits outside the VPC, because it is: it is reached over the AWS network, not from
    // inside a subnet, and drawing it inside the box would teach the opposite.
    ...icon("aS3", "aws/storage/amazon-simple-storage-service", "S3 static assets", 340, 560, 7),

    ...boundary("vpc", "VPC", 480, 80, 1060, 670, VPC),
    // The load balancer spans both availability zones rather than living in one of them —
    // putting it inside AZ A would say the whole app fails when that zone does.
    ...icon("aAlb", `${NET}/elastic-load-balancing`, "Application\nLoad Balancer", 520, 382, 6),
    ...zone("A", 110, "aRds", "RDS primary"),
    ...zone("B", 500, "aRdsStandby", "RDS standby"),
  ],
  [
    link("wDns", "aUsers", "aRoute53", MANAGEMENT, "resolve", ["top", "left"]),
    link("wUsers", "aUsers", "aCloudfront", LINK, undefined, ["right", "left"]),
    link("wWaf", "aCloudfront", "aWaf", LINK, undefined, ["right", "left"]),
    link("wS3", "aCloudfront", "aS3", LINK, "static", ["right", "left"]),
    link("wAlb", "aWaf", "aAlb", LINK, undefined, ["right", "left"]),
    link("wWebA", "aAlb", "aWebA", LINK, undefined, ["right", "left"]),
    link("wWebB", "aAlb", "aWebB", LINK, undefined, ["right", "left"]),
    link("wAppA", "aWebA", "aAppA", LINK, undefined, ["right", "left"]),
    link("wAppB", "aWebB", "aAppB", LINK, undefined, ["right", "left"]),
    link("wDbA", "aAppA", "aRds", LINK, "SQL", ["right", "left"]),
    link("wDbB", "aAppB", "aRds", LINK, undefined, ["right", "left"]),
    link("wSync", "aRds", "aRdsStandby", MANAGEMENT, "synchronous\nreplication", ["right", "right"]),
  ],
);

// Zone B's app tier writes to the primary too: it meets RDS low on its left side, apart from
// zone A's line, so the two never merge into one.
diagram.edges = diagram.edges.map((e) =>
  e.id.startsWith("wDbB") ? { ...e, target: { ...e.target, anchor: { x: 0, y: 0.85 } } } : e,
);

export default templateDoc("AWS three-tier web app", [diagram]);
