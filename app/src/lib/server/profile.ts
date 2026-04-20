import { redis } from '$lib/server/redis';
import { fetchIdentityManifest, safeUrl } from '$lib/server/syr';

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
const FETCH_TIMEOUT_MS = 5000;
const KEY = (did: string) => `gplace:profile:${did}`;

const inflight = new Map<string, Promise<ProfileData | null>>();

/** Only return string URLs that pass the safe-URL policy (http(s), no private hosts in prod). */
function safeUrlString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    return safeUrl(input)?.toString();
}

async function fetchHash(hashUrl: string): Promise<string | null> {
    const url = safeUrl(hashUrl);
    if (!url) return null;
    try {
        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
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

        const profileUrl = safeUrl(manifest.endpoints.profile);
        if (!profileUrl) return null;

        let profileBody: { data?: Record<string, unknown> } | null = null;
        try {
            const res = await fetch(profileUrl, {
                headers: { Accept: 'application/json' },
                redirect: 'error',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            if (!res.ok) return null;
            profileBody = (await res.json()) as { data?: Record<string, unknown> };
        } catch {
            return null;
        }

        const data = profileBody?.data ?? {};
        const now = Date.now();
        const hashUrl = safeUrlString(manifest.endpoints.public_hash);
        const hashValue = hashUrl ? (await fetchHash(hashUrl)) ?? undefined : undefined;

        const profile: ProfileData = {
            did,
            syrInstanceUrl,
            username: typeof data.username === 'string' ? data.username : undefined,
            displayName: typeof data.display_name === 'string' ? data.display_name : undefined,
            bio: typeof data.bio === 'string' ? data.bio : undefined,
            avatarUrl: safeUrlString(data.avatar_url),
            bannerUrl: safeUrlString(data.banner_url),
            webProfileUrl: safeUrlString(manifest.web_profile),
            hashUrl,
            hashValue,
            fetchedAt: now,
            hashCheckedAt: now
        };
        await redis
            .set(KEY(did), JSON.stringify(profile), 'EX', PROFILE_TTL_S)
            .catch(() => {});
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

    const now = Date.now();
    const hardExpiresAt = profile.fetchedAt + PROFILE_TTL_S * 1000;
    if (now >= hardExpiresAt) return fetchAndCache(did, syrInstanceUrl);

    if (profile.hashUrl && now - profile.hashCheckedAt > HASH_RECHECK_MS) {
        // Bump the recheck timestamp synchronously so concurrent requests don't all spawn rechecks,
        // then run the actual hash check in the background. This keeps every request fast (one
        // Redis GET) and never blocks on the upstream syr instance during normal operation.
        profile.hashCheckedAt = now;
        const remainingTtl = Math.max(1, Math.ceil((hardExpiresAt - now) / 1000));
        const snapshot = profile;
        void redis
            .set(KEY(did), JSON.stringify(snapshot), 'EX', remainingTtl)
            .catch(() => {});
        void (async () => {
            const hashUrl = snapshot.hashUrl;
            if (!hashUrl) return;
            const fresh = await fetchHash(hashUrl);
            if (fresh && fresh !== snapshot.hashValue) {
                await fetchAndCache(did, syrInstanceUrl);
            }
        })();
    }
    return profile;
}

export async function invalidateProfile(did: string): Promise<void> {
    await redis.del(KEY(did)).catch(() => {});
}
