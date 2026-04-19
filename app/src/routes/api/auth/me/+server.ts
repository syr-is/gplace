import { error, json } from '@sveltejs/kit';

export const GET = async ({ locals }) => {
    if (!locals.session) throw error(401, 'Not authenticated');
    return json({
        did: locals.session.did,
        syr_instance_url: locals.session.syrInstanceUrl,
        delegate_public_key: locals.session.delegatePublicKey,
        profile: locals.profile ?? null,
        role: locals.localUser?.role ?? 'USER'
    });
};
