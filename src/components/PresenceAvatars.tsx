import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PresentUser = {
  userId: string;
  name: string;
  email: string;
  color: string;
  tabCount: number;
};

export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return trimmed.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MAX_VISIBLE = 5;

export function PresenceAvatars({ users }: { users: PresentUser[] }) {
  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - visible.length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center -space-x-2" data-testid="presence-avatars">
        {visible.map((u) => (
          <Tooltip key={u.userId}>
            <TooltipTrigger asChild>
              <div
                className="relative h-7 w-7 rounded-full ring-2 ring-background flex items-center justify-center text-[11px] font-semibold text-white select-none shadow-sm"
                style={{ backgroundColor: u.color }}
                aria-label={u.name}
                data-testid="presence-avatar"
              >

                {initialsFor(u.name)}
                {u.tabCount > 1 && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-background text-[8px] leading-3 text-foreground font-bold flex items-center justify-center ring-1 ring-border">
                    {u.tabCount}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="text-xs">
                {u.email || u.name}
                {u.tabCount > 1 ? ` (${u.tabCount} tabs)` : ""}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <div className="relative h-7 w-7 rounded-full ring-2 ring-background flex items-center justify-center text-[11px] font-semibold bg-muted text-foreground shadow-sm">
            +{overflow}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
