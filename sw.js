const CACHE_VERSION = 'statvault-v4';
const STATIC_CACHE = 'statvault-static-v4';
const DATA_CACHE = 'statvault-data-v4';

// App shell — always cached for offline use
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/data.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap'
];

// API patterns that should use stale-while-revalidate
const API_PATTERNS = [
    /\/api\/espn/,
    /\/api\/odds/,
    /\/api\/scout/
];

// Max age for cached API data (in ms)
const API_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const SCOREBOARD_MAX_AGE = 5 * 60 * 1000; // 5 minutes for live scores

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // API requests: stale-while-revalidate with age limits
    if (API_PATTERNS.some(p => p.test(url.pathname))) {
        e.respondWith(handleApiRequest(e.request));
        return;
    }

    // Static assets: cache-first, fallback to network
    if (isStaticAsset(url)) {
        e.respondWith(handleStaticRequest(e.request));
        return;
    }

    // Navigation (HTML pages): network-first, fallback to cache
    if (e.request.mode === 'navigate') {
        e.respondWith(handleNavigationRequest(e.request));
        return;
    }

    // Everything else: network-first with cache fallback
    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(STATIC_CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});

function isStaticAsset(url) {
    return /\.(css|js|json|svg|png|jpg|jpeg|webp|woff2?|ttf)$/i.test(url.pathname) ||
           url.hostname === 'fonts.googleapis.com' ||
           url.hostname === 'fonts.gstatic.com';
}

async function handleStaticRequest(request) {
    const cached = await caches.match(request);
    if (cached) {
        // Refresh in background
        fetch(request).then(res => {
            if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(request, res));
        }).catch(() => {});
        return cached;
    }
    try {
        const res = await fetch(request);
        if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
        }
        return res;
    } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
    }
}

async function handleNavigationRequest(request) {
    try {
        const res = await fetch(request);
        if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
        }
        return res;
    } catch {
        const cached = await caches.match('/index.html');
        return cached || new Response('<h1>Offline</h1><p>StatVault is unavailable offline.</p>', {
            headers: { 'Content-Type': 'text/html' }
        });
    }
}

async function handleApiRequest(request) {
    const url = new URL(request.url);
    const isScoreboard = url.searchParams.get('endpoint') === 'scoreboard';
    const maxAge = isScoreboard ? SCOREBOARD_MAX_AGE : API_MAX_AGE;

    // Check cache first
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(request);

    if (cached) {
        const cachedDate = cached.headers.get('sw-cached-at');
        const age = cachedDate ? Date.now() - parseInt(cachedDate) : Infinity;

        // Return cached if fresh enough
        if (age < maxAge) {
            // Still refresh in background
            fetchAndCache(request, cache);
            return cached;
        }
    }

    // Try network
    try {
        return await fetchAndCache(request, cache);
    } catch {
        // Return stale cache if available
        if (cached) {
            return cached;
        }
        return new Response(JSON.stringify({
            error: 'Offline — no cached data available',
            offline: true
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function fetchAndCache(request, cache) {
    const res = await fetch(request);
    if (res.ok) {
        const body = await res.arrayBuffer();
        const headers = new Headers(res.headers);
        headers.set('sw-cached-at', Date.now().toString());

        const cachedResponse = new Response(body, {
            status: res.status,
            statusText: res.statusText,
            headers
        });
        cache.put(request, cachedResponse.clone());
        return cachedResponse;
    }
    return res;
}

// Listen for messages from the app
self.addEventListener('message', e => {
    if (e.data === 'skipWaiting') self.skipWaiting();
    if (e.data === 'clearDataCache') {
        caches.delete(DATA_CACHE);
    }
});
