---
title: Steps
description: An ordered list inside !!! steps renders as a numbered vertical stepper. Steps can be rich, holding code, lists, and prose.
---

A bare stepper, no title:

!!! steps
    1. Sniff the first bar
    2. Climb it anyway
    3. Bounce to the next bar

With a title and richer steps:

!!! steps "Install the driver"
    1. Add the repos, then install:

       ```bash
       sudo dnf install rpmfusion-free-release
       ```

    2. Pick your card from the list:

       - desktop GPU
       - laptop hybrid

    3. Reboot and run `nvidia-smi`
