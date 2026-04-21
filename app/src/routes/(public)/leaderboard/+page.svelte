<script lang="ts">
	import { getColorsFromImage, proxied } from '$lib/common';
	import { Avatar } from '@skeletonlabs/skeleton';
  export let data

  const FALLBACK_AVATAR = '/favicon.png'

  function getTextColor(element: HTMLDivElement, imageURL: string | null) {
    if (!imageURL) {
      element.style.color = "#000"
      element.style.textShadow = `0 0 5px #fff`
      return
    }
    getColorsFromImage(imageURL, 10, 4).then((color) => {
      if (!color) {
        element.style.color = "#000"
        element.style.textShadow = `0 0 5px #fff`
        return
      }
      element.style.color = color[1]
      element.style.textShadow = `0 0 5px ${color[3]}`
    });
  }
</script>

{#await data.lazy.topChangers}
<h1>
  Loading...
</h1>
{:then topChangers}
<div class="flex flex-col items-center gap-4 mt-4 ">
  <h1>
    LEADERBOARD
  </h1>
  <div class="h-[calc(100vh-3rem)] overflow-y-auto overflow-x-visible hide-scrollbar w-full">
    {#each topChangers as topChanger}
    {@const proxiedBanner = topChanger.banner ? proxied(topChanger.banner) : null}
    <svelte:element
      this={topChanger.webProfileUrl ? 'a' : 'div'}
      class="w-full block"
      target={topChanger.webProfileUrl ? '_blank' : undefined}
      rel={topChanger.webProfileUrl ? 'noopener noreferrer' : undefined}
      href={topChanger.webProfileUrl ?? undefined}
    >
      <div style={proxiedBanner ? `background-image: url("${proxiedBanner}")` : ''} class="card bg-no-repeat bg-cover w-full flex justify-between p-4" >
        <div class="flex flex-row justify-between w-full">
          <div class="flex gap-4 items-center" use:getTextColor={proxiedBanner}>
            <Avatar src={topChanger.avatar ? proxied(topChanger.avatar) : FALLBACK_AVATAR} width="w-16" rounded="rounded-none" />
            <h2 class="text-center">{topChanger.username}</h2>
          </div>
          <div class="flex flex-col items-center" use:getTextColor={proxiedBanner}>
            <h3 class="text-center">Points</h3>
            <h3 class="text-center">{topChanger.totalPixelsChanged}</h3>
          </div>
      </div>
      </div>
    </svelte:element>
    {/each}
  </div>
</div>
{:catch}
<p class="text-error-500">An error ocurred while getting top placers...</p>
{/await}
