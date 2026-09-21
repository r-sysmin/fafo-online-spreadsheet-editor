import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LocaleType, merge } from "@univerjs/core";
import { defaultTheme } from "@univerjs/themes";
import { createUniver } from "@/lib/univer-bootstrap";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import { UniverSheetsThreadCommentPreset } from "@univerjs/preset-sheets-thread-comment";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import sheetsSortEnUS from "@univerjs/preset-sheets-sort/locales/en-US";
import sheetsFilterEnUS from "@univerjs/preset-sheets-filter/locales/en-US";
import sheetsFindReplaceEnUS from "@univerjs/preset-sheets-find-replace/locales/en-US";
import sheetsThreadCommentEnUS from "@univerjs/preset-sheets-thread-comment/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-thread-comment/lib/index.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, MoreVertical, Download, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImportExportMenu, useImportExportHandlers } from "@/components/ImportExportMenu";
import {
  PresenceAvatars,
  colorForUser,
  type PresentUser,
} from "@/components/PresenceAvatars";
import { RemoteCursors, type RemoteSelection } from "@/components/RemoteCursors";
import { ConnectionStatus, type ConnState } from "@/components/ConnectionStatus";

const SELECTION_THROTTLE_MS = 100;

type SelectionState = {
  subUnitId: string;
  range: {
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
  };
} | null;

type Props = { id: string };

type Command = { id: string; params: any };
type BroadcastMsg = { clientId: string; seq: number; command: Command };

// Compaction tuning
const PRUNE_TAIL_K = 50; // keep this many recent mutations even after snapshot
const FORCE_SAVE_AFTER_MUTATIONS = 100;

// Adaptive debounce: full-snapshot saves are O(snapshot size). At ~2 MB the
// DB write hits statement timeouts. Stretch the debounce so the mutation log
// (which carries every edit) covers the in-between state and the snapshot
// only catches up periodically.
const SAVE_DEBOUNCE_MS_SMALL = 2_000;       // < 256 KB
const SAVE_DEBOUNCE_MS_MEDIUM = 5_000;      // 256 KB – 1 MB
const SAVE_DEBOUNCE_MS_LARGE = 15_000;      // 1 – 4 MB
const SAVE_DEBOUNCE_MS_HUGE = 30_000;       // > 4 MB
const SNAP_BYTES_MEDIUM = 256 * 1024;
const SNAP_BYTES_LARGE = 1024 * 1024;
const SNAP_BYTES_HUGE = 4 * 1024 * 1024;


function blankWorkbookData(id: string) {
  const sheetId = "sheet-01";
  return {
    id,
    sheetOrder: [sheetId],
    name: "",
    appVersion: "3.0.0-alpha",
    locale: LocaleType.EN_US,
    styles: {},
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "Sheet1",
        rowCount: 100,
        columnCount: 26,
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
        cellData: {},
      },
    },
    resources: [],
  };
}

