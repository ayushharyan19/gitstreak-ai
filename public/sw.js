// GitStreak AI - Web Push Service Worker

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "GitStreak AI",
      body: event.data.text(),
    };
  }

  const title = payload.title || "GitStreak AI";
  const options = {
    body: payload.body || "Keep your streak going! Check your GitHub contributions.",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    data: {
      url: payload.url || "/dashboard",
      dateOfArrival: Date.now(),
    },
    tag: payload.tag || "gitstreak-reminder",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Enforce same-origin navigation for security
        let resolvedTarget;
        try {
          resolvedTarget = new URL(targetUrl, self.location.origin);
          if (resolvedTarget.origin !== self.location.origin) {
            resolvedTarget = new URL("/dashboard", self.location.origin);
          }
        } catch {
          resolvedTarget = new URL("/dashboard", self.location.origin);
        }

        // Check if an existing GitStreak AI window/tab is already open
        for (const client of windowClients) {
          try {
            const clientUrl = new URL(client.url, self.location.origin);
            if (clientUrl.origin === self.location.origin) {
              if ("focus" in client) {
                // If already on the destination page, just bring it to focus
                if (clientUrl.pathname === resolvedTarget.pathname) {
                  return client.focus();
                }
                // Otherwise navigate the existing tab to the target and focus
                if ("navigate" in client) {
                  return client.navigate(resolvedTarget.href).then((c) => c?.focus());
                }
                return client.focus();
              }
            }
          } catch {
            // Ignore URL parsing errors for individual clients and continue
          }
        }

        // If no tab is open on this origin, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(resolvedTarget.href);
        }
      })
  );
});
