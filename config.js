export async function loadConfig() {
  const response=await fetch(new URL('./api/config',import.meta.url),{
    cache:'no-store',signal:AbortSignal.timeout(7000)
  });
  if(!response.ok) return null;
  const {url,key}=await response.json();
  return typeof url==='string' && url.startsWith('https://') && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key) ? {url,key} : null;
}
