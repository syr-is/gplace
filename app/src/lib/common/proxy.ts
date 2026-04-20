/**
 * Wrap any cross-origin asset URL through gplace's media proxy so the browser
 * fetches from our own origin (avoids Cloudflare Bot Fight Mode on remote
 * S3 subdomains, hotlinking protection, and IP leaks to federated instances).
 *
 * Same-origin URLs and relative paths pass through untouched.
 */
export function proxied(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('/')) return url;
    if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) return url;
    return `/api/v1/proxy?url=${encodeURIComponent(url)}`;
}
