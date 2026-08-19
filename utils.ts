import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escapes special HTML characters to prevent XSS injection attacks.
 */
export function escapeHtml(unsafe: any): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes image URLs to only allow valid http, https, or data URLs.
 */
export function sanitizeImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp);base64,/i.test(trimmed)) {
    return trimmed.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  return null;
}

