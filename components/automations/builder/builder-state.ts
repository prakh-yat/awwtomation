/**
 * Builder state: plain `useReducer` over React Flow's node/edge arrays plus
 * the automation settings. React Flow's arrays are the source of truth while
 * editing; `toFlowGraph` serialises them into the `FlowGraph` the engine
 * runs, and `validateFlow` gives the inline errors.
 */
import { applyEdgeChanges, applyNodeChanges, MarkerType, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import type { AutomationStatus, MatchMode, TriggerType } from "@prisma/client";

import { DEFAULT_AI_TURNS, normalizeHandle, renderTemplate, type FlowGraph, type FlowNodeData, type FlowNodeType } from "@/lib/automation/flow-types";
import type { OutboundMessage } from "@/lib/meta/types";
import type { AutomationDetail, MediaSummary } from "@/lib/services/automations";

// ───────────────────────── Types ─────────────────────────

export type BuilderNode = Node<FlowNodeData, FlowNodeType>;
export type BuilderEdge = Edge;

export type BuilderSettings = {
  name: string;
  channelId: string;
  triggerType: TriggerType;
  matchMode: MatchMode;
  keywords: string[];
  excludeKeywords: string[];
  mediaIds: string[];
  publicReplyEnabled: boolean;
  publicReplies: string[];
  oncePerContact: boolean;
};

/** What undo restores: the settings and the graph, never selection or save state. */
export type Snapshot = { settings: BuilderSettings; nodes: BuilderNode[]; edges: BuilderEdge[] };

export type History = {
  past: Snapshot[];
  future: Snapshot[];
  /** True between the first and last position change of a drag, so a drag is one step. */
  dragging: boolean;
  /** Consecutive edits with the same group (typing in one field) collapse into one step. */
  group: string | null;
  groupAt: number;
};

export type BuilderState = {
  settings: BuilderSettings;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  selectedNodeId: string | null;
  status: AutomationStatus;
  /** Serialised settings+flow at the last save; `isDirty` compares against it. */
  savedSnapshot: string;
  /** Media the user has seen (selected thumbnails + picker results), keyed by external id. */
  mediaById: Record<string, MediaSummary>;
  history: History;
};

export type AddableNodeType = Exclude<FlowNodeType, "trigger">;

export type BuilderAction =
  | { type: "settings"; patch: Partial<BuilderSettings> }
  | { type: "nodesChange"; changes: NodeChange<BuilderNode>[] }
  | { type: "edgesChange"; changes: EdgeChange<BuilderEdge>[] }
  | { type: "connect"; connection: Connection }
  /**
   * Adds a step. `after` wires it from that node's handle (inserting it before
   * whatever the handle pointed at); without it the step goes after the
   * selected node. `data` pre-fills it, e.g. with the first pipeline.
   */
  | { type: "addNode"; nodeType: AddableNodeType; data?: FlowNodeData; after?: { nodeId: string; handle: string }; position?: { x: number; y: number } }
  /**
   * A step dragged in from the palette. Dropped on a connection it goes in
   * between; dropped on open canvas it stays where it landed and is wired from
   * the nearest step above it that still has a free way out.
   */
  | { type: "dropNode"; nodeType: AddableNodeType; data?: FlowNodeData; position: { x: number; y: number }; edgeId?: string | null }
  | { type: "updateNodeData"; id: string; data: FlowNodeData; handleRemap?: Record<string, string | null> }
  /**
   * Moves nodes to new positions. `rebaseline` (used when a crowded layout is
   * tidied on open) keeps a clean flow clean: tidying isn't an edit to save.
   */
  | { type: "arrange"; positions: Record<string, { x: number; y: number }>; rebaseline?: boolean }
  | { type: "removeNode"; id: string }
  | { type: "removeEdge"; id: string }
  | { type: "select"; id: string | null }
  | { type: "saved"; detail: AutomationDetail }
  | { type: "setStatus"; status: AutomationStatus }
  | { type: "mediaLoaded"; items: MediaSummary[] }
  | { type: "undo" }
  | { type: "redo" };

// ───────────────────────── Graph conversion ─────────────────────────

/** Edge styling shared by initial and newly-drawn edges; colours come from the canvas stylesheet. */
export const EDGE_DEFAULTS: Partial<BuilderEdge> = {
  type: "insertable",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#5c5c5c", width: 14, height: 14 },
};

export function fromFlowGraph(flow: FlowGraph): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  return {
    nodes: flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { ...n.position },
      data: n.data,
      // The trigger is the flow's root; validateFlow requires exactly one.
      deletable: n.type !== "trigger",
      selected: false,
    })),
    edges: flow.edges.map((e) => ({
      ...EDGE_DEFAULTS,
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: normalizeHandle(e.sourceHandle),
    })),
  };
}

