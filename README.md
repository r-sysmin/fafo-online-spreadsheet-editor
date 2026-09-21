# SyncSheets

A collaborative spreadsheet built on the open-source Univer engine, with real-time multi-user editing, sharing/RBAC, comments, CSV/XLSX import-export, and Supabase-backed persistence.

Live: <https://syncsheets.lovable.app>

## Architecture

- **Editor**: [Univer](https://github.com/dream-num/univer) OSS presets (`@univerjs/presets`, Apache-2.0).
- **Sync**: mutation-broadcast engine over Supabase Realtime with monotonic server-assigned sequences, per-cell last-writer-wins convergence, and late-joiner replay.
- **Persistence**: workbook snapshot + mutation log in Postgres with adaptive debounce (2s → 30s by snapshot size) and periodic compaction.
- **Auth & storage**: Supabase (Postgres, Auth, Realtime) with Row Level Security.

## Development

```sh
bun install
bun run dev
```

## License & attribution

- **Our code** in this repository is released under the [Zero-Clause BSD (0BSD)](./LICENSE) license. No attribution is required to use, modify, or redistribute it.
- **Third-party dependencies** keep their own licenses. A complete inventory, plus the full attribution / NOTICE texts required by Apache-2.0, MIT, ISC, and the other licenses present in the dependency tree, is in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
- **Vendored components**: `src/components/ui/*` is adapted from [shadcn/ui](https://github.com/shadcn-ui/ui) (MIT, Copyright (c) 2023 shadcn).
- **Lovable proprietary**: the `@lovable.dev/*` packages used here are proprietary to Lovable and not covered by the 0BSD license above.
