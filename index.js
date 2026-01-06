/**
 * API 匿名转发代理
 * 部署平台: 腾讯云 EdgeOne 边缘函数
 */

const TARGET_HOST = "example.com"; // 替换为你的目标服务器域名
const TARGET_ORIGIN = "https://" + TARGET_HOST;

async function handleEvent(event) {
  const request = event.request;
  const url = new URL(request.url);

  // 1. 构建目标 URL
  // 将请求路径和参数直接拼接到鸽游服务器地址后
  const targetUrl = TARGET_ORIGIN + url.pathname + url.search;

  // 2. 处理请求头 (核心隐身逻辑)
  const newHeaders = new Headers(request.headers);

  // [伪装] 强制覆盖 Host，否则对方服务器会拒绝连接
  newHeaders.set("Host", TARGET_HOST);
  
  // [伪装] 覆盖 Origin 和 Referer，模拟官方客户端行为或防止跨域检查
  // 如果你的 Go 代码里发了这两个，这里会覆盖掉，保证安全
  newHeaders.set("Origin", TARGET_ORIGIN);
  newHeaders.set("Referer", TARGET_ORIGIN + "/");

  // [清洗] 删除所有可能暴露你原始 IP 的代理特征头
  // 这一步非常重要，防止 EdgeOne 自动透传你的 IP
  const sensitiveHeaders = [
    "X-Forwarded-For",
    "X-Real-IP",
    "Via",
    "Client-IP",
    "True-Client-IP",
    "X-Client-IP",
    "X-Cluster-Client-IP",
    "CF-Connecting-IP", // 防止使用了类似架构的头
    "X-EdgeOne-Client-IP" // 腾讯云特有头
  ];

  sensitiveHeaders.forEach(header => {
    newHeaders.delete(header);
  });

  // 3. 构建新请求
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.body, // 直接透传请求体 (JSON数据)
    redirect: "manual"  // 不自动跟随重定向，将重定向返回给你的Go处理
  });

  try {
    // 4. 发起请求
    const response = await fetch(proxyRequest);

    // 5. 处理响应
    // 创建一个新的响应对象返回，确保能够修改响应头（如果需要）
    const newResponseHeaders = new Headers(response.headers);
    
    // 可选：如果遇到跨域问题，可以在这里加 Access-Control-Allow-Origin
    // newResponseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newResponseHeaders
    });

  } catch (err) {
    // 错误处理
    return new Response(JSON.stringify({
      error: "Proxy Error",
      message: err.message
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// 监听 fetch 事件
addEventListener('fetch', event => {
  event.respondWith(handleEvent(event));
});