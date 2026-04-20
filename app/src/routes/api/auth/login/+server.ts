import { error, json } from '@sveltejs/kit';
import {
    buildConsentUrl,
    fetchInstanceManifest,
    getCallbackUrl,
    getPlatformOrigin,
    isProd
} from '$lib/server/syr';

export const POST = async ({ request, cookies }) => {
    const body = (await request.json().catch(() => ({}))) as {
        instance_url?: string;
        redirect?: string;
    };

    let instanceUrl = (body.instance_url ?? '').trim();
    if (!instanceUrl) throw error(400, 'Instance URL is required');
    if (!/^https?:\/\//i.test(instanceUrl)) instanceUrl = `https://${instanceUrl}`;
    instanceUrl = instanceUrl.replace(/\/+$/, '');

    const manifest = await fetchInstanceManifest(instanceUrl);
    if (!manifest) throw error(400, 'Could not reach this instance');
    if (!manifest.platform) throw error(400, 'Instance does not support platform delegation');

    const state = crypto.randomUUID();

    const tempCookieOpts = {
        path: '/',
        httpOnly: true,
        secure: isProd(),
        sameSite: (isProd() ? 'none' : 'lax') as 'none' | 'lax',
        maxAge: 600
    };
    cookies.set('gplace_pending_instance', instanceUrl, tempCookieOpts);
    cookies.set('gplace_oauth_state', state, tempCookieOpts);
    // Reject protocol-relative URLs (`//attacker.com`) that browsers treat as external.
    if (
        typeof body.redirect === 'string' &&
        body.redirect.startsWith('/') &&
        !body.redirect.startsWith('//')
    ) {
        cookies.set('gplace_post_login_redirect', body.redirect, tempCookieOpts);
    }

    const consent_url = buildConsentUrl(manifest, {
        platform_origin: getPlatformOrigin(),
        platform_name: 'GPlace',
        callback_url: getCallbackUrl(),
        scopes: 'identity:read,profile:read',
        state
    });

    return json({ consent_url });
};
