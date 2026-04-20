<script lang="ts">
	import '../app.postcss';
	import 'iconify-icon';
	import { getDrawerStore, initializeStores, Drawer, Avatar, LightSwitch, type DrawerSettings, Toast } from '@skeletonlabs/skeleton';

	// Floating UI for Popups
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	import LoginWithSyr from '$lib/client/components/LoginWithSyr.svelte';
	import { page } from '$app/stores';
	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });
	initializeStores()

	const drawerStore = getDrawerStore();

	const drawerSettings: DrawerSettings = {
		width: 'w-[280px] md:w-[480px]',
		padding: 'p-4',
		rounded: 'rounded-none',
	}

	$: profile = $page.data.profile;
	$: localUser = $page.data.localUser;
	$: displayName = profile?.displayName ?? profile?.username ?? localUser?.id?.slice(0, 16) ?? '';
	$: avatarSrc = profile?.avatarUrl ?? '/favicon.png';
	$: profileHref = profile?.webProfileUrl ?? null;
</script>

<Toast />

<Drawer position="right">
	<div class="flex flex-col h-full p-4 justify-between">
		<div class="flex flex-col gap-4 mt-4 items-center w-full">
			<a href="/">
				<h2>
					GPlace
				</h2>
			</a>
			{#if localUser}
				{#if profileHref}
					<a href={profileHref} target="_blank" rel="noopener noreferrer" on:click={() => drawerStore.close()}>
						<div class="flex flex-col items-center w-full">
							<Avatar src={avatarSrc} width="w-16" rounded="rounded-none" />
							<div class="flex gap-2 items-center mt-2">
								{displayName}
								{#if localUser.role == "ADMIN"}
									·
									<span class="badge variant-filled-tertiary">ADMIN</span>
								{/if}
							</div>
						</div>
					</a>
				{:else}
					<div class="flex flex-col items-center w-full">
						<Avatar src={avatarSrc} width="w-16" rounded="rounded-none" />
						<div class="flex gap-2 items-center mt-2">
							{displayName}
							{#if localUser.role == "ADMIN"}
								·
								<span class="badge variant-filled-tertiary">ADMIN</span>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
			<hr class="w-2/3" />
			<a href="/tips" target="_blank" rel="noopener noreferrer">Tips</a>
			<a href="/leaderboard" target="_blank" rel="noopener noreferrer">Leaderboard</a>
			{#if localUser}
				<a href="/settings" on:click={() => drawerStore.close()}>
					Settings
				</a>
				<LightSwitch />
				<hr class="w-2/3" />
				<form action="/logout" method="POST">
					<button class="btn variant-ghost-error mb-4" type="submit">
						Logout
					</button>
				</form>
			{:else}
				<hr class="w-2/3" />
				<LoginWithSyr />
			{/if}
		</div>
	</div>
</Drawer>

<svelte:head>
  <title>
    GPlace!
  </title>
  <meta property="og:title" content="GPlace" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://gplace.ink" />
  <meta property="og:image" content="https://gplace.ink/favicon.png" />
  <meta property="og:description" content="Create pixel art together!" />
	<meta name="keywords" content="GPlace, syr, r/place, Pixel Art">
  <meta name="author" content="Ham aka TooMuchHam, SoSweetHam">
</svelte:head>

<div class="root-container relative h-screen w-screen">
	<button on:click={() => drawerStore.open(drawerSettings)} class="btn variant-filled-primary fixed bottom-3 right-3 z-20">
		<iconify-icon icon="fa-solid:bars" />
	</button>
	<slot />
</div>
