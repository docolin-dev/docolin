---
title: Interactive variables
description: Reader-fillable inputs, live expressions, and a whole doco that recomputes itself, commands, tables, even charts, without a byte ever leaving the browser.
---

This page is one live demo. Fill in the card below and watch **everything** on
this page recompute: the commands, the prose, the table, the chart. Nothing you
type is stored on a server or sent anywhere; secrets never even touch
localStorage.

## Your deployment

!!! inputs "Your deployment"
    - api\_key: API key { secret placeholder="pgo-..." }
    - host: Server URL { type=url default="<https://antfarm.example.com>" }
    - replicas: Replicas { type=number min=1 max=10 default=3 }
    - ants\_per\_day: Ants per day { type=number default=50000 }
    - endpoint := host + "/v1/feed?key=" + urlencode(api\_key)
    - per\_replica := round(ants\_per\_day / replicas)
    - resilience := replicas >= 3 ? "highly available" : "a single point of failure"

Click any dashed chip on this page to jump back to its input. The
"Derived values" disclosure above shows the hidden variables this doco computes
from your answers.

## Commands become yours

The API key is url-encoded into the endpoint, so even keys with `&` or spaces
survive. Copy buttons copy **your** substituted command:

```bash
# feed the farm
curl -X POST "{{ endpoint }}" \
  --data '{"replicas": {{ replicas }}, "antsPerDay": {{ ants_per_day }}}'
```

```yaml
# antfarm.yaml
server: {{ host }}
replicas: {{ replicas }}
perReplicaQuota: {{ per_replica }}
```

## Prose does math

With **{{ replicas }}** replicas your farm is **{{ resilience }}**. Each replica
handles **{{ per\_replica }}** ants a day, which works out to
**{{ round(ants\_per\_day / 86400, 2) }}** ants per second across the farm, and
**{{ round(per\_replica / 86400, 2) }}** per second per replica.

Expressions go anywhere inline: doubling the farm would mean
{{ ants\_per\_day \* 2 }} ants, and {{ replicas == 1 ? "adding a second replica" : "you already have redundancy" }}.

## Tables recalculate

| Shift   | Ants handled                        | Per replica                                    |
| ------- | ----------------------------------- | ---------------------------------------------- |
| Morning | {{ round(ants\_per\_day \* 0.5) }}  | {{ round(ants\_per\_day \* 0.5 / replicas) }}  |
| Evening | {{ round(ants\_per\_day \* 0.35) }} | {{ round(ants\_per\_day \* 0.35 / replicas) }} |
| Night   | {{ round(ants\_per\_day \* 0.15) }} | {{ round(ants\_per\_day \* 0.15 / replicas) }} |

## Charts redraw live

Same table syntax as always, but the cells are expressions, so drag the
replicas number and watch the chart move:

| Shift   | Total                               | Per replica                                    |
| ------- | ----------------------------------- | ---------------------------------------------- |
| Morning | {{ round(ants\_per\_day \* 0.5) }}  | {{ round(ants\_per\_day \* 0.5 / replicas) }}  |
| Evening | {{ round(ants\_per\_day \* 0.35) }} | {{ round(ants\_per\_day \* 0.35 / replicas) }} |
| Night   | {{ round(ants\_per\_day \* 0.15) }} | {{ round(ants\_per\_day \* 0.15 / replicas) }} |

{ .chart type=bar title="Ant throughput by shift" }

## What stays untouched

Only declared names substitute, so docs about template languages are safe.
These are all literal, automatically:

```yaml
# a Helm chart in a doco, untouched because .Values.replicas is not declarable
replicas: {{ .Values.replicas }}
image: {{ .Values.image | default "pango:latest" }}
```

And a block can opt out entirely with `novars`, even for declared names:

```bash novars
echo "this {{ replicas }} stays exactly as written"
```

An expression that goes wrong shows an honest error chip instead of breaking
the page, hover it for the reason: {{ replicas > host }} compares a number with
a string, which docomd refuses instead of guessing.
