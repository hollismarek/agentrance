export type ActivityEvent = {kind: string; data: any; at?: number | null; seq?: number};
export type Operation = {
  id: string; title: string; kind?: string; status: string; started?: number; ended?: number;
  reported: Record<string, any>; updates: ActivityEvent[];
  approvals: {request: any; params: any; decision?: any; expired?: boolean; generation: number}[];
};
const record = (v: any): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const terminal = new Set(['completed', 'failed', 'declined', 'interrupted']);
export const activityKinds = new Set(['tool', 'permission', 'permission_resolved', 'done', 'disconnected', 'session_closed', 'connection_started']);

// ACP updates are patches. Arrays such as content replace the previous snapshot;
// rawInput/rawOutput null means unchanged. Keep every patch for provider variants.
export function reduceActivity(events: ActivityEvent[], live = true): Operation[] {
  let generation=0;
  const operations = new Map<string, Operation>();
  function operation(patch: any, event: ActivityEvent, fallback: string) {
    patch = record(patch) ? patch : {};
    const id = typeof patch.toolCallId === 'string' ? patch.toolCallId : fallback;
    let op = operations.get(id);
    if (!op) {
      op = {id, title: 'Tool operation', status: 'pending', reported: Object.create(null), updates: [], approvals: []};
      operations.set(id, op);
    }
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value !== undefined && value !== null) op.reported[key] = value;
    }
    op.title = [op.reported.title, op.reported.name].find(v => typeof v === 'string' && v) || 'Tool operation';
    op.kind = typeof op.reported.kind === 'string' ? op.reported.kind : undefined;
    if (typeof patch.status === 'string') {
      const statuses = new Map([['in_progress','running'],['completed','completed'],['failed','failed'],['pending','pending']]);
      op.status = statuses.get(patch.status) || 'pending';
      if (op.status === 'running' && op.started === undefined && event.at != null) op.started = event.at;
      if (terminal.has(op.status) && event.at != null) op.ended = event.at;
    }
    op.updates.push(event);
    return op;
  }
  for (const [index, e] of events.entries()) {
    if (!record(e)) continue;
    if (e.kind === 'tool') operation(e.data, e, `legacy-${index}`);
    if (e.kind === 'permission' && record(e.data) && record(e.data.params)) {
      const op = operation(e.data.params?.toolCall, e, `permission-${JSON.stringify(e.data.request)}`);
      op.approvals.push({generation,request: e.data.request, params: {...e.data.params, options: Array.isArray(e.data.params.options) ? e.data.params.options.filter((o: any) => record(o) && typeof o.optionId === 'string' && typeof o.name === 'string' && typeof o.kind === 'string') : []}});
    }
    if (e.kind === 'permission_resolved' && record(e.data)) {
      for (const op of operations.values()) {
        const approval = op.approvals.find(a => JSON.stringify(a.request) === JSON.stringify(e.data.request) && !a.decision && a.generation===generation);
        if (!approval) continue;
        approval.decision = e.data;
        if (e.data.option == null || (typeof e.data.optionKind === 'string' && e.data.optionKind.startsWith('reject'))) {
          op.status = 'declined';
          if (e.at != null) op.ended = e.at;
        }
      }
    }
    if (['done', 'disconnected', 'session_closed', 'connection_started'].includes(e.kind)) {
      if(e.kind==='connection_started')generation++;
      for (const op of operations.values()) {
        for (const a of op.approvals) if (!a.decision) a.expired = true;
        if (!terminal.has(op.status)) {
          op.status = 'interrupted'; // Never invent success from turn completion.
          if (e.at != null) op.ended = e.at;
        }
      }
    }
  }
  for (const op of operations.values()) {
    if (!live) {
      for (const a of op.approvals) if (!a.decision) a.expired = true;
      if (!terminal.has(op.status)) op.status = 'interrupted';
    } else if (op.approvals.some(a => !a.decision && !a.expired)) op.status = 'awaiting';
  }
  return [...operations.values()];
}

export function operationOutput(op: Operation) {
  const raw = op.reported.rawOutput;
  const stdout = typeof raw?.stdout === 'string' ? raw.stdout : undefined;
  const stderr = typeof raw?.stderr === 'string' ? raw.stderr : undefined;
  const exitCode = raw?.exitCode ?? raw?.exit_code ?? raw?.exitStatus?.exitCode;
  const content = Array.isArray(op.reported.content) ? op.reported.content : [];
  return {stdout, stderr, exitCode: typeof exitCode === 'number' ? exitCode : undefined,
    text: content.filter((c: any) => record(c) && c.type === 'content' && c.content?.type === 'text' && typeof c.content.text === 'string').map((c: any) => c.content.text).join('\n'),
    terminals: content.filter((c: any) => record(c) && c.type === 'terminal' && typeof c.terminalId === 'string').map((c: any) => c.terminalId),
    raw};
}
export function commandText(op: Operation): string | undefined {
  const input = op.reported.rawInput;
  if (typeof input === 'string' && op.kind === 'execute') return input;
  const command = input?.command ?? input?.command_line ?? input?.commandLine;
  return typeof command === 'string' ? command : Array.isArray(command) ? JSON.stringify(command) : undefined;
}
export function elapsed(op: Operation, now: number): string {
  if (op.started === undefined) return 'Elapsed time unavailable';
  const end = op.ended ?? (['running','awaiting','pending'].includes(op.status) ? now : undefined);
  if (end === undefined) return 'Elapsed time unavailable';
  return `${Math.max(0, (end - op.started) / 1000).toFixed(1)}s elapsed${op.ended === undefined ? ' · observed' : ''}`;
}
