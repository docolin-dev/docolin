---
title: Code blocks
description: Inline code and fenced blocks across languages, plus the no-language and unknown-language fallbacks.
---

Every good jungle gym ships with code. Inline first: `const grip = "firm"`, then
the real bars in a few languages.

Every block has shareable lines: click the select button in a block's top-right,
then click lines to highlight them (shift-click for a range). The selection lives in
the URL, so the link reopens lit. The block below opts into always-on numbers and an
author highlight (`title="..." linenums="1" hl_lines="7"`):

```ts title="feed-pango.ts" linenums="1" hl_lines="7"
interface Pangolin {
  name: string;
  scales: number;
  rolledUp: boolean;
}

export function feedPango(p: Pangolin, ants: number): Pangolin {
  return { ...p, rolledUp: ants > 5000 };
}
```

```bash
# raise a new jungle gym from scratch
git clone https://github.com/docolin-dev/jungle-gym
cd jungle-gym && bun install
bun run climb --to top
```

```python
def somersaults(height_m: float) -> int:
    # one full curl-and-roll per half meter of fall, naturally
    return int(height_m // 0.5)
```

```json
{
  "name": "Pango",
  "species": "pangolin",
  "scales": 984,
  "favorite_snack": "ants",
  "afraid_of": ["heights", "nothing else"]
}
```

```css
.climbing-bar {
  color: var(--primary);
  border-radius: 0;
  cursor: grab;
}
```

A block with no language (the chalk dust on the bars):

```
   .--.
  ( o_o )   pango approves
   > ^ <
```

An unknown language, so Pango can confirm it falls back without faceplanting:

```doesnotexist
?? this grammar climbed the wrong bar ??
```

Line numbers can start anywhere with `linenums="N"`, so a snippet carries the
numbers it has in its real file. The gutter widens to fit big ones:

```ts linenums="1240" title="router.ts"
router.get("/pango/:id", showPango);
router.post("/pango/:id/feed", feedPango);
router.post("/pango/:id/rollup", rollUp);
```

## Diffs

A `diff` block colors removed lines red and added lines green, so a change reads at
a glance (context lines start with a space, removals with `-`, additions with `+`):

```diff
 export function feedPango(p: Pangolin, ants: number): Pangolin {
-  return { ...p, rolledUp: ants > 5000 };
+  // pangolins curl up a little sooner after a big meal
+  return { ...p, rolledUp: ants > 3000 };
 }
```

For a computed before/after view, wrap two code blocks in `!!! diff` and the reader
gets an interactive diff (unified or split, with the exact changes highlighted):

!!! diff "feed-pango.ts"
    ```ts linenums="20"
    export function feedPango(p: Pangolin, ants: number): Pangolin {
      return { ...p, rolledUp: ants > 5000 };
    }
    ```

    ```ts linenums="20"
    export function feedPango(p: Pangolin, ants: number): Pangolin {
      // curl up a little sooner after a big meal
      return { ...p, rolledUp: ants > 3000 };
    }
    ```

Diff lines are shareable like code-block lines: click a line number in either
gutter to light that line and put it in the URL (shift-click for a range,
ctrl-click to toggle). The link reopens with the same lines lit, even inside the
expanded view.

Each side numbers from where the snippet really sits with `linenums="N"` on its
fence. Equal starts diff by content, like above. Different starts mean "offset
windows of the same file": lines then pair by their absolute line number, so what
sits at the same number gets compared, and what only one window covers shows as
plain removal or addition. Big numbers just widen the gutter to fit:

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

When a whole block just moves rather than changes, the viewer paints it blue (a
move, not a rewrite); the "Highlight moved blocks" item in the diff menu toggles it:

!!! diff "app.ts, reordered"
    ```ts
    function setup() {
      return init();
    }

    const app = createApp();
    const router = createRouter();
    app.use(router);
    app.mount("#root");
    ```

    ```ts
    const app = createApp();
    const router = createRouter();
    app.use(router);
    app.mount("#root");

    function setup() {
      return init();
    }
    ```

Moves shine when several blocks relocate at once. Hover any moved (blue) block and
its counterpart lights up, so you can trace exactly where each one went even when
two swap places:

!!! diff "server.ts, two blocks swapped"
    ```ts
    function handleError(err) {
      log(err);
      notify(err);
    }

    const config = loadConfig();
    const db = connect(config);
    const server = createServer(db);
    server.use(config.middleware);

    function shutdown() {
      server.close();
      db.disconnect();
    }
    ```

    ```ts
    function shutdown() {
      server.close();
      db.disconnect();
    }

    const config = loadConfig();
    const db = connect(config);
    const server = createServer(db);
    server.use(config.middleware);

    function handleError(err) {
      log(err);
      notify(err);
    }
    ```

## Long lines

A line too long for the block wraps onto the next line instead of forcing a
horizontal scrollbar. Indentation is kept, and wrapped continuations sit under the
code, not under the line number:

```bash
echo "Pango climbed every bar in the jungle gym twice, rolled into a ball at the very top, bounced down four whole levels, ate exactly one thousand and forty-two ants, and still had time for a nap before sunrise"
```

## Fences inside fences

Wrap a block in **four** backticks when its body itself contains a three-backtick
fence. That is how a doc shows you a code block without running it, the inner fence
stays literal text:

````md
```ts
const grip: string = "firm";
```
````

And the four-backtick wrapper keeps _everything_ inside it literal, prose, headings,
and the inner fence alike:

````md
## Not a real heading

Some **bold** text, a list, then a fenced block, all shown verbatim:

- one
- two

```ts
const grip: string = "firm";
```
````

## Annotations

Mark a line with `(n)` and follow the block with a numbered list. The marker becomes
a little badge; click it for the note. Add `!` (`(n)!`) to strip the surrounding
comment so only the badge shows. A real call like `listen(8080)` is left alone.

```bash
sudo dnf install rpmfusion-free-release  # (1)!
sudo dnf install akmod-nvidia            # (2)!
sudo akmods --force                      # (3)!
```

1. Enables the RPM Fusion repo, where the driver lives.

2. Pulls the driver as an akmod, so it rebuilds for each new kernel. Confirm it
   landed:

   ```bash
   rpm -qa | grep akmod-nvidia
   ```

3. Builds the module for the running kernel now, instead of waiting for a reboot.