export function toFlowGraph(nodes: BuilderNode[], edges: BuilderEdge[]): FlowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.type,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.data,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: normalizeHandle(e.sourceHandle) })),
  };
}

export function snapshot(settings: BuilderSettings, nodes: BuilderNode[], edges: BuilderEdge[]): string {
  return JSON.stringify({ settings, flow: toFlowGraph(nodes, edges) });
}

export function isDirty(state: BuilderState): boolean {
  return snapshot(state.settings, state.nodes, state.edges) !== state.savedSnapshot;
}

export function settingsFromDetail(detail: AutomationDetail): BuilderSettings {
  return {
    name: detail.name,
    channelId: detail.channel.id,
    triggerType: detail.triggerType,
    matchMode: detail.matchMode,
    keywords: detail.keywords,
    excludeKeywords: detail.excludeKeywords,
    mediaIds: detail.mediaIds,
    publicReplyEnabled: detail.publicReplyEnabled,
    publicReplies: detail.publicReplies,
    oncePerContact: detail.oncePerContact,
  };
}

export function initBuilderState(detail: AutomationDetail): BuilderState {
  const settings = settingsFromDetail(detail);
  const { nodes, edges } = fromFlowGraph(detail.flow);
  const mediaById: Record<string, MediaSummary> = {};
  for (const m of detail.selectedMedia) mediaById[m.externalId] = m;
  return {
    settings,
    nodes,
    edges,
    selectedNodeId: null,
    status: detail.status,
    // A recovered (unparseable) flow must read as dirty so the user is nudged to save the repaired graph.
    savedSnapshot: detail.flowRecovered ? "" : snapshot(settings, nodes, edges),
    mediaById,
    history: { past: [], future: [], dragging: false, group: null, groupAt: 0 },
  };
}

// ───────────────────────── Handles ─────────────────────────

/** Mirrors the engine's handle table: which source handles a node exposes. */
export function allowedHandles(data: FlowNodeData): string[] {
  switch (data.type) {
    case "send_message": {
      const buttons = data.message.buttons ?? [];
      const quick = data.message.quickReplies ?? [];
      return [
        "next",
        ...buttons.map((b, i) => (b.type === "postback" ? `btn:${i}` : "")).filter(Boolean),
        ...quick.map((_, i) => `qr:${i}`),
      ];
    }
    case "condition_follow":
      return ["yes", "no"];
    default:
      return ["next"];
  }
}

export function handleLabel(handle: string): string {
  const h = normalizeHandle(handle);
  if (h === "next") return "next";
  if (h === "yes") return "following";
  if (h === "no") return "not following";
  if (h.startsWith("btn:")) return `button ${Number(h.slice(4)) + 1}`;
  if (h.startsWith("qr:")) return `quick reply ${Number(h.slice(3)) + 1}`;
  return h;
}

function edgeFromHandle(edges: BuilderEdge[], source: string, handle: string): BuilderEdge | undefined {
  return edges.find((e) => e.source === source && normalizeHandle(e.sourceHandle) === normalizeHandle(handle));
}

/** The last step on the main path (next, or "following" on a follow gate) whose way out is still free. */
function endOfMainPath(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderNode | undefined {
  const trigger = nodes.find((n) => n.data.type === "trigger");
  const seen = new Set<string>();
  let cursor = trigger;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const handles = allowedHandles(cursor.data);
    const primary = handles.includes("next") ? "next" : handles[0];
    const edge = primary ? edgeFromHandle(edges, cursor.id, primary) : undefined;
    if (!edge) return cursor;
    cursor = nodes.find((n) => n.id === edge.target);
  }
  return trigger;
}

// ───────────────────────── Node factories ─────────────────────────

