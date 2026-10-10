// Animated icons: motion inside a shape, placed like any other icon
// and found by search beside its still twin. Library entries, not a toggle. Every drawing is in
// animatedBodies.ts, which says how they rest, colour and export.
import {
  CACHE_HIT,
  DEGRADED,
  DOWN,
  HEALTHY,
  HEARTBEAT,
  LIVE_TRAFFIC,
  LOAD_BALANCING,
  PROCESSING,
  PROTECTED,
  QUEUE,
  REPLICATING,
  RETRYING,
  RUNNING,
  SCALING_OUT,
  SCHEDULED,
  STREAMING,
  UPLOADING,
  WRITES,
} from "./animatedBodies";
import type { StencilDef, StencilSection } from "./types";

const SIZE = { w: 64, h: 64 };

function icon(id: string, label: string, still: string, svgBody: string, keywords: string[]): StencilDef {
  return { id: `animated/${id}`, label, keywords: ["animated", "moving", ...keywords], defaultSize: SIZE, svgBody, pictogram: true, animated: { still } };
}

const section: StencilSection = {
  id: "animated",
  name: "Animated",
  shapes: [
    // Compute and jobs (I1).
    icon("processing", "Processing", "misc/settings", PROCESSING, ["gear", "cog", "working", "busy", "compute", "job"]),
    icon("running", "Running", "misc/run", RUNNING, ["in progress", "spinner", "loading", "active", "job"]),
    icon("scaling-out", "Scaling Out", "misc/scale-out", SCALING_OUT, ["scaling", "scale", "autoscale", "replicas", "instances", "horizontal"]),
    icon("retrying", "Retrying", "misc/retry", RETRYING, ["retry", "again", "loop", "backoff", "redo"]),
    // Data and storage (I2).
    icon("writes", "Writes", "network/database", WRITES, ["database", "db", "write", "storing", "saving", "storage", "insert"]),
    icon("replicating", "Replicating", "arrows/sync", REPLICATING, ["replication", "sync", "copy", "mirror", "backup", "failover"]),
    icon("queue", "Queue", "c4/queue", QUEUE, ["message queue", "messages", "buffer", "topic", "fifo", "backlog"]),
    icon("streaming", "Streaming", "misc/stream", STREAMING, ["stream", "events", "data flow", "pipeline", "real time", "kafka"]),
    // Traffic and network (I3).
    icon("uploading", "Uploading", "misc/upload", UPLOADING, ["upload", "send", "push", "transfer", "outbound"]),
    icon("load-balancing", "Load Balancing", "network/load-balancer", LOAD_BALANCING, ["load balancer", "lb", "distribute", "fan out", "traffic", "round robin"]),
    icon("live-traffic", "Live Traffic", "misc/traffic", LIVE_TRAFFIC, ["traffic", "broadcast", "signal", "requests", "live", "network activity"]),
    icon("cache-hit", "Cache Hit", "misc/bolt", CACHE_HIT, ["cache", "hit", "fast", "bolt", "redis", "memory"]),
    // Status and operations (I4).
    icon("healthy", "Healthy", "misc/healthy", HEALTHY, ["health", "ok", "up", "online", "green", "status"]),
    icon("degraded", "Degraded", "misc/warning", DEGRADED, ["warning", "partial", "slow", "amber", "status", "incident"]),
    icon("down", "Down", "misc/error", DOWN, ["error", "outage", "failed", "offline", "red", "status", "incident"]),
    icon("heartbeat", "Heartbeat", "misc/heartbeat", HEARTBEAT, ["heart", "pulse", "liveness", "health check", "ping", "monitor"]),
    // Time and trust (I5).
    icon("scheduled", "Scheduled", "business/schedule", SCHEDULED, ["schedule", "clock", "cron", "timer", "job", "time", "batch"]),
    icon("protected", "Protected", "network/security", PROTECTED, ["shield", "security", "secure", "safe", "guard", "firewall"]),
  ],
};

export default section;
