---
title: Diffs
description: Show what changed between two versions of a snippet, from a quick colored diff block to a full interactive viewer with word-level highlights, move detection, and shareable lines.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/diffs
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 7m

  status: stable

  aliases: [diffs, code diff, before and after, diff viewer, changed lines]

  prev: ./code-blocks.md
  next: ./callouts.md
---

# Diffs

!!! info "In one line"
    A `diff` block colors pasted diff output; `!!! diff` around two fences computes the diff for you and gives readers an interactive viewer.

Half of technical writing is "change this line to that." docolin gives you two ways to show it: a quick static block when you already have diff output, and a computed before/after viewer when you have the two versions.

## The quick way: a `diff` block

A fenced block with the `diff` language colors removals red and additions green. Start context lines with a space, removals with `-`, additions with `+`, the same format `git diff` prints.

````md
```diff
 export function feedPango(p: Pangolin, ants: number): Pangolin {
-  return { ...p, rolledUp: ants > 5000 };
+  // pangolins curl up a little sooner after a big meal
+  return { ...p, rolledUp: ants > 3000 };
 }
```
````

!!! output "Rendered"
    ```diff
     export function feedPango(p: Pangolin, ants: number): Pangolin {
    -  return { ...p, rolledUp: ants > 5000 };
    +  // pangolins curl up a little sooner after a big meal
    +  return { ...p, rolledUp: ants > 3000 };
     }
    ```

This is plain highlighting: fast, dependable, and exactly what you pasted. For anything richer, let docolin compute the diff itself.

## The full way: `!!! diff`

Wrap **two fenced code blocks**, the before and the after, in a `!!! diff` admonition. The title becomes the viewer's filename bar; give both fences the same language so the code keeps its syntax colors inside the diff.

````md
!!! diff "feed-pango.ts"
    ```ts
    export function feedPango(p: Pangolin, ants: number): Pangolin {
      return { ...p, rolledUp: ants > 5000 };
    }
    ```

    ```ts
    export function feedPango(p: Pangolin, ants: number): Pangolin {
      // curl up a little sooner after a big meal
      return { ...p, rolledUp: ants > 3000 };
    }
    ```
````

!!! output "Rendered"
    !!! diff "feed-pango.ts"
        ```ts
        export function feedPango(p: Pangolin, ants: number): Pangolin {
          return { ...p, rolledUp: ants > 5000 };
        }
        ```

        ```ts
        export function feedPango(p: Pangolin, ants: number): Pangolin {
          // curl up a little sooner after a big meal
          return { ...p, rolledUp: ants > 3000 };
        }
        ```

docolin diffs the two versions with the same algorithm VS Code uses, so an edited line reads as an edit (with the exact changed words highlighted) instead of an unrelated remove-plus-add, and a genuinely new line stays a clean addition.

What the reader gets:

- **Expand.** The corner button opens the diff near-fullscreen in a side-by-side split, with a unified toggle.
- **Moved blocks.** Code that merely relocated is marked blue instead of red/green; hovering one side lights up where it went.
- **The menu (⋯).** Word-level highlights on or off, move highlighting on or off, swap before and after, and copy either version whole.
- **Shareable lines.** Click a line number in either gutter to light that line and write it into the URL (shift-click for a range, ctrl-click to add or remove single lines). The select button in the header also switches whole rows to click-to-select, like in code blocks. A shared link reopens with the same lines lit and scrolls to the diff.

Readers without JavaScript (and AI agents reading the page) see the two blocks labeled Before and After, so nothing is lost.

## Line numbers and offset windows

Each fence can carry its own `linenums="N"`, so a snippet shows the line numbers it really has in its file:

- **Same start on both** (or no `linenums` at all): the two versions are diffed by content, as above.
- **Different starts**: you are telling docolin the snippets are _offset windows of the same file_. Lines then pair up by their absolute line number instead: what sits at the same number gets compared, and what only one window covers shows as a plain removal or addition.

````md
!!! diff "config/routes.ts"
    ```ts linenums="1238"
    router.get("/pango/:id", showPango);
    router.get("/pango/:id/scales", showScales);
    router.post("/pango/:id/feed", feedPango);
    ```

    ```ts linenums="1240"
    router.get("/pango/:id", showPango);
    router.post("/pango/:id/feed", feedPango);
    router.post("/pango/:id/rollup", rollUp);
    ```
````

!!! output "Rendered"
    !!! diff "config/routes.ts"
        ```ts linenums="1238"
        router.get("/pango/:id", showPango);
        router.get("/pango/:id/scales", showScales);
        router.post("/pango/:id/feed", feedPango);
        ```

        ```ts linenums="1240"
        router.get("/pango/:id", showPango);
        router.post("/pango/:id/feed", feedPango);
        router.post("/pango/:id/rollup", rollUp);
        ```

## Gotchas

- **Exactly two fences.** A `!!! diff` body must hold the before block and the after block, nothing else. Anything different renders as ordinary blocks with no viewer.
- **Same language on both fences.** The viewer takes its syntax colors (and its language badge) from the code blocks; mixing languages makes the colors lie.
- **Different `linenums` starts change the pairing.** Use them only when the snippets genuinely are offset windows of one file; for a plain before/after, give both the same start or none.
- **Big changes read best expanded.** The inline viewer is stacked to fit the page column; point readers at the expand button when a diff is wide or long.

## See also

- [Code blocks](./code-blocks.md), for titles, line numbers, highlights, and annotations on a single block.
- [Content tabs](./tabs.md), for showing whole alternative versions side by side instead of a line-level diff.
