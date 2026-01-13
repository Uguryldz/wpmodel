// ============================================
// API Client Base
// ============================================

import { API } from '../constants';
import type { ApiResponse } from '../types';

/**
 * Base API URL
 */
export function getApiUrl(): string {
  return API.BASE_URL || '';
}

/**
 * Generic fetch wrapper with error handling
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getApiUrl()}${endpoint}`;
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };
  
  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    // 204 No Content için boş response döndür
    if (response.status === 204) {
      return {} as T;
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error');
  }
}

/**
 * GET request
 */
export function apiGet<T = any>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: 'GET' });
}

/**
 * POST request
 */
export function apiPost<T = any>(endpoint: string, body?: any): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request
 */
export function apiPut<T = any>(endpoint: string, body?: any): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export function apiDelete<T = any>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: 'DELETE' });
}

/**
 * File upload (multipart/form-data)
 */
export async function apiUpload<T = any>(
  endpoint: string,
  formData: FormData
): Promise<T> {
  const url = `${getApiUrl()}${endpoint}`;
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

