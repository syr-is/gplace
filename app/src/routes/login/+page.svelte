<script lang="ts">
  import { page } from '$app/stores';
  import LoginWithSyr from '$lib/client/components/LoginWithSyr.svelte';

  $: errorMsg = $page.url.searchParams.get('error');
</script>

<svelte:head>
  <title>Sign in · GPlace</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center p-4">
  <div class="card p-6 w-full max-w-md flex flex-col gap-4">
    <h1 class="text-2xl font-semibold text-center">Sign in to GPlace</h1>
    {#if errorMsg}
      <div class="alert variant-filled-error">{errorMsg}</div>
    {/if}
    <LoginWithSyr />
  </div>
</div>
