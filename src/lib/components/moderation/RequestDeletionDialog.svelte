<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { m } from "$paraglide/messages";
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

  // Moderator-only: requests deletion of someone else's content. Filing hides it
  // immediately and queues it for platform-staff review. Submits to ?/requestDeletion.
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
  let errorCode = $state<string | null>(null);

  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      reason = "";
      details = "";
      submitting = false;
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
      <Dialog.Title>{m.moderation_request_deletion_title()}</Dialog.Title>
      <Dialog.Description>{m.moderation_request_deletion_description()}</Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/requestDeletion"
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
          onResult: async (type, data) => {
            submitting = false;
            if (type === "success") {
              open = false;
              await invalidateAll();
            } else {
              errorCode = typeof data?.error === "string" ? data.error : "generic";
            }
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
        <Button type="submit" variant="destructive" disabled={submitting}>
          {submitting
            ? m.moderation_request_deletion_submitting()
            : m.moderation_request_deletion_submit()}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
