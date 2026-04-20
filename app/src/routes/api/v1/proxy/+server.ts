import { error } from '@sveltejs/kit';
import { safeProxyUrl } from '$lib/server/syr';

// Federated media proxy: avatars / banners come from each user's syr instance
// (often s3.<instance>). Browsers fetching cross-origin can be blocked by
// Cloudflare Bot Fight Mode on that S3 subdomain, hotlinking protection, or
// just leak the end-user's IP to the remote syr instance. Routing through
// this endpoint makes every fetch same-origin and validates the upstream URL
// against safeUrl (no SSRF to private/loopback hosts in production).

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPE = /^(image|video|audio)\//i;

export const GET = async ({ url, setHeaders }) => {
    const target = url.searchParams.get('url');
    if (!target) throw error(400, 'Missing url parameter');

    const parsed = safeProxyUrl(target);
    if (!parsed) throw error(400, 'Invalid or disallowed url');

    let upstream: Response;
    try {
        upstream = await fetch(parsed, {
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                Accept: '*/*',
                'User-Agent': 'gplace-proxy/1.0'
            }
        });
    } catch {
        throw error(502, 'Upstream fetch failed');
    }

    if (!upstream.ok) throw error(upstream.status >= 400 ? upstream.status : 502, 'Upstream error');

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!ALLOWED_CONTENT_TYPE.test(contentType)) {
        throw error(415, 'Unsupported content type');
    }

    const contentLength = upstream.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_BYTES) {
        throw error(413, 'Upstream too large');
    }

    setHeaders({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff'
    });

    return new Response(upstream.body, { status: 200 });
};
