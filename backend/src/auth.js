const { supabase } = require('./supabaseClient');

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer ', '').trim();
}

async function getAuthenticatedUser(req) {
  if (!supabase) {
    return { user: null, profile: null, error: new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.') };
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return { user: null, profile: null, error: new Error('Missing Bearer token.') };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return { user: null, profile: null, error: userError || new Error('User not authenticated.') };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    return { user, profile: null, error: profileError };
  }

  return { user, profile, error: null };
}

async function requireAdmin(req, res, next) {
  const { user, profile, error } = await getAuthenticatedUser(req);

  if (error || !user || !profile) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  req.user = user;
  req.profile = profile;
  return next();
}

module.exports = {
  getAuthenticatedUser,
  requireAdmin,
};
