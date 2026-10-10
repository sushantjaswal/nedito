// AWS generative-AI assistant: retrieval-augmented generation on Amazon Bedrock.
//
// The pattern AWS publishes for a RAG assistant (Prescriptive Guidance, "Retrieval Augmented
// Generation options and architectures on AWS": Knowledge Bases for Amazon Bedrock), drawn as AWS
// draws its reference architectures — requests enter from the left and move right; the AWS Cloud,
// a purple VPC and a teal private subnet use AWS's group colours; the managed AI service is its
// own group.
//
// Two flows, two rows. Across the top, the request: CloudFront and WAF at the edge, API Gateway
// checking the caller's Cognito token, a Lambda orchestrator in a private subnet that reaches
// Bedrock through a PrivateLink endpoint (so prompts never cross the internet), and Bedrock's
// RetrieveAndGenerate: the knowledge base searches the vector index, then the foundation model
// answers with what it found, screened by Guardrails on the way in and out. Along the bottom,
// ingestion: documents in S3 are chunked and embedded into the OpenSearch Serverless index.
// Conversation history sits in DynamoDB; KMS keys encrypt the data stores; CloudWatch takes the
// logs, metrics and model-invocation records.
//
// Every icon is AWS's own (aws/…), except the users, which the AWS pack does not draw — the
// vendor-neutral People icon stands in, as in the three-tier template. Lines join icons at their
// sides: an icon's name hangs below it, and a line leaving downward would run through the name.
import type { DEdge, StyleMap } from "../../model/types";
import { BOUNDARY, LINK, MANAGEMENT, boundary, icon, link, page } from "./archKit";
import { templateDoc } from "../starters/basicFlowchart";

const AI = "aws/artificial-intelligence";
const NET = "aws/networking-content-delivery";
const SEC = "aws/security-identity";

// AWS's group colours.
const CLOUD: StyleMap = { ...BOUNDARY, stroke: "#232F3E", dash: "solid" };
const VPC: StyleMap = { ...BOUNDARY, stroke: "#8C4FFF", dash: "solid" };
const PRIVATE: StyleMap = { ...BOUNDARY, stroke: "#00A4A6", dash: "solid" };
/** A managed service shown as a group of its parts: AWS draws these dashed, in the service's colour. */
const SERVICE: StyleMap = { ...BOUNDARY, stroke: "#01A88D", dash: "dashed" };
const OPS: StyleMap = { ...BOUNDARY, stroke: "#E7157B", dash: "dashed" };

const diagram = page(
  "dAwsBedrockRag",
  "AWS generative AI assistant (RAG on Amazon Bedrock)",
  [
    ...icon("bUsers", "business/group", "Users", 40, 300, 5),

    ...boundary("bCloud", "AWS Cloud", 150, 40, 1640, 730, CLOUD),

    // Edge and API.
    ...icon("bCdn", `${NET}/amazon-cloudfront`, "CloudFront", 200, 300, 5),
    ...icon("bWaf", `${SEC}/aws-waf`, "AWS WAF", 330, 300, 5),
    ...icon("bCognito", `${SEC}/amazon-cognito`, "Cognito\nuser pool", 330, 130, 5),
    ...icon("bApi", `${NET}/amazon-api-gateway`, "API Gateway", 470, 300, 5),

    // The orchestrator runs in a private subnet and reaches Bedrock privately.
    ...boundary("bVpc", "VPC", 580, 210, 310, 300, VPC),
    ...boundary("bSubnet", "Private subnet", 600, 245, 270, 240, PRIVATE),
    ...icon("bLambda", "aws/compute/aws-lambda", "Lambda\n(RAG orchestrator)", 650, 300, 6),
    ...icon("bEndpoint", `${NET}/aws-privatelink`, "VPC endpoint\n(PrivateLink)", 800, 300, 6),

    // The managed service: retrieval, generation and the guardrail around them.
    ...boundary("bBedrock", "Amazon Bedrock", 1040, 90, 440, 420, SERVICE),
    ...icon("bKb", `${AI}/amazon-bedrock`, "Knowledge Bases", 1100, 300, 6),
    ...icon("bGuard", `${AI}/amazon-bedrock`, "Guardrails", 1240, 140, 6),
    ...icon("bModel", `${AI}/amazon-bedrock`, "Foundation\nmodel", 1380, 300, 6),
    ...icon("bEmbed", `${AI}/amazon-bedrock`, "Embeddings\nmodel", 1380, 420, 6),

    // Ingestion and data, along the bottom.
    ...icon("bDocs", "aws/storage/amazon-simple-storage-service", "S3\nsource documents", 1640, 420, 5),
    ...icon("bVector", "aws/analytics/amazon-opensearch-service", "OpenSearch Serverless\n(vector index)", 1240, 600, 5),
    ...icon("bHistory", "aws/databases/amazon-dynamodb", "DynamoDB\n(chat history)", 720, 600, 5),

    // Operations and keys.
    ...boundary("bOps", "Operations & security", 190, 560, 320, 170, OPS),
    ...icon("bWatch", "aws/management-tools/amazon-cloudwatch", "CloudWatch", 400, 620, 6),
    ...icon("bKms", `${SEC}/aws-key-management-service`, "KMS keys", 240, 620, 6),
  ],
  [
    link("rUsers", "bUsers", "bCdn", LINK, "HTTPS", ["right", "left"]),
    link("rWaf", "bCdn", "bWaf", LINK, undefined, ["right", "left"]),
    link("rApi", "bWaf", "bApi", LINK, undefined, ["right", "left"]),
    link("rAuth", "bApi", "bCognito", MANAGEMENT, "verify token", ["top", "right"]),
    link("rLambda", "bApi", "bLambda", LINK, undefined, ["right", "left"]),
    link("rEndpoint", "bLambda", "bEndpoint", LINK, undefined, ["right", "left"]),
    link("rRag", "bEndpoint", "bKb", LINK, "retrieve &\ngenerate", ["right", "left"]),
    link("rGenerate", "bKb", "bModel", LINK, "prompt +\ncontext", ["right", "left"]),
    link("rGuard", "bModel", "bGuard", MANAGEMENT, "screens prompts\nand answers", ["top", "right"]),
    link("rSearch", "bKb", "bVector", LINK, "vector search", ["right", "top"]),
    link("rIngest", "bDocs", "bEmbed", LINK, "chunk", ["left", "right"]),
    link("rIndex", "bEmbed", "bVector", LINK, "embeddings", ["left", "right"]),
    link("rHistory", "bLambda", "bHistory", LINK, "history", ["right", "top"]),
    link("rLogs", "bVpc", "bWatch", MANAGEMENT, "logs · metrics ·\ninvocations", ["bottom", "right"]),
  ],
);

// Where two lines share a side, they leave or arrive at different heights so they never merge.
diagram.edges = diagram.edges.map((e): DEdge => {
  if (e.id.startsWith("rGenerate")) return { ...e, source: { ...e.source, anchor: { x: 1, y: 0.3 } }, target: { ...e.target, anchor: { x: 0, y: 0.3 } } };
  if (e.id.startsWith("rSearch")) return { ...e, source: { ...e.source, anchor: { x: 1, y: 0.85 } } };
  if (e.id.startsWith("rHistory")) return { ...e, source: { ...e.source, anchor: { x: 1, y: 0.85 } } };
  // Telemetry leaves the VPC low on its left, clear of the lines inside it.
  if (e.id.startsWith("rLogs")) return { ...e, source: { ...e.source, anchor: { x: 0.12, y: 1 } } };
  return e;
});

export default templateDoc("AWS generative AI assistant (RAG on Amazon Bedrock)", [diagram]);