export default function SpreadsheetEditor({ id }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerApiRef = useRef<any>(null);
  const univerRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingRemote = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sendChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const clientIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const authorIdRef = useRef<string | null>(null);
  const recentRemoteSigsRef = useRef<Map<string, number>>(new Map());

  // Replay/ordering state.
  const replayReadyRef = useRef(false); // false until snapshot+replay done
  const liveBufferRef = useRef<BroadcastMsg[]>([]);
  // snapshotBaseSeqRef: seqs <= this are fully represented by the current
  // in-memory snapshot baseline (set on load, advanced after a successful save).
  // Mutations with seq <= this can be safely deduped without applying.
  const snapshotBaseSeqRef = useRef<number>(0);
  // appliedSeqsRef: every seq we've successfully applied (or deduped against
  // the snapshot). Sole source of truth for "have I seen this mutation?".
  const appliedSeqsRef = useRef<Set<number>>(new Set());
  // contiguousAppliedSeqRef: highest N such that EVERY seq in
  // (snapshotBaseSeqRef, N] has been applied. Used for gap-detection and
  // catch-up fromSeq — NEVER for dedup of a specific seq (peers' lower seqs
  // can legitimately arrive after our own higher-seq local inserts).
  const contiguousAppliedSeqRef = useRef<number>(0);
  // maxAppliedSeqRef: highest seq we've ever applied, regardless of gaps.
  const maxAppliedSeqRef = useRef<number>(0);
  const gapFetchInFlightRef = useRef<Promise<void> | null>(null);
  const mutationsSinceSnapshotRef = useRef<number>(0);
  const lastSnapshotBytesRef = useRef<number>(0);
  const mobileImportInputRef = useRef<HTMLInputElement | null>(null);

  // ----- Per-cell last-writer-wins by seq (Bug 1) -----
  // cellMaxSeqRef[key] = highest seq ever applied to that cell. Used to drop
  // late-arriving remote mutations whose seq is below an already-applied
  // higher-seq write to the same cell. Key format: `${unitId}|${subUnitId}|${r}|${c}`.
  const cellMaxSeqRef = useRef<Map<string, number>>(new Map());
  // pendingLocalCellsRef[key] = local cell value we executed optimistically
  // but whose seq isn't yet known (DB insert in flight). Remote mutations to
  // these cells are deferred until we know our seq, so we never apply a
  // remote that would lose to our own pending local write.
  const pendingLocalCellsRef = useRef<Map<string, { value: any; ts: number }>>(new Map());
  // Remotes that touched a pending-local cell — drained after persistAndBroadcast.
  const deferredRemotesRef = useRef<Array<{ seq: number; command: Command; source: string }>>([]);


  const [title, setTitle] = useState("Untitled spreadsheet");
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "error-permanent" | "access-revoked"
  >("saved");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [present, setPresent] = useState<PresentUser[]>([]);
  const [remoteSelections, setRemoteSelections] = useState<
    Record<string, RemoteSelection>
  >({});
  const [activeSubUnitId, setActiveSubUnitId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | null>(null);
  const roleRef = useRef<"owner" | null>(null);
  const [connState, setConnState] = useState<ConnState>(
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "reconnecting",
  );
  const hasBeenSubscribedRef = useRef(false);
  const catchUpInFlightRef = useRef<Promise<void> | null>(null);
  const channelErrorCountRef = useRef(0);
  const syncIssueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAttemptsRef = useRef(0);
  const accessRevokedRef = useRef(false);


  // Selection broadcast throttle state
  const lastSelSentAtRef = useRef(0);
  const pendingSelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSelectionRef = useRef<SelectionState>(null);
  const presencePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceReadyRef = useRef(false);
  const myIdentityRef = useRef<{
    userId: string;
    name: string;
    color: string;
    email: string;
  } | null>(null);

  // Shared CSV/XLSX handlers — used by the desktop ImportExportMenu and the
  // mobile overflow menu.
  const ioHandlers = useImportExportHandlers({
    getUniverApi: () => univerApiRef.current,
    title,
    canEdit: role === "owner",
  });


  // Briefly surface a "Sync issue" indicator after a recoverable problem
  // (e.g. a poison remote mutation we skipped). Doesn't override "offline".
  function bumpSyncIssue(ms = 2500) {
    setConnState((s) => (s === "offline" ? s : "sync-issue"));
    if (syncIssueTimerRef.current) clearTimeout(syncIssueTimerRef.current);
    syncIssueTimerRef.current = setTimeout(() => {
      syncIssueTimerRef.current = null;
      setConnState((s) =>
        s === "sync-issue"
          ? (typeof navigator !== "undefined" && navigator.onLine === false
              ? "offline"
              : "connected")
          : s,
      );
    }, ms);
  }

  function isAuthOrRlsError(error: any): boolean {
    if (!error) return false;
    const code = error.code;
    const status = error.status ?? error.statusCode;
    // PostgREST RLS denial codes + HTTP 401/403
    return (
      code === "42501" ||
      code === "PGRST301" ||

      status === 401 ||
      status === 403
    );
  }


  useEffect(() => {
    let cancelled = false;
    if (initializedRef.current) return;
    initializedRef.current = true;
    setLoadError(null);


    async function init() {


      // --- 0. Get current user up front for presence ---
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      authorIdRef.current = user?.id ?? null;
      setCurrentUserId(user?.id ?? null);
      const myUserId = user?.id ?? `anon-${clientIdRef.current}`;
      const myEmail = user?.email ?? "";
      const myName = myEmail ? myEmail.split("@")[0] : "Guest";
      const myColor = colorForUser(myUserId);
      myIdentityRef.current = { userId: myUserId, name: myName, color: myColor, email: myEmail };

      if (cancelled) return;

      // Determine whether the current user owns this sheet
      let myRole: "owner" | null = null;
      if (user?.id) {
        const { data: ownerRow } = await supabase
          .from("spreadsheets")
          .select("owner_id")
          .eq("id", id)
          .maybeSingle();
        myRole = ownerRow?.owner_id === user.id ? "owner" : null;
      }
      roleRef.current = myRole;
      setRole(myRole);
      const isViewer = myRole === null;




      // --- 1. Subscribe to realtime FIRST and buffer ---
      // Defensively remove any stale channel with this name (e.g. left over
      // from a previous StrictMode/Suspense mount whose cleanup raced with
      // re-init). Reusing an already-subscribed channel makes .on() throw
      // "cannot add presence callbacks after subscribe()".
      const channelName = `sheet:${id}`;
      try {
        for (const ch of supabase.getChannels()) {
          if ((ch as any).topic === `realtime:${channelName}` || (ch as any).topic === channelName) {
            await supabase.removeChannel(ch);
          }
        }
      } catch {}
      // Authenticate the realtime socket as the current user BEFORE creating
      // the private channel; without this the JOIN authorizes as anon and RLS
      // on realtime.messages blocks broadcast/presence relay.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      } catch {}
      const channel = supabase.channel(channelName, {
        config: {
          private: true,
          broadcast: { self: false },
          presence: { key: clientIdRef.current },
        },
      });
      channelRef.current = channel;
      // Send-only companion channel: same topic, never .subscribe()'d, so
      // .send() falls back to HTTP broadcast and never closes the subscribed
      // channel's socket on first outbound message.
      const sendChannel = supabase.channel(channelName, {
        config: { private: true, broadcast: { self: false } },
      });
      sendChannelRef.current = sendChannel;

      channel.on("broadcast", { event: "mutation" }, (payload) => {
        const msg = payload?.payload as BroadcastMsg | undefined;
        if (!msg || !msg.command) return;
        if (msg.clientId === clientIdRef.current) return;
        if (!replayReadyRef.current) {
          liveBufferRef.current.push(msg);
          return;
        }
        void handleLiveMutation(msg);
      });

      channel.on("broadcast", { event: "title" }, (payload) => {
        const p = payload?.payload as { clientId?: string; title?: string } | undefined;
        if (!p || typeof p.title !== "string") return;
        if (p.clientId === clientIdRef.current) return;
        setTitle(p.title);
      });

      const recomputePresence = () => {
        const state = channel.presenceState() as Record<string, any[]>;
        const byUser = new Map<string, PresentUser>();
        const sels: Record<string, RemoteSelection> = {};
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            const uid = entry.userId as string;
            if (!uid) continue;
            const existing = byUser.get(uid);
            if (existing) {
              existing.tabCount += 1;
            } else {
              byUser.set(uid, {
                userId: uid,
                name: entry.name ?? "Guest",
                email: entry.email ?? "",
                color: entry.color ?? colorForUser(uid),
                tabCount: 1,
              });
            }
            const cid = entry.clientId as string | undefined;
            const sel = entry.selection as SelectionState | undefined;
            if (
              cid &&
              cid !== clientIdRef.current &&
              sel &&
              sel.range &&
              sel.subUnitId
            ) {
              sels[cid] = {
                clientId: cid,
                userId: uid,
                name: entry.name ?? "Guest",
                color: entry.color ?? colorForUser(uid),
                subUnitId: sel.subUnitId,
                range: sel.range,
              };
            }
          }
        }
        // Stable order: current user first, then alphabetical by name
        const list = Array.from(byUser.values()).sort((a, b) => {
          if (a.userId === myUserId) return -1;
          if (b.userId === myUserId) return 1;
          return a.name.localeCompare(b.name);
        });
        setPresent(list);
        setRemoteSelections(sels);
      };


      channel.on("presence", { event: "sync" }, recomputePresence);
      channel.on("presence", { event: "join" }, recomputePresence);
      channel.on("presence", { event: "leave" }, recomputePresence);
      // No presence poll: single-user workspace, the channel is never
      // subscribed, so presenceState() would always be empty.
      recomputePresence();

      // Seq-gated DB catch-up poll: additive safety net so mutations propagate
      // even if the realtime channel silently dies (e.g. server-initiated
      // phx_close that never rejoins). Idempotent via applyMutationRow's
      // dedup / LWW / deferral guards. Must not touch replayReadyRef or
      // liveBuffer.
      const pollNew = async () => {
        if (cancelled) return;
        if (!univerApiRef.current || !replayReadyRef.current) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        if (typeof document !== "undefined" && document.hidden) return;
        const fromSeq = contiguousAppliedSeqRef.current + 1;
        try {
          const { data } = await supabase
            .from("spreadsheet_mutations")
            .select("seq,mutation")
            .eq("spreadsheet_id", id)
            .gte("seq", fromSeq)
            .order("seq", { ascending: true })
            .limit(500);
          for (const r of data ?? []) {
            await applyMutationRow(r.seq as number, r.mutation as Command, "db-poll");
          }
        } catch {}
      };
      dbPollRef.current = setInterval(pollNew, 1500);

      // Sharing was removed: this workspace is single-user, so there are no
      // remote peers to broadcast to and the private channel has no realtime
      // authorization behind it. Subscribing would fail forever and pin the
      // header on "Reconnecting…" even though every save succeeds. Durable
      // state comes from the snapshot + the seq-gated DB catch-up poll above,
      // so connection state is simply browser connectivity.
      setConnState(navigator.onLine === false ? "offline" : "connected");
      channelRef.current = channel;

      // --- 2. Load snapshot row ---
      const { data: row, error } = await supabase
        .from("spreadsheets")
        .select("id,title,snapshot,snapshot_seq")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        const msg = error.message || "Failed to load spreadsheet";
        const denied = (error as any).code === "42501" || (error as any).status === 401 || (error as any).status === 403;
        if (denied) {
          // Tear down realtime immediately so we don't keep receiving
          // broadcasts / presence for a sheet the user can't read.
          try {
            if (channelRef.current) {
              await supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
          } catch {}
          console.error("spreadsheet load denied", msg);
          setLoadError("You don't have access to this spreadsheet.");
        } else {
          console.error("spreadsheet load failed", msg);
          setLoadError("Couldn't load this spreadsheet. Please try again.");
        }
        return;
      }
      if (!row) {
        setNotFound(true);
        return;
      }
      setTitle(row.title);


      if (cancelled) return;
      if (!containerRef.current) return;

      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: merge({}, sheetsCoreEnUS, sheetsSortEnUS, sheetsFilterEnUS, sheetsFindReplaceEnUS, sheetsThreadCommentEnUS),
        },
        theme: defaultTheme,
        presets: [
          UniverSheetsCorePreset({ container: containerRef.current }),
          UniverSheetsSortPreset(),
          UniverSheetsFilterPreset(),
          UniverSheetsFindReplacePreset(),
          UniverSheetsThreadCommentPreset(),
        ],
      });

      univerRef.current = univer;
      univerApiRef.current = univerAPI;
      (window as any).univerAPI = univerAPI;

      if (typeof window !== "undefined") (window as any).__univerAPI = univerAPI;

      const snapshot =
        row.snapshot && typeof row.snapshot === "object" && (row.snapshot as any).sheetOrder
          ? (row.snapshot as any)
          : blankWorkbookData(row.id);

      try {
        univerAPI.createWorkbook(snapshot);
      } catch (e) {
        console.error("Failed to load snapshot, starting blank", e);
        univerAPI.createWorkbook(blankWorkbookData(row.id));
      }
      // Seed snapshot-size estimate so the first scheduleSave on a large
      // sheet already uses the stretched debounce.
      try {
        lastSnapshotBytesRef.current = JSON.stringify(snapshot).length;
      } catch {
        lastSnapshotBytesRef.current = 0;
      }

      // Set the current user identity for thread-comment authorship.
      try {
        const um: any = univerAPI.getUserManager?.();
        const svc = um?._userManagerService;
        if (svc && typeof svc.setCurrentUser === "function") {
          svc.setCurrentUser({
            userID: myUserId,
            name: myName || myEmail || "Guest",
            avatar: "",
          });
        }
      } catch {}

      // Grant comment + view permissions for non-viewers so the thread-comment
      // permission controller doesn't silently throw CustomCommandExecutionError
      // and return false from AddCommentCommand. Univer's permission service
      // treats only `value === false` as a denial, but the bundled permission
      // init controller registers points defaulting to false in some flows.
      if (!isViewer) {
        try {
          const wb = univerAPI.getActiveWorkbook?.();
          const unitId = wb?.getId?.();
          const subUnitId = wb?.getActiveSheet?.()?.getSheetId?.();
          const injector: any = (wb as any)?._injector;
          const core = await import("@univerjs/core");
          const sheets = await import("@univerjs/sheets");
          const permissionService: any = injector?.get?.(core.IPermissionService);
          const ensure = (point: any) => {
            try {
              const existing = permissionService.getPermissionPoint(point.id);
              if (existing) permissionService.updatePermissionPoint(point.id, true);
              else {
                point.value = true;
                permissionService.addPermissionPoint(point);
              }
            } catch {}
          };
          if (permissionService && unitId) {
            ensure(new sheets.WorkbookCommentPermission(unitId));
            ensure(new sheets.WorkbookEditablePermission(unitId));
            // Sheet-structure points: without these, the "+" add-sheet button
            // and sheet-tab context-menu actions silently do nothing because
            // Univer's SheetPermissionCheckController blocks the command.
            ensure(new sheets.WorkbookCreateSheetPermission(unitId));
            ensure(new sheets.WorkbookRenameSheetPermission(unitId));
            ensure(new sheets.WorkbookMoveSheetPermission(unitId));
            ensure(new sheets.WorkbookDeleteSheetPermission(unitId));
            ensure(new sheets.WorkbookHideSheetPermission(unitId));
            ensure(new sheets.WorkbookCopySheetPermission(unitId));
            if (subUnitId) {
              ensure(new sheets.WorksheetViewPermission(unitId, subUnitId));
              ensure(new sheets.WorksheetEditPermission(unitId, subUnitId));
            }
          }
          // Neutralise the SheetPermissionCheckController for editors: replace
          // its blockExecuteWithoutPermission with a no-op so a missing
          // workbook/worksheet permission point (e.g. for thread-comment
          // commands) doesn't silently abort the command. Viewers still get
          // blocked by our own BeforeCommandExecute guard above.
          try {
            const controller: any = injector?.get?.(sheets.SheetPermissionCheckController);
            if (controller) {
              controller.blockExecuteWithoutPermission = () => {
                /* no-op for editors/owners */
              };
            }
          } catch {}
        } catch {}
      }

      try {
        const sid = univerAPI.getActiveWorkbook?.()?.getActiveSheet?.()?.getSheetId?.();
        if (sid) setActiveSubUnitId(sid);
      } catch {}

      // Apply read-only mode for viewers (and anyone with no write role).
      if (isViewer) {
        applyReadOnly(univerAPI);
      }

      const snapshotSeq = (row.snapshot_seq as number) ?? 0;
      snapshotBaseSeqRef.current = snapshotSeq;
      contiguousAppliedSeqRef.current = snapshotSeq;
      maxAppliedSeqRef.current = snapshotSeq;

      // --- 3. Replay mutations > snapshot_seq ---
      const { data: missed, error: mErr } = await supabase
        .from("spreadsheet_mutations")
        .select("seq,mutation")
        .eq("spreadsheet_id", id)
        .gt("seq", snapshotSeq)
        .order("seq", { ascending: true });

      if (cancelled) return;
      if (mErr) {
        console.error("Replay fetch failed", mErr);
      } else if (missed) {
        for (const r of missed) {
          await applyMutationRow(r.seq as number, r.mutation as Command, "replay");
        }
      }

      // --- 4. Drain buffer ---
      const buf = liveBufferRef.current
        .slice()
        .sort((a, b) => a.seq - b.seq);
      liveBufferRef.current = [];
      replayReadyRef.current = true;
      for (const msg of buf) {
        await handleLiveMutation(msg);
      }

      // Force formula recalc after loading the snapshot + replaying mutations.
      // The persisted snapshot may have stale cached formula values (v) if the
      // engine hadn't re-evaluated before the save, and Univer does NOT
      // automatically re-evaluate formulas on load. Without this, a cell like
      // B1==A1*2 will display the OLD cached value after reload even when A1
      // has since changed.
      //
      // Bug 2 fix: the formula engine boots ASYNCHRONOUSLY after the workbook
      // is created. A single immediate call almost always fires before it's
      // ready (silent no-op). Retry with backoff until executeCalculation
      // actually exists and returns something usable, then fire one final
      // recompute on the next macrotask to ensure dirty propagation completes.
      const triggerRecalc = async () => {
        for (let attempt = 0; attempt < 30; attempt++) {
          try {
            const f: any = univerAPI.getFormula?.();
            if (f && typeof f.executeCalculation === "function") {
              f.executeCalculation();
              // One more pass after the engine settles (covers cells whose
              // precedents weren't yet marked dirty on the first pass).
              await new Promise((r) => setTimeout(r, 120));
              try { f.executeCalculation(); } catch { /* noop */ }
              return;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
      };
      void triggerRecalc();

      // --- 5. Attach local command listener (skipped for viewers) ---
      if (!isViewer) {
        attachLocalListener(univerAPI);
      } else {
        // Selection events still need to flow so we can broadcast cursor.
        attachSelectionOnlyListener(univerAPI);
      }

      setReady(true);
    }

    function applyReadOnly(univerAPI: any) {
      // Best-effort: try Facade setEditable on workbook.
      try {
        const wb = univerAPI.getActiveWorkbook?.();
        if (wb?.setEditable) {
          wb.setEditable(false);
        }
      } catch {}
      // Safety net: cancel any write-mutation commands before they execute,
      // EXCEPT when we're applying a mutation received from a remote peer.
      try {
        const before = univerAPI.Event?.BeforeCommandExecute;
        if (before && typeof univerAPI.addEvent === "function") {
          univerAPI.addEvent(before, (event: any) => {
            if (isApplyingRemote.current) return;
            const cmd = event?.command ?? event;
            const cid: string | undefined = cmd?.id;
            if (!cid) return;
            if (
              cid.startsWith("sheet.mutation.") ||
              cid.startsWith("sheet.command.") ||
              cid.startsWith("thread-comment.command.") ||
              cid.startsWith("thread-comment.mutation.") ||
              cid === "sheet.operation.set-cell-edit-visible"
            ) {
              try {
                if (typeof event?.preventDefault === "function") event.preventDefault();
                if ("cancel" in (event ?? {})) event.cancel = true;
              } catch {}
              // Throwing is the canonical way to abort a Univer command from
              // BeforeCommandExecute — preventDefault alone is not honoured
              // for every command type (e.g. insert-sheet).
              throw new Error("READONLY_VIEWER");
            }
          });

        }
      } catch {}
    }

    function attachSelectionOnlyListener(univerAPI: any) {
      const onCmd = (cmd: any) => {
        if (!cmd?.id) return;
        if (
          cmd.id === "sheet.operation.set-selections" ||
          cmd.id === "sheet.mutation.set-selections-data"
        ) {
          if (isApplyingRemote.current) return;
          handleLocalSelection(cmd.params);
        }
      };
      try {
        univerAPI.addEvent(univerAPI.Event.CommandExecuted, onCmd);
      } catch {}
    }


    function advanceContiguous() {
      let n = contiguousAppliedSeqRef.current;
      while (appliedSeqsRef.current.has(n + 1)) n++;
      contiguousAppliedSeqRef.current = n;
    }

    // Extract cell-level keys touched by a set-range-values mutation.
    // Returns an empty array for non set-range-values commands; structural
    // mutations (insert-sheet, insert-row, etc.) do NOT participate in the
    // per-cell LWW pathway.
    function cellKeysOf(
      cmd: Command,
    ): Array<{ key: string; r: number; c: number }> {
      if (!cmd || cmd.id !== "sheet.mutation.set-range-values") return [];
      const p: any = cmd.params || {};
      const unitId = p.unitId;
      const subUnitId = p.subUnitId;
      const cv = p.cellValue;
      if (!cv || typeof cv !== "object") return [];
      const out: Array<{ key: string; r: number; c: number }> = [];
      for (const rk of Object.keys(cv)) {
        const row = cv[rk];
        if (!row || typeof row !== "object") continue;
        for (const ck of Object.keys(row)) {
          const r = Number(rk);
          const c = Number(ck);
          out.push({ key: `${unitId}|${subUnitId}|${r}|${c}`, r, c });
        }
      }
      return out;
    }

    async function applyMutationRow(seq: number, command: Command, source: string) {
      const api = univerApiRef.current;
      if (!api || !command || !command.id) return;
      // Dedup is ONLY by per-seq set membership. We do NOT skip "below high
      // water" because a peer's lower seq can legitimately arrive AFTER our
      // own higher-seq local insert assigned it.
      if (appliedSeqsRef.current.has(seq)) return;
      if (seq !== 0 && seq <= snapshotBaseSeqRef.current) {
        // Genuinely covered by the snapshot baseline we loaded — safe to dedup.
        appliedSeqsRef.current.add(seq);
        advanceContiguous();
        return;
      }

      // --- Per-cell LWW guard (Bug 1) ---
      // Only set-range-values participates. We may either defer (a pending
      // local write on the same cell — apply order would race) or skip-as-
      // stale (a remote with seq <= an already-applied higher seq).
      const cells = cellKeysOf(command);
      if (cells.length > 0) {
        // Defer if any touched cell has a pending local write whose seq is
        // not yet known. We must not let this remote land before we resolve
        // our local's seq, or we'd risk applying a "loser" mutation that
        // permanently overwrites our newer local value.
        const hasPending = cells.some((c) => pendingLocalCellsRef.current.has(c.key));
        if (hasPending && source !== "replay") {
          deferredRemotesRef.current.push({ seq, command, source });
          return;
        }
        // Drop a remote whose seq is strictly LOWER than the highest seq
        // already applied to ANY of its touched cells. By the per-cell LWW
        // rule, the higher-seq write wins, and re-applying this older value
        // would resurrect a stale state. (Equal seqs cannot happen — seqs
        // are unique per spreadsheet, assigned by the DB trigger.)
        const losesByCell = cells.some((c) => {
          const max = cellMaxSeqRef.current.get(c.key) ?? 0;
          return seq < max;
        });
        if (losesByCell) {
          appliedSeqsRef.current.add(seq);
          if (seq > maxAppliedSeqRef.current) maxAppliedSeqRef.current = seq;
          advanceContiguous();
          return;
        }
      }

      const sig = commandSig(command);
      recentRemoteSigsRef.current.set(sig, Date.now());
      isApplyingRemote.current = true;
      try {
        const ret = api.executeCommand(command.id, command.params);
        if (ret && typeof ret.then === "function") await ret;
        appliedSeqsRef.current.add(seq);
        if (seq > maxAppliedSeqRef.current) maxAppliedSeqRef.current = seq;
        advanceContiguous();
        // Mark each touched cell with this seq as the new high water.
        for (const c of cells) {
          const prev = cellMaxSeqRef.current.get(c.key) ?? 0;
          if (seq > prev) cellMaxSeqRef.current.set(c.key, seq);
        }
      } catch (err) {
        // Skip-and-continue: one poison mutation must not wedge replay or
        // kill the realtime channel. Mark this seq applied so we don't keep
        // re-trying it on every gap fetch, then surface a subtle sync-issue
        // indicator and move on.
        console.error("apply failed (skipping mutation)", { seq, id: command.id, err });
        appliedSeqsRef.current.add(seq);
        if (seq > maxAppliedSeqRef.current) maxAppliedSeqRef.current = seq;
        advanceContiguous();
        bumpSyncIssue();
      } finally {
        setTimeout(() => {
          isApplyingRemote.current = false;
        }, 50);
      }
    }

    // Drain deferred remotes whose pending-local guard cells have all
    // resolved. Called after persistAndBroadcast settles a local mutation.
    async function drainDeferredRemotes() {
      if (deferredRemotesRef.current.length === 0) return;
      const remaining: typeof deferredRemotesRef.current = [];
      // Sort by seq so per-cell LWW reasoning is consistent.
      const batch = deferredRemotesRef.current.slice().sort((a, b) => a.seq - b.seq);
      deferredRemotesRef.current = [];
      for (const item of batch) {
        const stillPending = cellKeysOf(item.command).some((c) =>
          pendingLocalCellsRef.current.has(c.key),
        );
        if (stillPending) {
          remaining.push(item);
          continue;
        }
        await applyMutationRow(item.seq, item.command, item.source + "-deferred");
      }
      if (remaining.length > 0) {
        deferredRemotesRef.current.push(...remaining);
      }
    }

    // Test-only hook: lets Playwright drive the remote-mutation apply path
    // directly so we can verify per-mutation try/catch survival without
    // depending on cross-tab Realtime broadcast timing.
    (window as any).__testApplyMutation = (cmd: Command, seq: number) =>
      applyMutationRow(seq, cmd, "test");




    async function fetchGap(fromSeq: number, toSeq: number) {
      if (gapFetchInFlightRef.current) {
        await gapFetchInFlightRef.current;
        return;
      }
      const p = (async () => {
        const { data, error } = await supabase
          .from("spreadsheet_mutations")
          .select("seq,mutation")
          .eq("spreadsheet_id", id)
          .gte("seq", fromSeq)
          .lte("seq", toSeq)
          .order("seq", { ascending: true });
        if (error) {
          console.error("gap fetch failed", error);
          return;
        }
        for (const r of data ?? []) {
          await applyMutationRow(r.seq as number, r.mutation as Command, "gap");
        }
      })();
      gapFetchInFlightRef.current = p;
      try {
        await p;
      } finally {
        gapFetchInFlightRef.current = null;
      }
    }

    async function handleLiveMutation(msg: BroadcastMsg) {
      if (appliedSeqsRef.current.has(msg.seq)) return;
      // Use contiguous-applied for gap detection: any seq strictly above
      // contiguous+1 means we're (potentially) missing intermediate seqs.
      // fetchGap is idempotent — applyMutationRow dedupes by seq set so already-
      // applied entries (e.g. our own sends) are no-ops.
      const expected = contiguousAppliedSeqRef.current + 1;
      if (msg.seq > expected) {
        await fetchGap(expected, msg.seq - 1);
      }
      await applyMutationRow(msg.seq, msg.command, "live");
    }

    async function runCatchUp(reason: string) {
      if (catchUpInFlightRef.current) {
        await catchUpInFlightRef.current;
        return;
      }
      const p = (async () => {
        const fromSeq = contiguousAppliedSeqRef.current + 1;
        // Buffer live broadcasts that arrive during the catch-up fetch.
        replayReadyRef.current = false;
        try {
          const { data, error } = await supabase
            .from("spreadsheet_mutations")
            .select("seq,mutation")
            .eq("spreadsheet_id", id)
            .gte("seq", fromSeq)
            .order("seq", { ascending: true });
          if (error) {
            console.error("catchup fetch failed", error);
          } else {
            for (const r of data ?? []) {
              await applyMutationRow(r.seq as number, r.mutation as Command, "catchup");
            }
          }
        } finally {
          // Drain any live broadcasts that landed during catch-up.
          const buf = liveBufferRef.current.slice().sort((a, b) => a.seq - b.seq);
          liveBufferRef.current = [];
          replayReadyRef.current = true;
          for (const msg of buf) {
            await handleLiveMutation(msg);
          }
          if (navigator.onLine !== false) setConnState("connected");
          // Trigger a debounced save so our local edits made while offline
          // get persisted into the snapshot (last-writer-wins).
          if (roleRef.current === "owner") {
            scheduleSave();
          }
        }
      })();
      catchUpInFlightRef.current = p;
      try {
        await p;
      } finally {
        catchUpInFlightRef.current = null;
      }
    }

    async function flushSelection() {
      pendingSelTimerRef.current = null;
      lastSelSentAtRef.current = Date.now();
      const ch = channelRef.current;
      const ident = myIdentityRef.current;
      if (!ch || !ident || !presenceReadyRef.current) {
        return;
      }
      try {
        await ch.track({
          userId: ident.userId,
          email: ident.email,
          name: ident.name,
          color: ident.color,
          clientId: clientIdRef.current,
          selection: currentSelectionRef.current,
        });
      } catch {}
    }

    function handleLocalSelection(params: any) {
      const ident = myIdentityRef.current;
      if (!ident) return;
      const selections = params?.selections;
      const first = Array.isArray(selections) ? selections[0] : undefined;
      const range = first?.range ?? first;
      let subUnitId: string | undefined = params?.subUnitId;
      if (!subUnitId) {
        try {
          subUnitId = univerApiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.()?.getSheetId?.();
        } catch {}
      }
      if (!range || !subUnitId) {
        return;
      }
      const r = {
        startRow: range.startRow ?? 0,
        startColumn: range.startColumn ?? 0,
        endRow: range.endRow ?? range.startRow ?? 0,
        endColumn: range.endColumn ?? range.startColumn ?? 0,
      };
      setActiveSubUnitId((prev) => (prev === subUnitId ? prev : subUnitId!));
      currentSelectionRef.current = { subUnitId, range: r };
      const now = Date.now();
      const since = now - lastSelSentAtRef.current;
      if (since >= SELECTION_THROTTLE_MS) {
        void flushSelection();
      } else if (!pendingSelTimerRef.current) {
        pendingSelTimerRef.current = setTimeout(
          () => { void flushSelection(); },
          SELECTION_THROTTLE_MS - since,
        );
      }
    }



    function attachLocalListener(univerAPI: any) {
      const onCmd = (cmd: any) => {
        if (!cmd?.id) return;

        // Selection changes are OPERATIONs (type 1), not mutations.
        // Broadcast-only — never persisted or logged.
        if (cmd.id === "sheet.operation.set-selections" || cmd.id === "sheet.mutation.set-selections-data") {
          if (isApplyingRemote.current) return;
          handleLocalSelection(cmd.params);
          return;
        }

        if (cmd?.type !== 2) return;
        const isSheetMut = cmd.id.startsWith("sheet.mutation.");
        const isThreadCommentMut = cmd.id.startsWith("thread-comment.mutation.");
        if (!isSheetMut && !isThreadCommentMut) return;

        // Skip local-only mutations (e.g. formula recompute results).
        // Univer marks these with options.onlyLocal / options.fromFormula and
        // they MUST NOT be broadcast: peers compute the value themselves from
        // the formula string. Echoing them back also triggers the formula
        // plugin's _handleSetRangeValuesMutation cleanup which strips 'f'
        // from the cell, freezing formulas into static values.
        const opts: any = (cmd as any).options;
        if (opts && (opts.onlyLocal === true || opts.fromFormula === true)) {
          return;
        }

        const command: Command = { id: cmd.id, params: cmd.params };
        const sig = commandSig(command);

        // NOTE: do NOT bail on isApplyingRemote here. Doing so silently drops
        // any LEGITIMATE local edit that happens to land while a remote apply
        // is in-flight (or in the 50ms tail window), which manifests as lost
        // edits under concurrent multi-user activity. We rely solely on the
        // signature dedup map below to suppress the local-listener echo that
        // fires for the mutation we just applied from the wire.
        if (recentRemoteSigsRef.current.has(sig)) {
          recentRemoteSigsRef.current.delete(sig);
          return;
        }

        // Mark touched cells as pending-local BEFORE persistAndBroadcast so
        // any racing remote that lands before our seq returns is deferred
        // rather than overwriting our local value (Bug 1).
        const localCells = cellKeysOf(command);
        const pendingKeys: string[] = [];
        if (localCells.length > 0) {
          const p: any = command.params || {};
          const cv: any = p.cellValue || {};
          for (const c of localCells) {
            const val = cv[c.r]?.[c.c];
            pendingLocalCellsRef.current.set(c.key, { value: val, ts: Date.now() });
            pendingKeys.push(c.key);
          }
        }
        void persistAndBroadcast(command, pendingKeys);
        scheduleSave();
      };


      try {
        univerAPI.addEvent(univerAPI.Event.CommandExecuted, onCmd);
      } catch (e1) {
        try {
          (univerAPI as any).onCommandExecuted(onCmd);
        } catch (e2) {
          try {
            const wb = (univerAPI as any).getActiveWorkbook?.();
            wb?.onCommandExecuted(onCmd);
          } catch (e3) {
            console.error("Could not bind command listener", e1, e2, e3);
          }
        }
      }
    }

    async function persistAndBroadcast(command: Command, pendingKeys: string[] = []) {
      if (!authorIdRef.current) {
        // Still clear our pending markers so we don't deadlock deferred remotes.
        for (const k of pendingKeys) pendingLocalCellsRef.current.delete(k);
        await drainDeferredRemotes();
        return;
      }
      const { data, error } = await supabase
        .from("spreadsheet_mutations")
        // seq=0 placeholder; trigger overwrites with assigned seq
        .insert({
          spreadsheet_id: id,
          seq: 0,
          author_id: authorIdRef.current,
          mutation: command as any,
        })
        .select("seq")
        .single();
      if (error || !data) {
        console.warn("mutation insert failed", error);
        for (const k of pendingKeys) pendingLocalCellsRef.current.delete(k);
        await drainDeferredRemotes();
        return;
      }
      const seq = data.seq as number;
      appliedSeqsRef.current.add(seq);
      if (seq > maxAppliedSeqRef.current) maxAppliedSeqRef.current = seq;
      advanceContiguous();
      mutationsSinceSnapshotRef.current += 1;
      // Record per-cell high-water for our own local write. This is the
      // authoritative LWW marker so any later-arriving lower-seq remote on
      // the same cell is dropped.
      for (const k of pendingKeys) {
        const prev = cellMaxSeqRef.current.get(k) ?? 0;
        if (seq > prev) cellMaxSeqRef.current.set(k, seq);
        pendingLocalCellsRef.current.delete(k);
      }
      // Single-user workspace: no peers to broadcast to.

      // Now that our seq is known and per-cell markers are set, drain any
      // remotes we deferred while waiting (Bug 1).
      await drainDeferredRemotes();
      // Force a save if too many mutations have accumulated since last snapshot
      if (mutationsSinceSnapshotRef.current >= FORCE_SAVE_AFTER_MUTATIONS) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void doSave();
      }
    }

    init().catch((e) => {
      console.error("init crashed", e);
      if (!cancelled) {
        setLoadError("Couldn't initialize the editor. Please reload the page.");
      }
    });


    const onOnline = () => {
      
      setConnState((s) => (s === "offline" ? "reconnecting" : s));
      // If the channel was already subscribed before the drop, force a
      // catch-up so we don't wait for the next live broadcast.
      if (hasBeenSubscribedRef.current && univerApiRef.current) {
        void runCatchUpExternal();
      }
    };
    const onOffline = () => {
      
      setConnState("offline");
    };
    async function runCatchUpExternal() {
      // Bridge to inner runCatchUp via a small re-implementation that reuses
      // the same refs. Kept here so the online handler can fire it.
      const fromSeq = contiguousAppliedSeqRef.current + 1;
      replayReadyRef.current = false;
      try {
        const { data } = await supabase
          .from("spreadsheet_mutations")
          .select("seq,mutation")
          .eq("spreadsheet_id", id)
          .gte("seq", fromSeq)
          .order("seq", { ascending: true });
        for (const r of data ?? []) {
          await applyMutationRow(r.seq as number, r.mutation as Command, "online-catchup");
        }
      } finally {
        const buf = liveBufferRef.current.slice().sort((a, b) => a.seq - b.seq);
        liveBufferRef.current = [];
        replayReadyRef.current = true;
        for (const msg of buf) await handleLiveMutation(msg);
      }
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (presencePollRef.current) clearInterval(presencePollRef.current);
      presencePollRef.current = null;
      if (dbPollRef.current) clearInterval(dbPollRef.current);
      dbPollRef.current = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (channelRef.current) {
        try {
          channelRef.current.untrack().catch(() => {});
        } catch {}
        try {
          supabase.removeChannel(channelRef.current);
        } catch {}
        channelRef.current = null;
      }
      if (sendChannelRef.current) {
        try { supabase.removeChannel(sendChannelRef.current); } catch {}
        sendChannelRef.current = null;
      }
      setPresent([]);
      setRemoteSelections({});
      setActiveSubUnitId(null);
      if (pendingSelTimerRef.current) clearTimeout(pendingSelTimerRef.current);
      pendingSelTimerRef.current = null;
      currentSelectionRef.current = null;
      presenceReadyRef.current = false;
      hasBeenSubscribedRef.current = false;
      try {
        univerRef.current?.dispose?.();
      } catch {}
      univerRef.current = null;
      univerApiRef.current = null;
      initializedRef.current = false;
      replayReadyRef.current = false;
      liveBufferRef.current = [];
      appliedSeqsRef.current = new Set();
      snapshotBaseSeqRef.current = 0;
      contiguousAppliedSeqRef.current = 0;
      maxAppliedSeqRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadAttempt]);

  function commandSig(c: Command): string {
    try {
      return c.id + ":" + JSON.stringify(c.params);
    } catch {
      return c.id;
    }
  }

  function adaptiveDebounceMs() {
    const b = lastSnapshotBytesRef.current;
    if (b > SNAP_BYTES_HUGE) return SAVE_DEBOUNCE_MS_HUGE;
    if (b > SNAP_BYTES_LARGE) return SAVE_DEBOUNCE_MS_LARGE;
    if (b > SNAP_BYTES_MEDIUM) return SAVE_DEBOUNCE_MS_MEDIUM;
    return SAVE_DEBOUNCE_MS_SMALL;
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void doSave();
    }, adaptiveDebounceMs());
  }

  function scheduleSaveRetry(reason: string) {
    saveAttemptsRef.current += 1;
    const n = saveAttemptsRef.current;
    // Cap at 10 attempts before telling the user to copy their work.
    if (n >= 10) {
      setStatus("error-permanent");
      return;
    }
    // Exponential backoff: 2s, 4s, 8s, ... capped at 60s.
    const delay = Math.min(60_000, 2_000 * Math.pow(2, n - 1));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void doSave(); }, delay);
  }

  async function doSave() {
    if (accessRevokedRef.current) return;
    const api = univerApiRef.current;
    if (!api) return;
    setStatus("saving");
    try {
      const wb = api.getActiveWorkbook?.();
      if (!wb) { setStatus("saved"); return; }
      const snapshot = await wb.save();
      if (!snapshot) { setStatus("saved"); return; }

      // Advertise snapshot_seq as the highest CONTIGUOUS seq applied. The
      // workbook may also reflect some seqs above contiguous (peer mutations
      // applied past a gap), but we conservatively claim coverage only up to
      // the contiguous mark so late-joiners' replay path will refetch any
      // missing intermediate seqs from the mutation log.
      const snapshotSeq = contiguousAppliedSeqRef.current;
      const { error: upErr } = await supabase
        .from("spreadsheets")
        .update({
          snapshot,
          snapshot_seq: snapshotSeq,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (upErr) {
        console.error("Save failed", upErr);
        if (isAuthOrRlsError(upErr)) {
          accessRevokedRef.current = true;
          setStatus("access-revoked");
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = null;
          return;
        }
        setStatus("error");
        scheduleSaveRetry("update-error");
        return;
      }
      saveAttemptsRef.current = 0;
      mutationsSinceSnapshotRef.current = 0;
      // Advance snapshot baseline so future apply-rows for seqs <= snapshotSeq
      // can be deduped without re-executing.
      if (snapshotSeq > snapshotBaseSeqRef.current) {
        snapshotBaseSeqRef.current = snapshotSeq;
      }
      try {
        lastSnapshotBytesRef.current = JSON.stringify(snapshot).length;
      } catch {
        lastSnapshotBytesRef.current = 0;
      }
      setStatus("saved");

      // Compaction: drop mutations strictly older than (snapshot_seq - K).
      const pruneBelow = snapshotSeq - PRUNE_TAIL_K;
      if (pruneBelow > 0) {
        try {
          const { error: delErr, count } = await supabase
            .from("spreadsheet_mutations")
            .delete({ count: "exact" })
            .eq("spreadsheet_id", id)
            .lte("seq", pruneBelow);
          if (delErr) {
            console.warn("prune failed (non-fatal)", delErr);
          } else {
          }
        } catch (pruneErr) {
          console.warn("prune threw (non-fatal)", pruneErr);
        }
      }
    } catch (e) {
      console.error(e);
      if (isAuthOrRlsError(e)) {
        accessRevokedRef.current = true;
        setStatus("access-revoked");
        return;
      }
      setStatus("error");
      scheduleSaveRetry("throw");
    }
  }


  async function commitTitle(newTitle: string) {
    const t = newTitle.trim() || "Untitled spreadsheet";
    setEditingTitle(false);
    if (t === title) return;
    setTitle(t);
    const { error } = await supabase.from("spreadsheets").update({ title: t }).eq("id", id);
    if (error) {
      console.warn("title update failed", error);
      return;
    }
    // Single-user workspace: no peers to broadcast the rename to.
  }

  // Keep browser tab title in sync with the sheet title.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.title;
    document.title = `${title} — Sheets`;
    return () => { document.title = prev; };
  }, [title]);


  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }


  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">Spreadsheet not found</p>
          <Button asChild variant="link">
            <a href="/">Back to My Sheets</a>
          </Button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        data-testid="load-error"
      >
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Couldn't open this spreadsheet</h1>
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {loadError}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              data-testid="load-error-retry"
              onClick={() => {
                // Re-run init() by remounting the effect path.
                initializedRef.current = false;
                setLoadError(null);
                setLoadAttempt((n) => n + 1);
              }}
            >
              Retry
            </Button>
            <Button asChild variant="ghost">
              <a href="/sheets">Back to home</a>
            </Button>

          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="h-dvh w-full max-w-full overflow-x-hidden flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b bg-background px-2 py-2 sm:px-4 lg:px-6 shrink-0">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <Button asChild variant="ghost" size="sm" className="shrink-0 min-h-11 min-w-11 px-0">

            <a href="/sheets" aria-label="Back to my sheets">
              <ArrowLeft className="h-4 w-4" />
            </a>
          </Button>

          {role !== "owner" ? (
            <span
              data-testid="sheet-title"
              className="text-base font-medium px-2 py-1 min-w-0 truncate"
            >
              {title}
            </span>
          ) : editingTitle ? (
            <input
              ref={titleInputRef}
              autoFocus
              data-testid="sheet-title-input"
              aria-label="Spreadsheet title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={(e) => commitTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingTitle(false);
                }
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-muted border-0 outline-none text-base font-medium px-2 py-1 rounded min-w-0 flex-1"
            />
          ) : (
            <button
              type="button"
              data-testid="sheet-title"
              onClick={() => {
                setTitleDraft(title);
                setEditingTitle(true);
              }}
              className="bg-transparent border-0 text-base font-medium px-2 py-1 rounded hover:bg-muted text-left truncate min-w-0 cursor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Rename"
              aria-label={`Spreadsheet title: ${title}. Click to rename.`}
            >
              {title}
            </button>
          )}
          <span
            role="status"
            aria-live="polite"
            data-testid="save-status"
            data-status={status}
            className="hidden md:inline text-xs text-muted-foreground ml-2 whitespace-nowrap"
          >
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "All changes saved"
                : status === "error"
                  ? "Couldn't save — retrying"
                  : status === "error-permanent"
                    ? "Save failed — please copy your work"
                    : status === "access-revoked"
                      ? "Access changed — saving disabled"
                      : ""}
          </span>
          {/* Mobile-only compact save status (icon-less, screen-reader friendly) */}
          <span
            role="status"
            aria-live="polite"
            data-testid="save-status-compact"
            className="md:hidden text-xs text-muted-foreground ml-1 whitespace-nowrap"
          >
            {status === "saving"
              ? "Saving…"
              : status === "error" || status === "error-permanent"
                ? "Save failed"
                : status === "access-revoked"
                  ? "Read-only"
                  : ""}
          </span>
          {role !== "owner" && (
            <span
              data-testid="view-only-badge"
              className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
            >
              View only
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <ConnectionStatus state={connState} />
          {present.length > 0 && (
            <div className="hidden sm:flex">
              <PresenceAvatars users={present} />
            </div>
          )}


          {/* Full toolbar on sm+ */}
          <div className="hidden sm:flex items-center gap-2">
            <ImportExportMenu
              getUniverApi={() => univerApiRef.current}
              title={title}
              canEdit={role === "owner"}
            />
            
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>

          {/* Overflow menu on mobile */}
          <input
            ref={mobileImportInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) ioHandlers.handleFile(f);
              e.target.value = "";
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden min-h-11 min-w-11"
                aria-label="More actions"
                data-testid="header-overflow"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              
              <DropdownMenuItem
                onSelect={() => ioHandlers.exportCsv()}
                data-testid="overflow-export-csv"
              >
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => ioHandlers.exportXlsx()}
                data-testid="overflow-export-xlsx"
              >
                <Download className="h-4 w-4 mr-2" /> Download XLSX
              </DropdownMenuItem>
              {role === "owner" && (
                <DropdownMenuItem
                  onSelect={() => mobileImportInputRef.current?.click()}
                  data-testid="overflow-import"
                >
                  <Upload className="h-4 w-4 mr-2" /> Import file…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} data-testid="overflow-sign-out">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>
      <div className="flex-1 min-h-0 w-full relative">
        <div ref={containerRef} className="absolute inset-0" />
        <RemoteCursors
          selections={Object.values(remoteSelections)}
          activeSubUnitId={activeSubUnitId}
        />
      </div>
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm text-sm text-muted-foreground"
          data-testid="editor-loading"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-primary animate-pulse" />
            Loading spreadsheet…
          </div>
        </div>
      )}
    </div>
  );
}
