---
name: template-page-content
description: Generate a precise template-page-content markdown file for the current project, following the exact Lovable templates page content structure (SEO metadata, breadcrumb, title, subtitle, key highlights, about, 7-step getting started, conclusion, who this is for, best use cases, features & capabilities). Use when the user asks for template page content, marketplace listing copy, or a templates.lovable.dev-style description of this project.
---

# Template page content generator

Produce a single markdown file describing the current project, matching the exact section order, headings, and tone of the reference format in `assets/format-example.md`.

## Process

1. Read `assets/format-example.md` to internalize the exact structure.
2. Investigate the actual project to ground every claim in real features:
   - Read `src/routes/` to map pages/sections.
   - Read `src/components/` (especially landing + app subfolders) for features.
   - Read `src/data/types.ts` and `src/data/mock-data.ts` (if present) for the entity model.
   - Check `package.json` for stack hints.
   - Look at any README or project knowledge file.
   Do NOT invent features that don't exist in the codebase.
3. Get the Lovable project ID from the system context (the `<cloud-project-info>` block contains it) and use it for the project link. If unknown, omit the link line.
4. Write the output file to `/mnt/documents/<ProjectName>-template-content.md`. Pick `<ProjectName>` from the app's actual brand (e.g. `Logo.tsx`, landing hero, or package.json).
5. Emit a `<presentation-artifact>` tag so the user can download it.

## Required structure (in this exact order)

Follow `assets/format-example.md` literally. Every section below is mandatory and separated by `---`:

1. `# <emoji> <Template title> – <Tagline>` — H1 with one fitting emoji, using the short template title from the naming rules below
2. `Link to project: [https://lovable.dev/projects/<id>](https://lovable.dev/projects/<id>)`
3. `## SEO metadata` — **Meta title** (≤60 chars, ends with "Template | Lovable") and **Meta description** (≤160 chars)
4. `## Breadcrumb` — `Templates > <Category> > <Subcategory>`
5. `## Title` — the short, descriptive template title (see "Template title naming" below)
6. `## Subtitle` — one-line value prop
7. `## Key highlights` — exactly 6 `### `-level headings, each a short feature name with no body text
8. `## About this template` — 3–4 short paragraphs covering what it is, what's included, and the access/auth model
9. `## Getting started` — exactly 7 `### Step N:` subsections:
    - Step 1: Remix this template
    - **Step 2: Familiarize yourself with the project** — use this exact body: "Go to User > Settings > Knowledge, and read what's under \"Project knowledge\" to understand the intended architecture and access control model. You can also ask Lovable in the chat for more details."
    - Step 3: Customize your brand
    - Step 4: Add your <project-specific content>
    - Step 5: Invite your team (or project-appropriate equivalent)
    - Step 6: Go live
    - Step 7: Iterate and make it yours
10. `## Conclusion` — one paragraph summarizing who it's for and the payoff
11. `## Who this is for` — 4 bulleted personas
12. `## Best use cases` — 4 `### `-level use cases, each with a short paragraph
13. `## Features & capabilities` — opens with a one-line intro paragraph, then 10–14 `### `-level features, each with a one-line description. Every feature must map to something that actually exists in the codebase.

## Template title naming

The title must be short and descriptive of what the app *is*, matching the naming convention on lovable.dev/templates. Real examples: "Finance Dashboard", "Team Docs", "Mortgage Calculator", "Bakery Order Page", "Sales Roleplay Trainer", "Dark Creative Portfolio", "AI Moodboard Canvas".

Rules:
- 2–4 words, max ~28 characters.
- Describe the category/function, not the brand. Never use the project's invented brand name (no "SyncSheets", "Budget Pulse", "Talently") in the title, H1, or meta title.
- Title Case, no punctuation, no taglines, no "for teams"/"platform"/"solution" filler.
- A generic newcomer should understand what it does from the title alone.
- Use the same short title consistently in the H1, `## Title`, and the meta title (`<Template title> Template | Lovable`).
- The subtitle carries the distinctive detail (e.g. "Live amortization with PMI drop-off"), not the title.
- The output filename still uses the app's brand: `/mnt/documents/<ProjectName>-template-content.md`.

## Style rules

- Sentence case for all headings.
- No emoji beyond the H1. No stacked superlatives.
- Tight paragraphs (2–4 sentences).
- Don't mention Supabase, edge functions, or implementation internals — speak in product terms ("authentication", "database", "real-time updates").
- If the project uses mock/in-memory data only, describe features as they appear in the UI without claiming persistence.

## Output

After writing the file, respond with one short sentence and the artifact tag:

```
<presentation-artifact path="<ProjectName>-template-content.md" mime_type="text/markdown"></presentation-artifact>
```