export const NODE_WIDTH = 272;
const STEP_Y = 200;
const STEP_X = NODE_WIDTH + 72;
/** Vertical space between a step and the row below it. */
const ROW_GAP = 64;
const COLUMN_GAP = 48;

type Box = { id: string; x: number; y: number; w: number; h: number };

function boxesOf(nodes: BuilderNode[]): Box[] {
  return nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.measured?.width ?? NODE_WIDTH, h: n.measured?.height ?? 140 }));
}

/** True when two steps overlap or sit closer than `gap`. */
export function hasCrowdedNodes(nodes: BuilderNode[], gap = 12): boolean {
  const boxes = boxesOf(nodes);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap) return true;
    }
  }
  return false;
}

const snap = (v: number) => Math.round(v / 8) * 8;

/**
 * Rows by distance from the trigger (the first way each step is reached), each
 * row placed below the tallest step of the row above. Steps keep their left to
 * right order and roughly their x, pushed apart where they would touch.
 * Steps nothing leads to go in a last row.
 */
export function tidyPositions(nodes: BuilderNode[], edges: BuilderEdge[]): Record<string, { x: number; y: number }> {
  const boxes = boxesOf(nodes);
  const root = nodes.find((n) => n.data.type === "trigger");
  if (!root) return {};
  const depth = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const outgoing = edges.filter((e) => e.source === id).sort((a, b) => handleOrder(a.sourceHandle) - handleOrder(b.sourceHandle));
    for (const e of outgoing) {
      if (depth.has(e.target) || !boxes.some((b) => b.id === e.target)) continue;
      depth.set(e.target, (depth.get(id) ?? 0) + 1);
      queue.push(e.target);
    }
  }
  const last = Math.max(0, ...depth.values()) + 1;
  const rows = new Map<number, Box[]>();
  for (const b of boxes) {
    const d = depth.get(b.id) ?? last;
    rows.set(d, [...(rows.get(d) ?? []), b]);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  let y = root.position.y;
  for (const d of [...rows.keys()].sort((a, b) => a - b)) {
    const row = (rows.get(d) ?? []).sort((a, b) => a.x - b.x);
    let minX = -Infinity;
    for (const b of row) {
      const x = Math.max(b.x, minX);
      positions[b.id] = { x: snap(x), y: snap(y) };
      minX = x + b.w + COLUMN_GAP;
    }
    y += Math.max(...row.map((b) => b.h)) + ROW_GAP;
  }
  return positions;
}

/** "next" and "yes" first, then buttons and quick replies in order, "no" last: the reading order of a flow. */
function handleOrder(handle: string | null | undefined): number {
  const h = normalizeHandle(handle);
  if (h === "next" || h === "yes") return 0;
  if (h === "no") return 900;
  const n = Number(h.split(":")[1]);
  return Number.isFinite(n) ? 1 + n : 500;
}

export function newNodeData(type: AddableNodeType): FlowNodeData {
  switch (type) {
    case "send_message":
      return { type, message: { text: "" } };
    case "ask_question":
      return { type, prompt: { text: "" }, saveTo: "email", validation: "email", maxRetries: 2 };
    case "ai_reply":
      return { type, maxTurns: DEFAULT_AI_TURNS };
    case "condition_follow":
      return { type, retryPrompt: "" };
    case "delay":
      return { type, seconds: 3600 };
    case "add_tag":
      return { type, tag: "" };
    case "remove_tag":
      return { type, tag: "" };
    case "add_to_pipeline":
    case "move_stage":
      return { type, pipelineId: "", stageId: "" };
    case "remove_from_pipeline":
      return { type, pipelineId: "" };
  }
}

/** A new step's data with the first pipeline (and a sensible stage) already picked, so it works without extra clicks. */
export function prefilledNodeData(type: AddableNodeType, pipelines: ReadonlyArray<{ id: string; stages: ReadonlyArray<{ id: string }> }>): FlowNodeData {
  const data = newNodeData(type);
  const first = pipelines[0];
  if (!first) return data;
  if (data.type === "add_to_pipeline") return { ...data, pipelineId: first.id, stageId: first.stages[0]?.id ?? "" };
  if (data.type === "move_stage") return { ...data, pipelineId: first.id, stageId: first.stages[1]?.id ?? first.stages[0]?.id ?? "" };
  if (data.type === "remove_from_pipeline") return { ...data, pipelineId: first.id };
  return data;
}

