const MANAGEMENT_ROLES = ['dev', 'ceo', 'director', 'manager'];
const ADMIN_ROLES = ['dev', 'ceo', 'director'];

export function isManagement(role) {
  return MANAGEMENT_ROLES.includes(role);
}

export function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

export function isCeo(role) {
  return role === 'ceo' || role === 'dev';
}

export function isDev(role) {
  return role === 'dev';
}
