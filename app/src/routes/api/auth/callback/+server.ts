import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server';
import {
    exchangeCode,
    fetchInstanceManifest,
    getCallbackUrl,
    getPlatformOrigin,
    isProd
} from '$lib/server/syr';

const loginRedirect = (code: string) =>
    redirect(302, `/login?error=${encodeURIComponent(code)}`);

/** Reject protocol-relative URLs like `//attacker.com` that browsers treat as external. */
const isSafeRelativePath = (p: unknown): p is string =>
    typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');

export const GET = async ({ url, cookies }) => {
    const errorParam = url.searchParams.get('error');
    if (errorParam) throw loginRedirect('consent_denied');

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const delegationId = url.searchParams.get('delegation_id');

    if (!code) throw loginRedirect('missing_code');

    const storedState = cookies.get('gplace_oauth_state');
    if (!state || state !== storedState) throw loginRedirect('invalid_state');
    cookies.delete('gplace_oauth_state', { path: '/' });

    const syrInstanceUrl = cookies.get('gplace_pending_instance');
    if (!syrInstanceUrl) throw loginRedirect('session_expired');

    if (!delegationId) throw loginRedirect('missing_delegation_id');

    const manifest = await fetchInstanceManifest(syrInstanceUrl);
    if (!manifest?.platform) throw loginRedirect('instance_unsupported');

    let tokens;
    try {
        tokens = await exchangeCode(manifest, {
            code,
            delegation_id: delegationId,
            callback_url: getCallbackUrl(),
            platform_origin: getPlatformOrigin()
        });
    } catch {
        throw loginRedirect('token_exchange_failed');
    }

    await prisma.user.upsert({
        where: { id: tokens.did },
        create: {
            id: tokens.did,
            syrInstanceUrl,
            delegatePublicKey: tokens.delegate_public_key
        },
        update: {
            syrInstanceUrl,
            delegatePublicKey: tokens.delegate_public_key,
            editedAt: new Date()
        }
    });

    const sessionId = crypto.randomUUID();
    await prisma.session.create({
        data: {
            id: sessionId,
            userId: tokens.did,
            did: tokens.did,
            syrInstanceUrl,
            platformToken: tokens.access_token,
            delegatePublicKey: tokens.delegate_public_key,
            tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000)
        }
    });

    cookies.delete('gplace_pending_instance', { path: '/' });
    const postLogin = cookies.get('gplace_post_login_redirect');
    if (postLogin) cookies.delete('gplace_post_login_redirect', { path: '/' });

    cookies.set('gplace_session', sessionId, {
        path: '/',
        httpOnly: true,
        secure: isProd(),
        sameSite: isProd() ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60
    });

    throw redirect(302, isSafeRelativePath(postLogin) ? postLogin : '/');
};
