<script lang="ts">
  import { page } from '$app/stores';
  import 'iconify-icon';

  let instanceUrl = '';
  let loading = false;
  let errorMsg: string | null = null;

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!instanceUrl.trim()) return;
    loading = true;
    errorMsg = null;
    try {
      const redirect = $page.url.searchParams.get('redirect') ?? undefined;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_url: instanceUrl.trim(), redirect })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorMsg = data.message || data.error || 'Failed to connect';
        return;
      }
      window.location.href = data.consent_url;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Connection failed';
    } finally {
      loading = false;
    }
  }
</script>

<form on:submit={handleSubmit} class="flex flex-col gap-3 w-full">
  <label for="instance_url" class="font-medium text-sm">Your syr instance</label>
  <input
    id="instance_url"
    type="text"
    required
    bind:value={instanceUrl}
    placeholder="syr.example.com"
    class="input p-2"
    autocomplete="url"
    disabled={loading}
  />
  {#if errorMsg}
    <p class="text-error-500 text-sm">{errorMsg}</p>
  {/if}
  <button type="submit" disabled={loading} class="btn variant-filled-primary flex gap-2">
    {#if loading}
      <iconify-icon icon="eos-icons:spinner" class="animate-spin" />
      Connecting…
    {:else}
      Continue with syr
    {/if}
  </button>
  <p class="text-xs opacity-70 text-center">
    You'll be redirected to your syr instance to sign in and authorize GPlace.
  </p>
</form>
