// AI and agents: the vocabulary of one kind of diagram, kept together.
//
// These began life inside the Animated section, which is where an icon that moves goes. That was
// the wrong shelf: people do not look for "an animated icon that happens to be about retrieval",
// they look for the parts of an agent diagram. So the pairs live here instead — and their still
// twins with them, rather than off in Misc, because a reader wanting a plain Vector Search should
// find it beside the moving one, not in a drawer of general pictograms.
//
// Every id moved with them (`animated/inference` became `ai/inference`, `misc/model` became
// `ai/model`), so every old id is in RETIRED_STENCIL_IDS and keeps resolving: a shapeRef that no
// longer resolves does not fail loudly, it quietly draws a white box.
//
// **Labels are unique within the section.** Five pairs shared a name — an animated "Embedding" and
// a still "Embedding" side by side say nothing about which is which — so those stills are named
// for what they draw instead: Vector, Similarity, Context, Blocked.
import {
  AGENT_THINKING,
  CHUNKING,
  CITATION,
  EMBEDDING,
  EVALUATING,
  GUARDRAIL,
  HANDOFF,
  HUMAN_IN_THE_LOOP,
  INFERENCE,
  PROMPT,
  RECALLING,
  RERANKING,
  RETRIEVAL,
  ROUTING,
  TOKEN_STREAM,
  TOOL_CALL,
  VECTOR_SEARCH,
} from "./aiBodies";
import { stillBody } from "./animatedBodies";
import type { StencilDef, StencilSection } from "./types";

const SIZE = { w: 64, h: 64 };

/** The moving one. */
function moving(id: string, label: string, still: string, svgBody: string, keywords: string[]): StencilDef {
  return {
    id: `ai/${id}`,
    label,
    keywords: ["ai", "animated", "moving", ...keywords],
    defaultSize: SIZE,
    svgBody,
    pictogram: true,
    animated: { still },
  };
}

/** Its twin, the same drawing with nothing left to move. */
function still(id: string, label: string, svgBody: string, keywords: string[]): StencilDef {
  return { id: `ai/${id}`, label, keywords: ["ai", ...keywords], defaultSize: SIZE, svgBody: stillBody(svgBody), pictogram: true };
}

const section: StencilSection = {
  id: "ai",
  name: "AI & Agents",
  shapes: [
    // Models and what they produce.
    moving("inference", "Inference", "ai/model", INFERENCE, ["model", "llm", "chip", "predict", "generate", "serving"]),
    still("model", "Model", INFERENCE, ["inference", "llm", "chip", "serving"]),
    moving("token-stream", "Token Stream", "ai/tokens", TOKEN_STREAM, ["tokens", "llm", "generating", "completion", "typing", "output"]),
    still("tokens", "Tokens", TOKEN_STREAM, ["token stream", "llm", "completion", "output"]),
    moving("prompt", "Prompt", "ai/message", PROMPT, ["question", "input", "instruction", "system prompt", "ask", "llm"]),
    still("message", "Message", PROMPT, ["prompt", "question", "input", "ask"]),
    moving("routing", "Routing", "ai/router", ROUTING, ["model router", "gateway", "choose", "fallback", "llm"]),
    still("router", "Router", ROUTING, ["routing", "model router", "gateway", "fallback"]),

    // Retrieval, and everything that feeds it.
    moving("chunking", "Chunking", "ai/chunks", CHUNKING, ["chunk", "split", "ingest", "index", "rag"]),
    still("chunks", "Chunks", CHUNKING, ["chunking", "split", "ingest", "rag"]),
    moving("embedding", "Embedding", "ai/vector", EMBEDDING, ["embeddings", "encode", "vector", "index", "rag"]),
    still("vector", "Vector", EMBEDDING, ["embedding", "embeddings", "encode", "rag"]),
    moving("vector-search", "Vector Search", "ai/similarity", VECTOR_SEARCH, ["vector database", "nearest neighbour", "knn", "similarity", "rag"]),
    still("similarity", "Similarity", VECTOR_SEARCH, ["vector search", "vector database", "nearest neighbour", "rag"]),
    moving("retrieval", "Retrieval", "ai/context", RETRIEVAL, ["rag", "retrieve", "passages", "lookup", "grounding"]),
    still("context", "Context", RETRIEVAL, ["retrieval", "rag", "passages", "grounding"]),
    moving("reranking", "Reranking", "ai/ranked", RERANKING, ["rerank", "reranker", "order", "relevance", "rag"]),
    still("ranked", "Ranked", RERANKING, ["reranking", "reranker", "relevance", "rag"]),
    moving("citation", "Citation", "ai/source", CITATION, ["cite", "grounding", "provenance", "reference", "attribution", "rag"]),
    still("source", "Source", CITATION, ["citation", "cite", "grounding", "reference", "rag"]),

    // Agents: what they do, and what holds them back.
    moving("agent-thinking", "Agent Thinking", "ai/agent", AGENT_THINKING, ["agent", "reasoning", "planning", "thinking", "llm"]),
    still("agent", "Agent", AGENT_THINKING, ["agent thinking", "reasoning", "planning", "llm"]),
    moving("tool-call", "Tool Call", "ai/tool", TOOL_CALL, ["tool", "function call", "mcp", "agent", "action"]),
    still("tool", "Tool", TOOL_CALL, ["tool call", "function call", "mcp", "agent"]),
    moving("recalling", "Recalling", "ai/memory", RECALLING, ["memory", "recall", "history", "context window", "agent"]),
    still("memory", "Memory", RECALLING, ["recalling", "recall", "history", "agent"]),
    moving("handoff", "Handoff", "ai/handover", HANDOFF, ["multi agent", "delegate", "sub agent", "pass", "orchestration"]),
    still("handover", "Handover", HANDOFF, ["handoff", "multi agent", "delegate", "sub agent"]),

    // What is checked, and who signs it off.
    moving("evaluating", "Evaluating", "ai/score", EVALUATING, ["evaluation", "eval", "scoring", "benchmark", "grading", "quality"]),
    still("score", "Score", EVALUATING, ["evaluating", "evaluation", "eval", "benchmark"]),
    moving("guardrail", "Guardrail", "ai/blocked", GUARDRAIL, ["guardrails", "refused", "policy", "safety", "filter", "moderation"]),
    still("blocked", "Blocked", GUARDRAIL, ["guardrail", "refused", "policy", "safety", "moderation"]),
    moving("human-in-the-loop", "Human in the Loop", "ai/approval", HUMAN_IN_THE_LOOP, ["approval", "review", "sign off", "oversight", "agent"]),
    still("approval", "Approval", HUMAN_IN_THE_LOOP, ["human in the loop", "review", "sign off", "oversight"]),
  ],
};

export default section;
