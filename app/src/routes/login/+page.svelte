<script lang="ts">
  import { page } from '$app/stores';
  import LoginWithSyr from '$lib/client/components/LoginWithSyr.svelte';

  // Map known error codes to trusted strings — never render the raw `?error=`
  // value, which would let a crafted /login link display arbitrary text in
  // the error banner (phishing / social-engineering vector).
  const ERROR_MESSAGES: Record<string, string> = {
    consent_denied: 'Consent was denied on your syr instance.',
    missing_code: 'Sign-in did not return an authorization code.',
    invalid_state: 'Login session expired or was tampered with — please try again.',
    session_expired: 'Login session expired — please try again.',
    missing_delegation_id: 'Your syr instance did not return a delegation id.',
    instance_unsupported: 'That instance does not support platform delegation.',
    token_exchange_failed: 'Could not complete sign-in with your instance.',
    unauthorized: 'You need to sign in to continue.'
  };

  $: errorCode = $page.url.searchParams.get('error');
  $: errorMsg = errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Sign-in failed.') : null;
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