const ID_PREFIX: Record<AddableNodeType, string> = {
  send_message: "message",
  ask_question: "ask",
  ai_reply: "ai",
  condition_follow: "follow",
  delay: "delay",
  add_tag: "tag",
  remove_tag: "untag",
  add_to_pipeline: "pipeline",
  move_stage: "stage",
  remove_from_pipeline: "unpipeline",
};

function uniqueId(prefix: string, taken: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
    if (!taken.has(id)) return id;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

/**
 * Slot for a step leaving `anchor` by `handle`: below for "next" and
 * "following", below and to the right for "not following", beside for button
 * and quick-reply branches. Shifts right while another node already sits there.
 */
function placeAfter(anchor: BuilderNode | undefined, nodes: BuilderNode[], handle = "next", avoidOverlap = true): { x: number; y: number } {
  if (!anchor) {
    const bottom = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
    return { x: 0, y: bottom + STEP_Y };
  }
  const h = normalizeHandle(handle);
  // Below the anchor's real height once React Flow has measured it, so tall messages don't get covered.
  const below = anchor.position.y + Math.max(STEP_Y, (anchor.measured?.height ?? 0) + ROW_GAP);
  const candidate =
    h.startsWith("btn:") || h.startsWith("qr:")
      ? { x: anchor.position.x + STEP_X, y: anchor.position.y + (Number(h.split(":")[1]) || 0) * 64 }
      : h === "no"
        ? { x: anchor.position.x + STEP_X / 2, y: below }
        : h === "yes"
          ? { x: anchor.position.x - STEP_X / 2, y: below }
          : { x: anchor.position.x, y: below };
  const occupied = (p: { x: number; y: number }) =>
    nodes.some((n) => Math.abs(n.position.x - p.x) < NODE_WIDTH && Math.abs(n.position.y - p.y) < STEP_Y * 0.6);
  let tries = 0;
  while (avoidOverlap && occupied(candidate) && tries < 8) {
    candidate.x += STEP_X;
    tries++;
  }
  return candidate;
}

/**
 * The step a freely dropped step should hang off: the closest one above the
 * drop point, roughly in the same column, with a free way out.
 */
function anchorAbove(nodes: BuilderNode[], edges: BuilderEdge[], at: { x: number; y: number }): { node: BuilderNode; handle: string } | null {
  let best: { node: BuilderNode; handle: string; score: number } | null = null;
  const centre = at.x + NODE_WIDTH / 2;
  for (const n of nodes) {
    const bottom = n.position.y + (n.measured?.height ?? 120);
    const dy = at.y - bottom;
    const dx = Math.abs(n.position.x + (n.measured?.width ?? NODE_WIDTH) / 2 - centre);
    if (dy < -16 || dy > 420 || dx > NODE_WIDTH * 1.25) continue;
    const handles = allowedHandles(n.data);
    const handle = handles.find((h) => !edgeFromHandle(edges, n.id, h));
    if (!handle) continue;
    const score = dy + dx * 0.6;
    if (!best || score < best.score) best = { node: n, handle, score };
  }
  return best ? { node: best.node, handle: best.handle } : null;
}

// ───────────────────────── Reducer ─────────────────────────

function withSelection(nodes: BuilderNode[], id: string | null): BuilderNode[] {
  return nodes.map((n) => (Boolean(n.selected) === (n.id === id) ? n : { ...n, selected: n.id === id }));
}

function reduce(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "settings": {
      const next = { ...state.settings, ...action.patch };
      // Public replies only exist for comment triggers; a DM trigger has no comment to reply under.
      if (next.triggerType !== "COMMENT") {
        next.publicReplyEnabled = false;
        next.mediaIds = [];
      }
      return { ...state, settings: next };
    }

    case "nodesChange": {
      const nodes = applyNodeChanges(action.changes, state.nodes);
      const removed = new Set(action.changes.filter((c) => c.type === "remove").map((c) => c.id));
      const edges = removed.size ? state.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) : state.edges;
      const selected = nodes.find((n) => n.selected)?.id ?? null;
      return { ...state, nodes, edges, selectedNodeId: selected };
    }

    case "edgesChange":
      return { ...state, edges: applyEdgeChanges(action.changes, state.edges) };

    case "connect": {
      const { source, target, sourceHandle } = action.connection;
      if (!source || !target || source === target) return state;
      const handle = normalizeHandle(sourceHandle);
      // One edge per handle: the engine can't pick between two "next" targets.
      const edges = state.edges.filter((e) => !(e.source === source && normalizeHandle(e.sourceHandle) === handle));
      edges.push({ ...EDGE_DEFAULTS, id: `e-${source}-${handle}-${target}-${Math.random().toString(36).slice(2, 6)}`, source, target, sourceHandle: handle });
      return { ...state, edges };
    }

    case "addNode": {
      const taken = new Set(state.nodes.map((n) => n.id));
      const id = uniqueId(ID_PREFIX[action.nodeType], taken);
      const anchor = action.after
        ? state.nodes.find((n) => n.id === action.after?.nodeId)
        : (state.nodes.find((n) => n.id === state.selectedNodeId) ?? endOfMainPath(state.nodes, state.edges));
      const data = action.data?.type === action.nodeType ? action.data : newNodeData(action.nodeType);
      let edges = [...state.edges];

      // Wire from the requested handle, or the anchor's first free one, so a new step is reachable straight away.
      const handle = anchor
        ? action.after && allowedHandles(anchor.data).includes(normalizeHandle(action.after.handle))
          ? normalizeHandle(action.after.handle)
          : allowedHandles(anchor.data).find((h) => !edgeFromHandle(edges, anchor.id, h))
        : undefined;
      const existing = anchor && handle ? edgeFromHandle(edges, anchor.id, handle) : undefined;

      if (anchor && handle && existing) {
        // Inserting on a handle that already leads somewhere puts the new step in between
        // and moves everything from that row down to make room.
        const position = placeAfter(anchor, state.nodes, handle, false);
        const node: BuilderNode = { id, type: action.nodeType, position, data, deletable: true, selected: true };
        const moved = state.nodes.map((n) => (n.id !== anchor.id && n.position.y >= position.y - STEP_Y * 0.4 ? { ...n, position: { x: n.position.x, y: n.position.y + STEP_Y } } : n));
        edges = edges.filter((e) => e.id !== existing.id);
        edges.push({ ...EDGE_DEFAULTS, id: `e-${anchor.id}-${handle}-${id}`, source: anchor.id, target: id, sourceHandle: handle });
        edges.push({ ...EDGE_DEFAULTS, id: `e-${id}-next-${existing.target}`, source: id, target: existing.target, sourceHandle: "next" });
        return { ...state, nodes: [...withSelection(moved, null), node], edges, selectedNodeId: id };
      }

      const position = action.position ?? placeAfter(anchor, state.nodes, handle);
      const node: BuilderNode = { id, type: action.nodeType, position, data, deletable: true, selected: true };
      if (anchor && handle) edges.push({ ...EDGE_DEFAULTS, id: `e-${anchor.id}-${handle}-${id}`, source: anchor.id, target: id, sourceHandle: handle });
      return { ...state, nodes: [...withSelection(state.nodes, null), node], edges, selectedNodeId: id };
    }

    case "dropNode": {
      const edge = action.edgeId ? state.edges.find((e) => e.id === action.edgeId) : undefined;
      if (edge) {
        return reduce(state, { type: "addNode", nodeType: action.nodeType, data: action.data, after: { nodeId: edge.source, handle: normalizeHandle(edge.sourceHandle) } });
      }
      const position = { x: snap(action.position.x - NODE_WIDTH / 2), y: snap(action.position.y - 28) };
      const anchor = anchorAbove(state.nodes, state.edges, position);
      if (anchor) {
        return reduce(state, { type: "addNode", nodeType: action.nodeType, data: action.data, after: { nodeId: anchor.node.id, handle: anchor.handle }, position });
      }
      // Nothing above to hang it off: it lands unconnected and its handles invite a connection.
      const taken = new Set(state.nodes.map((n) => n.id));
      const id = uniqueId(ID_PREFIX[action.nodeType], taken);
      const data = action.data?.type === action.nodeType ? action.data : newNodeData(action.nodeType);
      const node: BuilderNode = { id, type: action.nodeType, position, data, deletable: true, selected: true };
      return { ...state, nodes: [...withSelection(state.nodes, null), node], selectedNodeId: id };
    }

    case "updateNodeData": {
      const nodes = state.nodes.map((n) => (n.id === action.id ? { ...n, data: action.data } : n));
      const allowed = new Set(allowedHandles(action.data));
      const remap = action.handleRemap ?? {};
      const edges: BuilderEdge[] = [];
      for (const e of state.edges) {
        if (e.source !== action.id) {
          edges.push(e);
          continue;
        }
        const current = normalizeHandle(e.sourceHandle);
        const mapped = current in remap ? remap[current] : current;
        // Removed buttons drop their edges; later buttons shift down one handle.
        if (mapped === null || !allowed.has(mapped)) continue;
        edges.push(mapped === current ? e : { ...e, sourceHandle: mapped });
      }
      return { ...state, nodes, edges };
    }

    case "arrange": {
      const nodes = state.nodes.map((n) => (action.positions[n.id] ? { ...n, position: action.positions[n.id] } : n));
      const wasClean = snapshot(state.settings, state.nodes, state.edges) === state.savedSnapshot;
      return { ...state, nodes, savedSnapshot: action.rebaseline && wasClean ? snapshot(state.settings, nodes, state.edges) : state.savedSnapshot };
    }

    case "removeNode": {
      const target = state.nodes.find((n) => n.id === action.id);
      if (!target || target.data.type === "trigger") return state;
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.id),
        edges: state.edges.filter((e) => e.source !== action.id && e.target !== action.id),
        selectedNodeId: state.selectedNodeId === action.id ? null : state.selectedNodeId,
      };
    }

    case "removeEdge":
      return { ...state, edges: state.edges.filter((e) => e.id !== action.id) };

    case "select":
      return { ...state, nodes: withSelection(state.nodes, action.id), selectedNodeId: action.id };

    case "saved": {
      const settings = settingsFromDetail(action.detail);
      // Keep the on-screen graph (positions, selection) and only re-baseline the snapshot.
      return { ...state, settings, status: action.detail.status, savedSnapshot: snapshot(settings, state.nodes, state.edges) };
    }

    case "setStatus":
      return { ...state, status: action.status };

    case "mediaLoaded": {
      const mediaById = { ...state.mediaById };
      for (const item of action.items) mediaById[item.externalId] = item;
      return { ...state, mediaById };
    }

    // History is handled by `builderReducer`; these never reach here.
    case "undo":
    case "redo":
      return state;
  }
}

