module.exports = (req, res) => {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).end();
  const url=process.env.SUPABASE_URL?.trim();
  const key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  try {
    const endpoint=new URL(url);
    if(endpoint.protocol==='https:' && !endpoint.username && !endpoint.password && endpoint.pathname==='/' &&
       !endpoint.search && !endpoint.hash && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      return res.status(200).json({url:endpoint.origin,key});
    }
  } catch {}
  return res.status(200).json({url:'',key:''});
};
