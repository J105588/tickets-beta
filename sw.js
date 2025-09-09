// sw.js - 静的資産キャッシュとオフライン表示の強化版
const CACHE_NAME = 'tickets-static-v4';
const ASSETS = [
	'./',
	'./index.html',
	'./timeslot.html',
	'./seats.html',
	'./walkin.html',
	'./styles.css',
	'./sidebar.css',
	'./seats.css',
	'./walkin.css',
	'./index-main.js',
	'./timeslot-main.js',
	'./seats-main.js',
	'./walkin-main.js',
	'./sidebar.js',
	'./api.js',
	'./config.js',
	'./timeslot-schedules.js',
	'./system-lock.js',
	'./offline-sync.js',
	'./offline-sync-v2.js',
	'./offline-sync-v2.css',
	'./sw.js'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(async cache => {
				try { await cache.addAll(ASSETS); } catch (_) {}
				try { await cache.addAll(['./index.html?prefetch=1','./seats.html?prefetch=1','./timeslot.html?prefetch=1','./walkin.html?prefetch=1']); } catch (_) {}
			})
			.catch(() => {})
	);
	// 即時有効化
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))))
	);
	// 既存クライアントへ即適用
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);

	// ナビゲーション(HTML)はキャッシュ優先で提供
	if (req.mode === 'navigate') {
		event.respondWith(
			caches.match(req, { ignoreSearch: true })
				.then(cached => {
					if (cached) return cached;
					// 初回アクセス時はネットワーク→キャッシュ化
					return fetch(req)
						.then(res => {
							try { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {}); } catch (_) {}
							return res;
						})
						.catch(() => {
							// フォールバック: 既知ページのいずれか
							return caches.match('./seats.html') || caches.match('./index.html');
						});
				})
		);
		return;
	}

	// 同一オリジンのGETリクエストのみキャッシュ（スクリプト/スタイル/画像等）
	if (req.method !== 'GET' || url.origin !== self.location.origin) {
		return;
	}

	// 静的資産はキャッシュ優先（stale-while-revalidate）
	event.respondWith(
		caches.match(req).then(cached => {
			const fetchPromise = fetch(req)
				.then(res => {
					try { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {}); } catch (_) {}
					return res;
				})
				.catch(() => cached || new Response('', { status: 504 }));
			return cached || fetchPromise;
		})
	);
});


