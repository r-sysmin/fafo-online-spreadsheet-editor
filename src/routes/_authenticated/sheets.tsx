import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  FileSpreadsheet,
  LogOut,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  ExternalLink,
  Search,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { TemplateGalleryDialog } from "@/components/TemplateGalleryDialog";
import { SheetMiniPreview } from "@/components/SheetMiniPreview";
import { SPREADSHEET_TEMPLATES, type SpreadsheetTemplate } from "@/lib/templates";
import type { WorkbookData } from "@/lib/templates/types";
import { createSheetFromTemplate } from "@/lib/templates/createFromTemplate";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sheets")({
  component: SheetsHome,
});

type Role = "owner";
type Sheet = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  role: Role;
  owner_id: string;
  owner_email: string | null;
};

type SortKey = "updated" | "title" | "created";
type ViewMode = "list" | "grid";

const VIEW_STORAGE_KEY = "syncsheets.sheetsView";

// Session-scoped cache of per-sheet Univer snapshots for grid thumbnails.
// The list RPC intentionally does NOT return snapshots (they can be large);
// we fetch on-demand when a card scrolls into view and hold it for the tab
// lifetime so re-scrolls / view toggles don't refetch.
const snapshotCache = new Map<string, WorkbookData | null>();
const inFlight = new Map<string, Promise<WorkbookData | null>>();

async function fetchSnapshot(id: string): Promise<WorkbookData | null> {
  if (snapshotCache.has(id)) return snapshotCache.get(id) ?? null;
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = (async () => {
    const { data, error } = await supabase
      .from("spreadsheets")
      .select("snapshot")
      .eq("id", id)
      .maybeSingle();
    const snap = error ? null : ((data?.snapshot as WorkbookData | null) ?? null);
    snapshotCache.set(id, snap);
    inFlight.delete(id);
    return snap;
  })();
  inFlight.set(id, p);
  return p;
}

function loadInitialView(): ViewMode {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "grid" ? "grid" : "list";
}


type GroupKey = "today" | "week" | "month" | "earlier";
const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  week: "Previous 7 days",
  month: "Previous 30 days",
  earlier: "Earlier",
};
const GROUP_ORDER: GroupKey[] = ["today", "week", "month", "earlier"];

function groupOf(iso: string): GroupKey {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const dayMs = 86_400_000;
  const diff = now - then;
  if (diff < dayMs) return "today";
  if (diff < 7 * dayMs) return "week";
  if (diff < 30 * dayMs) return "month";
  return "earlier";
}

