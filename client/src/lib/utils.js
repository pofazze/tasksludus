import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function proxyMediaUrl(url) {
  if (!url) return url;

  // Already proxied — don't double-proxy
  if (url.includes('/media-proxy')) return url;

  // Google Drive view links → direct thumbnail
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w800`;
  }

  // ClickUp attachments → proxy through our server
  if (url.includes('clickup-attachments.com') || url.includes('clickup.com/')) {
    return `${API_URL}/instagram/media-proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0);
}
