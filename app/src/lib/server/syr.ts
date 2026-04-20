import { env } from '$env/dynamic/private';

export interface InstanceManifest {
    name?: string;
    public_url?: string;
    platform?: {
        consent: string;
        token: string;
        sign: string;
        challenge: string;
        delegations: string;
        revoke: string;
    };
    identity_manifest_template?: string;
    [key: string]: unknown;
}

export interface IdentityManifest {
    did: string;
    provider: string;
    endpoints: {
        profile: string;
        public_hash?: string;
        [k: string]: string | undefined;
    };
    web_profile?: string;
    [key: string]: unknown;
}

export interface SyrTokens {
    access_token: string;
    token_type: string;
    expires_in: number;
    did: string;
    delegate_public_key: string;
    scopes: string[];
}

const FETCH_TIMEOUT_MS = 5000;

export const isProd = (): boolean => env.PROD === 'true';

export const getPlatformOrigin = (): string => {
    if (!env.APP_ORIGIN) throw new Error('APP_ORIGIN is required');
    return env.APP_ORIGIN.replace(/\/+$/, '');
};

export const getCallbackUrl = (): string => `${getPlatformOrigin()}/api/auth/callback`;

/**
 * Validate any URL we're about to send a server-side fetch to.
 * In production: require https + reject private/loopback/link-local hosts (SSRF defense).
 * In dev: permit http + localhost so the local syr instance is reachable.
 */
export function safeUrl(input: string | undefined | null): URL | null {
    if (typeof input !== 'string' || !input) return null;
    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (isProd()) {
        if (parsed.protocol !== 'https:') return null;
        if (isPrivateOrLoopback(parsed.hostname)) return null;
    }
    return parsed;
}

function isPrivateOrLoopback(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (m) {
        const a = +m[1];
        const b = +m[2];
        if (a === 0 || a === 127) return true; // wildcard / loopback
        if (a === 10) return true; // private
        if (a === 172 && b >= 16 && b <= 31) return true; // private
        if (a === 192 && b === 168) return true; // private
        if (a === 169 && b === 254) return true; // link-local (incl. AWS/GCP metadata 169.254.169.254)
        if (a >= 224) return true; // multicast / reserved
    }
    if (h === '::' || h === '::1') return true;
    if (h.startsWith('fe80:')) return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true;
    return false;
}

async function safeFetch(url: URL, init: RequestInit = {}): Promise<Response | null> {
    try {
        const res = await fetch(url, {
            ...init,
            redirect: 'error', // refuse to follow redirects to unvalidated targets
            signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        return res;
    } catch {
        return null;
    }
}

export async function fetchInstanceManifest(instanceUrl: string): Promise<InstanceManifest | null> {
    const base = safeUrl(instanceUrl.replace(/\/+$/, ''));
    if (!base) return null;
    const target = new URL('/.well-known/syr', base);
    const res = await safeFetch(target, { headers: { Accept: 'application/json' } });
    if (!res || !res.ok) return null;
    try {
        return (await res.json()) as InstanceManifest;
    } catch {
        return null;
    }
}

export async function fetchIdentityManifest(
    syrInstanceUrl: string,
    did: string
): Promise<IdentityManifest | null> {
    const base = safeUrl(syrInstanceUrl.replace(/\/+$/, ''));
    if (!base) return null;
    const target = new URL(`/.well-known/syr/${encodeURIComponent(did)}`, base);
    const res = await safeFetch(target, { headers: { Accept: 'application/json' } });
    if (!res || !res.ok) return null;
    try {
        return (await res.json()) as IdentityManifest;
    } catch {
        return null;
    }
}

export function buildConsentUrl(
    manifest: InstanceManifest,
    params: {
        platform_origin: string;
        platform_name: string;
        callback_url: string;
        scopes: string;
        state: string;
    }
): string {
    if (!manifest.platform) throw new Error('Instance does not support platform delegation');
    const consent = safeUrl(manifest.platform.consent);
    if (!consent) throw new Error('Invalid consent endpoint');
    consent.searchParams.set('platform_origin', params.platform_origin);
    consent.searchParams.set('platform_name', params.platform_name);
    consent.searchParams.set('callback_url', params.callback_url);
    consent.searchParams.set('scopes', params.scopes);
    consent.searchParams.set('state', params.state);
    return consent.toString();
}

export async function exchangeCode(
    manifest: InstanceManifest,
    body: {
        code: string;
        delegation_id: string;
        callback_url: string;
        platform_origin: string;
    }
): Promise<SyrTokens> {
    if (!manifest.platform) throw new Error('Instance does not support platform delegation');
    const tokenUrl = safeUrl(manifest.platform.token);
    if (!tokenUrl) throw new Error('Invalid token endpoint');

    const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            error_description?: string;
        };
        throw new Error(
            `Token exchange failed: ${res.status} ${err.error_description ?? err.error ?? ''}`.trim()
        );
    }

    const tokens = (await res.json().catch(() => null)) as Partial<SyrTokens> | null;
    if (
        !tokens ||
        typeof tokens.access_token !== 'string' ||
        typeof tokens.did !== 'string' ||
        typeof tokens.delegate_public_key !== 'string' ||
        typeof tokens.token_type !== 'string' ||
        !Number.isFinite(tokens.expires_in) ||
        (tokens.expires_in as number) <= 0 ||
        !Array.isArray(tokens.scopes)
    ) {
        throw new Error('Invalid token response from syr instance');
    }
    return tokens as SyrTokens;
}
