export async function onRequest(context) {
  // 1. Get the path the user requested (e.g., "login" or "addonCollectionGet")
  const url = new URL(context.request.url);
  
  const targetPath = url.pathname.replace(/^\/api/, '');
  const targetUrl = `https://api.strem.io/api${targetPath}`;

  // 3. Create the secret request to Stremio
  const newRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });

  const response = await fetch(newRequest);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}