const MANAGEMENT_ROLES = ['ceo', 'director', 'manager'];
const ADMIN_ROLES = ['ceo', 'director'];

export function isManagement(role) {
  return MANAGEMENT_ROLES.includes(role);
}

export function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

export function isCeo(role) {
  return role === 'ceo';
}
