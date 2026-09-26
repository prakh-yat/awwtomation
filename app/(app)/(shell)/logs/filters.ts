import type { DeliveryKind, DeliveryStatus } from "@prisma/client";

import type { DeliveryLogFilters } from "@/lib/services/logs";

import { KIND_ORDER, STATUS_ORDER } from "./labels";

/** Filter state as the client holds it. Empty string = "all". Mirrors the query string of GET /api/logs. */
export type LogFilterState = {
  status: DeliveryStatus | "";
  kind: DeliveryKind | "";
  channelId: string;
  automationId: string;
  /** Not user-editable here; arrives via links from the broadcasts / contacts pages. */
  broadcastId: string;
  contactId: string;
  q: string;
  from: string;
  to: string;
};

export const EMPTY_LOG_FILTERS: LogFilterState = {
  status: "",
  kind: "",
  channelId: "",
  automationId: "",
  broadcastId: "",
  contactId: "",
  q: "",
  from: "",
  to: "",
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: string): value is DeliveryStatus {
  return (STATUS_ORDER as readonly string[]).includes(value);
}

function isKind(value: string): value is DeliveryKind {
  return (KIND_ORDER as readonly string[]).includes(value);
}

export function hasActiveLogFilters(f: LogFilterState): boolean {
  return Boolean(f.status || f.kind || f.channelId || f.automationId || f.broadcastId || f.contactId || f.q.trim() || f.from || f.to);
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

export function logFiltersFromSearchParams(params: ParamSource): LogFilterState {
  const get = (key: string): string => {
    if (params instanceof URLSearchParams) return params.get(key) ?? "";
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const status = get("status");
  const kind = get("kind");
  const from = get("from");
  const to = get("to");
  return {
    status: isStatus(status) ? status : "",
    kind: isKind(kind) ? kind : "",
    channelId: get("channelId"),
    automationId: get("automationId"),
    broadcastId: get("broadcastId"),
    contactId: get("contactId"),
    q: get("q"),
    from: DAY_KEY.test(from) ? from : "",
    to: DAY_KEY.test(to) ? to : "",
  };
}

/** Query-string form shared by the list fetch, the export link and the URL bar. Empty values are omitted. */
export function logFiltersToSearchParams(f: LogFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.kind) params.set("kind", f.kind);
  if (f.channelId) params.set("channelId", f.channelId);
  if (f.automationId) params.set("automationId", f.automationId);
  if (f.broadcastId) params.set("broadcastId", f.broadcastId);
  if (f.contactId) params.set("contactId", f.contactId);
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  return params;
}

/** Service-side filter shape, for the server page's initial query. */
export function logFiltersToServiceFilters(f: LogFilterState): DeliveryLogFilters {
  return {
    status: f.status || undefined,
    kind: f.kind || undefined,
    channelId: f.channelId || undefined,
    automationId: f.automationId || undefined,
    broadcastId: f.broadcastId || undefined,
    contactId: f.contactId || undefined,
    q: f.q.trim() || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
  };
}