// ───────────────────────── Undo ─────────────────────────

const HISTORY_LIMIT = 60;
/** Edits to the same field closer together than this are one undo step. */
const GROUP_MS = 900;

function capture(state: BuilderState): Snapshot {
  return { settings: state.settings, nodes: state.nodes, edges: state.edges };
}

type HistoryEntry = { group?: string; dragStart?: boolean } | null;

/** Whether an action is an edit worth undoing, and which edits it merges with. */
function recordFor(state: BuilderState, action: BuilderAction): HistoryEntry {
  switch (action.type) {
    case "settings":
      return { group: `settings:${Object.keys(action.patch).sort().join(",")}` };
    case "updateNodeData":
      return { group: `data:${action.id}` };
    case "nodesChange": {
      if (action.changes.some((c) => c.type === "remove")) return {};
      const dragStart = action.changes.some((c) => c.type === "position" && c.dragging) && !state.history.dragging;
      return dragStart ? { dragStart: true } : null;
    }
    case "edgesChange":
      return action.changes.some((c) => c.type === "remove") ? {} : null;
    case "arrange":
      return action.rebaseline ? null : {};
    case "connect":
    case "addNode":
    case "dropNode":
    case "removeNode":
    case "removeEdge":
      return {};
    default:
      return null;
  }
}

