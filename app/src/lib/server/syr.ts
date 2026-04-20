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

export const isProd = (): boolean => env.PROD === 'true';

export const getPlatformOrigin = (): string => {
    if (!env.APP_ORIGIN) throw new Error('APP_ORIGIN is required');
    return env.APP_ORIGIN.replace(/\/+$/, '');
};

export const getCallbackUrl = (): string => `${getPlatformOrigin()}/api/auth/callback`;

export async function fetchInstanceManifest(instanceUrl: string): Promise<InstanceManifest | null> {
    const base = instanceUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/.well-known/syr`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        return (await res.json()) as InstanceManifest;
    } catch {
        return null;
    }
}

export async function fetchIdentityManifest(
    syrInstanceUrl: string,
    did: string
): Promise<IdentityManifest | null> {
    const base = syrInstanceUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/.well-known/syr/${encodeURIComponent(did)}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
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
    const url = new URL(manifest.platform.consent);
    url.searchParams.set('platform_origin', params.platform_origin);
    url.searchParams.set('platform_name', params.platform_name);
    url.searchParams.set('callback_url', params.callback_url);
    url.searchParams.set('scopes', params.scopes);
    url.searchParams.set('state', params.state);
    return url.toString();
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
    const res = await fetch(manifest.platform.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
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
    return (await res.json()) as SyrTokens;
}