function SheetsHome() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>(loadInitialView);
  const [renameSheet, setRenameSheet] = useState<Sheet | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteSheet, setDeleteSheet] = useState<Sheet | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Build each template's real snapshot ONCE for the preview tiles. The unit
  // id doesn't matter for preview rendering — we just need the cell content.
  const templateTiles = useMemo(
    () =>
      SPREADSHEET_TEMPLATES.filter((t) => t.id !== "blank-with-header").map((t) => ({
        id: t.id,
        name: t.name,
        template: t,
        data: t.build("preview") as WorkbookData,
      })),
    [],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* storage unavailable — ignore */
    }
  }, [view]);

  async function load() {
    const { data, error } = await supabase.rpc("list_my_sheets");
    if (error) {
      console.error(error);
      setSheets([]);
      return;
    }
    setSheets((data as Sheet[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (!sheets) return null;
    const q = query.trim().toLowerCase();
    let filtered = q ? sheets.filter((s) => s.title.toLowerCase().includes(q)) : sheets.slice();
    filtered.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "created") return +new Date(b.created_at) - +new Date(a.created_at);
      return +new Date(b.updated_at) - +new Date(a.updated_at);
    });
    return filtered;
  }, [sheets, query, sort]);

  // For A–Z sort we skip date grouping and show one flat alphabetical list.
  const groupedVisible = useMemo(() => {
    if (!visible) return null;
    if (sort === "title") return null;
    const groups: Record<GroupKey, Sheet[]> = { today: [], week: [], month: [], earlier: [] };
    for (const s of visible) groups[groupOf(s.updated_at)].push(s);
    return groups;
  }, [visible, sort]);

  async function createSheet() {
    setCreating(true);
    const { data, error } = await supabase
      .from("spreadsheets")
      .insert({ owner_id: user.id, title: "Untitled spreadsheet" })
      .select("id")
      .single();
    setCreating(false);
    if (error) {
      console.error("create spreadsheet failed", error);
      toast.error("Couldn't create spreadsheet");
      return;
    }
    toast.success("Spreadsheet created");
    navigate({ to: "/sheet/$id", params: { id: data.id } });
  }

  async function createFromTemplate(t: SpreadsheetTemplate) {
    setCreatingTemplateId(t.id);
    try {
      const id = await createSheetFromTemplate(t, user.id);
      if (!id) return;
      navigate({ to: "/sheet/$id", params: { id } });
    } finally {
      setCreatingTemplateId(null);
    }
  }

  async function commitRename() {
    if (!renameSheet) return;
    const title = renameValue.trim() || "Untitled spreadsheet";
    const id = renameSheet.id;
    setRenameSheet(null);
    setSheets((prev) => prev?.map((s) => (s.id === id ? { ...s, title } : s)) ?? prev);
    const { error } = await supabase.from("spreadsheets").update({ title }).eq("id", id);
    if (error) {
      console.error("rename spreadsheet failed", error);
      toast.error("Couldn't rename");
      load();
      return;
    }
    toast.success("Renamed");
  }

  async function duplicate(s: Sheet) {
    const { data: src, error: srcErr } = await supabase
      .from("spreadsheets")
      .select("snapshot")
      .eq("id", s.id)
      .maybeSingle();
    if (srcErr) {
      console.error("duplicate: read source failed", srcErr);
      toast.error("Couldn't duplicate");
      return;
    }
    const { data, error } = await supabase
      .from("spreadsheets")
      .insert({
        owner_id: user.id,
        title: `Copy of ${s.title}`,
        snapshot: src?.snapshot ?? null,
      })
      .select("id,title,updated_at,created_at,owner_id")
      .single();
    if (error) {
      console.error("duplicate spreadsheet failed", error);
      toast.error("Couldn't duplicate");
      return;
    }
    toast.success("Duplicated");
    setSheets((prev) => [
      {
        id: data.id,
        title: data.title,
        updated_at: data.updated_at,
        created_at: data.created_at,
        owner_id: data.owner_id,
        owner_email: user.email ?? null,
        role: "owner",
      },
      ...(prev ?? []),
    ]);
  }

  async function confirmDelete() {
    if (!deleteSheet) return;
    const id = deleteSheet.id;
    setDeleteSheet(null);
    const prev = sheets;
    setSheets((cur) => cur?.filter((s) => s.id !== id) ?? cur);
    const { error } = await supabase.from("spreadsheets").delete().eq("id", id);
    if (error) {
      console.error("delete spreadsheet failed", error);
      toast.error("Couldn't delete");
      setSheets(prev);
      return;
    }
    toast.success("Deleted");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const rowHandlers = {
    onRename: (s: Sheet) => {
      setRenameValue(s.title);
      setRenameSheet(s);
    },
    onDuplicate: (s: Sheet) => duplicate(s),
    onDelete: (s: Sheet) => setDeleteSheet(s),
  };

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:max-w-6xl sm:justify-between sm:px-6 sm:py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="truncate text-lg font-semibold">My Sheets</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              aria-label="Sign out"
              className="min-h-11"
            >
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Template strip */}
        <section
          className="mb-8"
          data-testid="template-strip"
          aria-labelledby="template-strip-heading"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2
              id="template-strip-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Start a new spreadsheet
            </h2>
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary hover:underline"
              data-testid="open-template-gallery"
            >
              Template gallery
            </button>

          </div>
          <div className="relative -mx-1 overflow-x-auto pb-2">
            <ul className="flex gap-3 px-1">
              <li>
                <TemplateTile
                  name="Blank spreadsheet"
                  data={null}
                  onClick={createSheet}
                  disabled={creating}
                  testid="template-tile-blank"
                  isBlank
                />
              </li>
              {templateTiles.map((t) => (
                <li key={t.id}>
                  <TemplateTile
                    name={t.name}
                    data={t.data}
                    onClick={() => createFromTemplate(t.template)}
                    disabled={creatingTemplateId !== null}
                    testid="template-tile"
                    templateId={t.id}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative w-full min-w-[200px] sm:w-auto sm:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title"
              className="h-11 min-h-11 w-full pl-8"
              aria-label="Search spreadsheets"
              data-testid="search-input"
            />
          </div>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger
              className="h-11 min-h-11 flex-1 sm:w-[170px] sm:flex-none"
              aria-label="Sort"
              data-testid="sort-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Last modified</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
              <SelectItem value="created">Recently created</SelectItem>
            </SelectContent>
          </Select>
          <div
            className="inline-flex shrink-0 overflow-hidden rounded-md border bg-background"
            role="group"
            aria-label="View mode"
            data-testid="view-toggle"
          >
            <button
              type="button"
              className={cn(
                "flex h-11 w-11 items-center justify-center transition",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              data-testid="view-list"
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-11 w-11 items-center justify-center border-l transition",
                view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              data-testid="view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

        </div>

        {/* Content */}
        {sheets === null ? (
          <LoadingSkeleton view={view} />
        ) : sheets.length === 0 ? (
          <div
            className="rounded-lg border border-dashed bg-background p-8 text-center sm:p-12"
            data-testid="empty-state"
          >
            <h3 className="text-base font-semibold">No spreadsheets yet</h3>
            <p className="mx-auto mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
              Start with a blank sheet — formulas and formatting included.
            </p>
            <Button
              onClick={createSheet}
              disabled={creating}
              className="mt-5 min-h-11 w-full sm:w-auto"
              data-testid="empty-create-cta"
            >
              <Plus className="mr-1 h-4 w-4" /> Create your first spreadsheet
            </Button>
          </div>

        ) : visible && visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spreadsheets match your filters.</p>
        ) : view === "list" ? (
          <ListContent
            groups={groupedVisible}
            flat={sort === "title" ? visible! : null}
            userId={user.id}
            handlers={rowHandlers}
          />
        ) : (
          <GridContent
            groups={groupedVisible}
            flat={sort === "title" ? visible! : null}
            userId={user.id}
            handlers={rowHandlers}
          />
        )}
      </main>

      <TemplateGalleryDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        ownerId={user.id}
      />

      <Dialog open={!!renameSheet} onOpenChange={(o) => !o && setRenameSheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename spreadsheet</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitRename();
            }}
          >
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              aria-label="Spreadsheet title"
              className="h-11 min-h-11 w-full"
              data-testid="rename-input"
            />
            <DialogFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenameSheet(null)}
                className="min-h-11 w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-11 w-full sm:w-auto"
                data-testid="rename-submit"
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSheet} onOpenChange={(o) => !o && setDeleteSheet(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteSheet?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the spreadsheet and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <AlertDialogCancel className="mt-0 min-h-11 w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="min-h-11 w-full sm:w-auto"
              data-testid="delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>

        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --------------------------------- Content -------------------------------- */

type RowHandlers = {
  onRename: (s: Sheet) => void;
  onDuplicate: (s: Sheet) => void;
  onDelete: (s: Sheet) => void;
};

function ListContent({
  groups,
  flat,
  userId,
  handlers,
}: {
  groups: Record<GroupKey, Sheet[]> | null;
  flat: Sheet[] | null;
  userId: string;
  handlers: RowHandlers;
}) {
  return (
    <div className="rounded-lg border bg-background" data-testid="sheet-list">
      {/* Column header (hidden on mobile) */}
      <div className="hidden grid-cols-[minmax(0,1fr)_160px_44px] items-center gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <div>Name</div>
        <div>Last modified</div>
        <div />
      </div>
      {flat ? (
        <ul role="list">
          {flat.map((s) => (
            <SheetRow key={s.id} s={s} userId={userId} handlers={handlers} />
          ))}
        </ul>
      ) : (
        groups &&
        GROUP_ORDER.filter((k) => groups[k].length > 0).map((k) => (
          <div key={k}>
            <div className="border-b bg-muted/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {GROUP_LABEL[k]}
            </div>
            <ul role="list">
              {groups[k].map((s) => (
                <SheetRow key={s.id} s={s} userId={userId} handlers={handlers} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function SheetRow({ s, userId, handlers }: { s: Sheet; userId: string; handlers: RowHandlers }) {
  return (
    <li
      className="group grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3 border-b px-4 py-2 last:border-b-0 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_160px_44px]"
      data-testid="list-row"
      data-sheet-id={s.id}
    >
      <Link
        to="/sheet/$id"
        params={{ id: s.id }}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${s.title}`}
      >
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate font-medium" data-testid="sheet-title">
          {s.title}
        </span>
      </Link>
      <div className="hidden truncate text-sm text-muted-foreground sm:block">
        {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
      </div>
      <div className="justify-self-end">
        <SheetActions
          sheet={s}
          onRename={() => handlers.onRename(s)}
          onDuplicate={() => handlers.onDuplicate(s)}
          onDelete={() => handlers.onDelete(s)}
        />
      </div>
    </li>
  );
}

function GridContent({
  groups,
  flat,
  userId,
  handlers,
}: {
  groups: Record<GroupKey, Sheet[]> | null;
  flat: Sheet[] | null;
  userId: string;
  handlers: RowHandlers;
}) {
  const renderCards = (arr: Sheet[]) => (
    <ul
      className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3"
      role="list"
      data-testid="sheet-grid"
    >
      {arr.map((s) => (
        <SheetCard key={s.id} s={s} userId={userId} handlers={handlers} />
      ))}
    </ul>
  );

  if (flat) return renderCards(flat);
  if (!groups) return null;
  return (
    <div className="space-y-6">
      {GROUP_ORDER.filter((k) => groups[k].length > 0).map((k) => (
        <div key={k}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {GROUP_LABEL[k]}
          </div>
          {renderCards(groups[k])}
        </div>
      ))}
    </div>
  );
}

function SheetCard({ s, userId, handlers }: { s: Sheet; userId: string; handlers: RowHandlers }) {
  const { ref: thumbRef, snapshot, loaded } = useLazySnapshot(s.id);
  return (
    <li
      className="group relative flex flex-col overflow-hidden rounded-lg border bg-background transition hover:shadow-md"
      data-testid="sheet-card"
      data-sheet-id={s.id}
    >
      <Link
        to="/sheet/$id"
        params={{ id: s.id }}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${s.title}`}
      >
        <div
          ref={thumbRef}
          className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-b bg-muted/20 p-2"
          data-testid="sheet-thumbnail"
        >
          {loaded && snapshot ? (
            <div className="h-full w-full overflow-hidden rounded-md border bg-background shadow-sm">
              <SheetMiniPreview data={snapshot} />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileSpreadsheet
                className={cn("h-8 w-8 text-muted-foreground/40", !loaded && "animate-pulse")}
              />
            </div>
          )}
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2 p-3">
        <Link
          to="/sheet/$id"
          params={{ id: s.id }}
          className="min-w-0 flex-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${s.title}`}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate font-medium" data-testid="sheet-title">
              {s.title}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
            </span>
          </div>
        </Link>
        <SheetActions
          sheet={s}
          onRename={() => handlers.onRename(s)}
          onDuplicate={() => handlers.onDuplicate(s)}
          onDelete={() => handlers.onDelete(s)}
        />
      </div>
    </li>
  );
}

/**
 * Lazy-loads a sheet's snapshot when the referenced element scrolls into view,
 * memoizes it in the session cache, and returns it for rendering. Falls back
 * to eager fetch when IntersectionObserver isn't available (e.g. jsdom).
 */
function useLazySnapshot(id: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<WorkbookData | null>(
    () => snapshotCache.get(id) ?? null,
  );
  const [loaded, setLoaded] = useState<boolean>(() => snapshotCache.has(id));

  useEffect(() => {
    if (snapshotCache.has(id)) {
      setSnapshot(snapshotCache.get(id) ?? null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const run = () => {
      fetchSnapshot(id).then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        setLoaded(true);
      });
    };
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      run();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.disconnect();
            run();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [id]);

  return { ref, snapshot, loaded };
}

/* -------------------------------- Template tile ------------------------------- */

function TemplateTile({
  name,
  data,
  onClick,
  disabled,
  isBlank,
  testid,
  templateId,
}: {
  name: string;
  data: WorkbookData | null;
  onClick: () => void;
  disabled?: boolean;
  isBlank?: boolean;
  testid: string;
  templateId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      data-template-id={templateId}
      className="group flex w-[168px] shrink-0 flex-col items-stretch gap-2 rounded-lg border bg-background p-2 text-left transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={`Create ${name}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-background">
        {isBlank ? (
          <>
            <SheetMiniPreview data={emptySnapshot} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/50 bg-background/80 text-muted-foreground">
                <Plus className="h-4 w-4" />
              </div>
            </div>
          </>
        ) : (
          <SheetMiniPreview data={data} />
        )}
      </div>
      <div className="truncate px-1 pb-1 text-xs font-medium">{name}</div>
    </button>
  );
}

// Reused as the "empty grid" backdrop for the Blank tile — no cells, so the
// mini preview just draws faint gridlines.
const emptySnapshot: WorkbookData = {
  sheetOrder: ["s"],
  styles: {},
  sheets: { s: { cellData: {} } },
};

/* ------------------------------- Skeleton ------------------------------- */

function LoadingSkeleton({ view }: { view: ViewMode }) {
  if (view === "list") {
    return (
      <div
        className="rounded-lg border bg-background"
        aria-label="Loading spreadsheets"
        data-testid="sheets-skeleton"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_160px_44px] items-center gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul
      className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3"
      aria-label="Loading spreadsheets"
      data-testid="sheets-skeleton"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

function SheetActions({
  sheet,
  onRename,
  onDuplicate,
  onDelete,
}: {
  sheet: Sheet;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const canRename = sheet.role === "owner" || sheet.role === "editor";
  const canDelete = sheet.role === "owner";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 opacity-60 hover:opacity-100"
          aria-label={`Actions for ${sheet.title}`}
          data-testid="sheet-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canRename && (
          <DropdownMenuItem onSelect={onRename} data-testid="action-rename">
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDuplicate} data-testid="action-duplicate">
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => window.open(`/sheet/${sheet.id}`, "_blank", "noopener")}
          data-testid="action-open-new-tab"
        >
          <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
              data-testid="action-delete"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