function restore(state: BuilderState, snap: Snapshot, history: History): BuilderState {
  return {
    ...state,
    settings: snap.settings,
    nodes: snap.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    edges: snap.edges,
    selectedNodeId: null,
    history,
  };
}

/** The builder's reducer: the edit itself, plus an undo history of the settings and the graph. */
export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  const h = state.history;
  if (action.type === "undo") {
    const previous = h.past[h.past.length - 1];
    if (!previous) return state;
    return restore(state, previous, { past: h.past.slice(0, -1), future: [capture(state), ...h.future].slice(0, HISTORY_LIMIT), dragging: false, group: null, groupAt: 0 });
  }
  if (action.type === "redo") {
    const next = h.future[0];
    if (!next) return state;
    return restore(state, next, { past: [...h.past, capture(state)].slice(-HISTORY_LIMIT), future: h.future.slice(1), dragging: false, group: null, groupAt: 0 });
  }

  const next = reduce(state, action);
  if (next === state) return state;

  const dragEnded = action.type === "nodesChange" && h.dragging && action.changes.some((c) => c.type === "position" && c.dragging === false);
  const record = recordFor(state, action);
  if (!record) return dragEnded ? { ...next, history: { ...next.history, dragging: false } } : next;

  const now = Date.now();
  const merge = Boolean(record.group && h.group === record.group && now - h.groupAt < GROUP_MS);
  return {
    ...next,
    history: {
      past: merge ? h.past : [...h.past, capture(state)].slice(-HISTORY_LIMIT),
      future: [],
      dragging: record.dragStart ? true : dragEnded ? false : h.dragging,
      group: record.group ?? null,
      groupAt: now,
    },
  };
}

