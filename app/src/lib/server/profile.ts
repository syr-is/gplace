import { redis } from '$lib/server/redis';
import { fetchIdentityManifest } from '$lib/server/syr';

export interface ProfileData {
    did: string;
    syrInstanceUrl: string;
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    webProfileUrl?: string;
    hashUrl?: string;
    hashValue?: string;
    fetchedAt: number;
    hashCheckedAt: number;
}

const PROFILE_TTL_S = 300;
const HASH_RECHECK_MS = 30_000;
const KEY = (did: string) => `gplace:profile:${did}`;

const inflight = new Map<string, Promise<ProfileData | null>>();

async function fetchHash(hashUrl: string): Promise<string | null> {
    try {
        const res = await fetch(hashUrl, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { data?: { hash?: string }; hash?: string };
        return body?.data?.hash ?? body?.hash ?? null;
    } catch {
        return null;
    }
}

async function fetchAndCache(did: string, syrInstanceUrl: string): Promise<ProfileData | null> {
    const existing = inflight.get(did);
    if (existing) return existing;

    const promise = (async () => {
        const manifest = await fetchIdentityManifest(syrInstanceUrl, did);
        if (!manifest?.endpoints?.profile) return null;
        let profileBody: { data?: Record<string, unknown> } | null = null;
        try {
            const res = await fetch(manifest.endpoints.profile, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) return null;
            profileBody = (await res.json()) as { data?: Record<string, unknown> };
        } catch {
            return null;
        }

        const data = profileBody?.data ?? {};
        const now = Date.now();
        const hashUrl = manifest.endpoints.public_hash;
        const hashValue = hashUrl ? (await fetchHash(hashUrl)) ?? undefined : undefined;

        const profile: ProfileData = {
            did,
            syrInstanceUrl,
            username: typeof data.username === 'string' ? data.username : undefined,
            displayName: typeof data.display_name === 'string' ? data.display_name : undefined,
            bio: typeof data.bio === 'string' ? data.bio : undefined,
            avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : undefined,
            bannerUrl: typeof data.banner_url === 'string' ? data.banner_url : undefined,
            webProfileUrl:
                typeof manifest.web_profile === 'string' ? manifest.web_profile : undefined,
            hashUrl,
            hashValue,
            fetchedAt: now,
            hashCheckedAt: now
        };
        await redis.set(KEY(did), JSON.stringify(profile), 'EX', PROFILE_TTL_S);
        return profile;
    })();

    inflight.set(did, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(did);
    }
}

export async function getProfile(
    did: string,
    syrInstanceUrl: string
): Promise<ProfileData | null> {
    const cached = await redis.get(KEY(did)).catch(() => null);
    if (!cached) return fetchAndCache(did, syrInstanceUrl);

    let profile: ProfileData;
    try {
        profile = JSON.parse(cached) as ProfileData;
    } catch {
        return fetchAndCache(did, syrInstanceUrl);
    }

    if (profile.hashUrl && Date.now() - profile.hashCheckedAt > HASH_RECHECK_MS) {
        const fresh = await fetchHash(profile.hashUrl);
        if (fresh && fresh !== profile.hashValue) {
            return fetchAndCache(did, syrInstanceUrl);
        }
        profile.hashCheckedAt = Date.now();
        if (fresh) profile.hashValue = fresh;
        await redis.set(KEY(did), JSON.stringify(profile), 'EX', PROFILE_TTL_S).catch(() => {});
    }
    return profile;
}

export async function invalidateProfile(did: string): Promise<void> {
    await redis.del(KEY(did)).catch(() => {});
}
