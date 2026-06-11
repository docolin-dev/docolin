<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    REASON_REQUIRING_DETAILS,
    REPORT_REASON_GROUPS,
    type ModerationTargetType,
    type ReportReason,
  } from "$lib/moderation-reasons";
  import { LIMITS } from "$lib/limits";
  import { applyEnhance } from "./dialog-enhance";
  import { reasonGroupLabel, reasonLabel } from "./reason-label";

  // One shared instance per page; the page sets `target` when a kebab "Report"
  // item is chosen, then opens it. Submits to the page's ?/report action, so it
  // works on any page that defines one (thread + doco viewer).
  let {
    open = $bindable(false),
    target,
  }: {
    open?: boolean;
    target: { type: ModerationTargetType; id: string } | null;
  } = $props();

  let reason = $state("");
  let details = $state("");
  let submitting = $state(false);
  let succeeded = $state(false);
  let errorCode = $state<string | null>(null);

  // Reset on each fresh open (false -> true), never mid-edit.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      reason = "";
      details = "";
      submitting = false;
      succeeded = false;
      errorCode = null;
    }
    wasOpen = open;
  });

  const errorText = $derived(
    errorCode === "reason"
      ? m.moderation_report_error_reason()
      : errorCode === "details"
        ? m.moderation_report_error_details()
        : errorCode !== null
          ? m.moderation_report_error_generic()
          : null,
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{m.moderation_report_title()}</Dialog.Title>
      <Dialog.Description>{m.moderation_report_description()}</Dialog.Description>
    </Dialog.Header>

    {#if succeeded}
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <CircleCheck class="size-8 text-emerald-600" />
        <p class="text-foreground font-medium">{m.moderation_report_success_title()}</p>
        <p class="text-muted-foreground text-sm">{m.moderation_report_success_body()}</p>
      </div>
      <Dialog.Footer>
        <Button type="button" onclick={() => (open = false)}>
          {m.moderation_dialog_close()}
        </Button>
      </Dialog.Footer>
    {:else}
      <form
        method="POST"
        action="?/report"
        use:enhance={({ cancel }) => {
          errorCode = null;
          if (reason === "") {
            errorCode = "reason";
            cancel();
            return;
          }
          if (reason === REASON_REQUIRING_DETAILS && details.trim() === "") {
            errorCode = "details";
            cancel();
            return;
          }
          submitting = true;
          return applyEnhance({
            onResult: (type, data) => {
              submitting = false;
              if (type === "success") succeeded = true;
              else errorCode = typeof data?.error === "string" ? data.error : "generic";
            },
          });
        }}
        class="flex flex-col gap-4"
      >
        <input type="hidden" name="targetType" value={target?.type ?? ""} />
        <input type="hidden" name="targetId" value={target?.id ?? ""} />
        <input type="hidden" name="reason" value={reason} />

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{m.moderation_report_reason_label()}</span>
          <Select.Root type="single" bind:value={reason}>
            <Select.Trigger class="h-9! w-full">
              {reason === ""
                ? m.moderation_report_reason_placeholder()
                : reasonLabel(reason as ReportReason)}
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each REPORT_REASON_GROUPS as group (group.key)}
                <Select.Group>
                  <Select.GroupHeading>{reasonGroupLabel(group.key)}</Select.GroupHeading>
                  {#each group.reasons as r (r)}
                    <Select.Item value={r} label={reasonLabel(r)}>{reasonLabel(r)}</Select.Item>
                  {/each}
                </Select.Group>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{m.moderation_report_details_label()}</span>
          <Textarea
            name="details"
            bind:value={details}
            rows={3}
            maxlength={LIMITS.moderationDetails}
            placeholder={m.moderation_report_details_placeholder()}
          />
        </div>

        {#if errorText !== null}
          <p class="text-destructive text-sm">{errorText}</p>
        {/if}

        <Dialog.Footer>
          <Button type="button" variant="ghost" onclick={() => (open = false)}>
            {m.moderation_dialog_cancel()}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? m.moderation_report_submitting() : m.moderation_report_submit()}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