// ───────────────────────── Derived helpers ─────────────────────────

/** Errors from `validateFlow` mention node ids in quotes; map them back to nodes for inline badges. */
export function nodeErrorsFrom(errors: string[], nodes: BuilderNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of nodes) {
    const mine = errors.filter((e) => e.includes(`"${node.id}"`));
    if (mine.length) map.set(node.id, mine);
  }
  return map;
}

export const SAMPLE_VARS: Record<string, string> = { username: "@sita.rai", name: "Sita Rai", first_name: "Sita" };

export function renderPreviewMessage(message: OutboundMessage, vars: Record<string, string> = SAMPLE_VARS): OutboundMessage {
  return {
    ...message,
    text: message.text !== undefined ? renderTemplate(message.text, vars) : undefined,
    buttons: message.buttons?.map((b) => ({ ...b, title: renderTemplate(b.title, vars) })),
    quickReplies: message.quickReplies?.map((q) => ({ ...q, title: renderTemplate(q.title, vars) })),
  };
}

export function followPromptMessage(retryPrompt: string | undefined, accountHandle: string): OutboundMessage {
  const text = retryPrompt?.trim() || `It looks like you're not following ${accountHandle} yet. Follow, then tap the button below to continue.`;
  return { text, buttons: [{ type: "postback", title: "I'm following", payload: "follow_check" }] };
}

/**
 * The conversation a contact would see on the happy path: trigger → next /
 * yes / first button, up to `max` messages. Used by the "flow preview".
 */
export function conversationPreview(nodes: BuilderNode[], edges: BuilderEdge[], accountHandle: string, max = 6): OutboundMessage[] {
  const flow = toFlowGraph(nodes, edges);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const next = (from: string, handle: string) => {
    const edge = flow.edges.find((e) => e.source === from && normalizeHandle(e.sourceHandle) === handle);
    return edge && byId.has(edge.target) ? edge.target : null;
  };
  const out: OutboundMessage[] = [];
  const seen = new Set<string>();
  let cursor = flow.nodes.find((n) => n.data.type === "trigger")?.id ?? null;
  while (cursor && !seen.has(cursor) && out.length < max) {
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    const data = node.data;
    if (data.type === "send_message") {
      out.push(renderPreviewMessage(data.message));
      cursor = next(node.id, "next") ?? next(node.id, "btn:0") ?? next(node.id, "qr:0");
      continue;
    }
    if (data.type === "ask_question") {
      out.push(renderPreviewMessage(data.prompt));
      cursor = next(node.id, "next");
      continue;
    }
    if (data.type === "condition_follow") {
      const yes = next(node.id, "yes");
      if (yes) {
        cursor = yes;
        continue;
      }
      out.push(followPromptMessage(data.retryPrompt, accountHandle));
      break;
    }
    cursor = next(node.id, "next");
  }
  return out;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function charCount(text: string): number {
  return Array.from(text).length;
}
