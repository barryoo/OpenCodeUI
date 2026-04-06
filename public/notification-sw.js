// ============================================
// Notification Service Worker
// ============================================
// 专门用于显示通知（Android Chrome 不支持 new Notification()）
// 不做缓存、不拦截 fetch，只处理通知相关事件

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data
  if (!data) return

  // 构建跳转 URL
  let url = '/'
  if (data.sessionId) {
    const dir = data.directory ? `?dir=${data.directory}` : ''
    url = `/#/session/${data.sessionId}${dir}`
  }

  const targetUrl = new URL(url, self.location.origin).toString()

  // 聚焦已有窗口或打开新窗口
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      const sameOriginClients = windowClients.filter((client) => client.url.startsWith(self.location.origin))
      const targetClient = sameOriginClients.find((client) => client.url.includes('/#/')) || sameOriginClients[0]

      if (targetClient) {
        if ('navigate' in targetClient) {
          try {
            await targetClient.navigate(targetUrl)
          } catch {
            // ignore navigate failures and fall back to postMessage-driven navigation
          }
        }

        targetClient.postMessage({
          type: 'notification-click',
          sessionId: data.sessionId,
          directory: data.directory,
        })

        if ('focus' in targetClient) {
          return targetClient.focus()
        }

        return targetClient
      }

      return clients.openWindow(targetUrl)
    })
  )
})
