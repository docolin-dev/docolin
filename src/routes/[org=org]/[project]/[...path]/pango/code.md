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
