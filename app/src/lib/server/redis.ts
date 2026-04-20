import { Redis } from "ioredis";
import { building } from "$app/environment";
import { env } from "$env/dynamic/private";

function init(): Redis {
    if (!env.REDIS_URL) throw new Error("REDIS_URL is required");
    return new Redis(env.REDIS_URL);
}

// SvelteKit's build/analyse step imports server modules without runtime env
// present — the image is intentionally environment-agnostic so a single build
// runs in dev, staging, and prod. Skip Redis init during build; the client
// is never used during analyse anyway. Real init happens on first request.
export const redis: Redis = building ? (null as unknown as Redis) : init();
