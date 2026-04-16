const MANAGEMENT = ['ceo', 'director', 'manager'];

function reportsAuth(feature) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Not authenticated' });
    if (role === 'dev') return next();
    if (MANAGEMENT.includes(role)) return next();

    if (feature === 'quality' || feature === 'capacity') {
      if (role === 'producer') {
        req.query.producerId = req.user.id;
        return next();
      }
      return res.status(403).json({ error: 'Reports: feature not available for this role' });
    }

    if (feature === 'client') {
      if (role === 'account_manager') {
        req._scopedAccountManagerId = req.user.id;
        return next();
      }
      return res.status(403).json({ error: 'Reports: client feature restricted to management and account managers' });
    }

    return res.status(403).json({ error: 'Reports: access denied' });
  };
}

module.exports = { reportsAuth };
