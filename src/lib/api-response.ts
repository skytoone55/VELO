/**
 * Utilitaires pour standardiser les réponses API
 * Assure une cohérence dans tout le projet
 */

import { NextResponse } from 'next/server'

/**
 * Structure standard d'une réponse API réussie
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true
  data: T
  message?: string
}

/**
 * Structure standard d'une réponse API en erreur
 */
export interface ApiErrorResponse {
  success: false
  error: string
  code?: string
  details?: unknown
}

/**
 * Type union pour toutes les réponses API
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Créer une réponse de succès standardisée
 */
export function successResponse<T>(data: T, message?: string, status: number = 200): NextResponse {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  }

  if (message) {
    response.message = message
  }

  return NextResponse.json(response, { status })
}

/**
 * Créer une réponse d'erreur standardisée
 */
export function errorResponse(
  error: string | Error,
  status: number = 500,
  code?: string,
  details?: unknown
): NextResponse {
  const errorMessage = error instanceof Error ? error.message : error

  const response: ApiErrorResponse = {
    success: false,
    error: errorMessage,
  }

  if (code) {
    response.code = code
  }
  if (details !== undefined) {
    response.details = details
  }

  return NextResponse.json(response, { status })
}

/**
 * Codes d'erreur standardisés
 */
export const ErrorCodes = {
  // Auth errors (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Resource errors (404)
  NOT_FOUND: 'NOT_FOUND',
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // Business logic errors (422)
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  BLOCKED: 'BLOCKED',

  // External service errors (502/503)
  MONDAY_ERROR: 'MONDAY_ERROR',
  EMAIL_ERROR: 'EMAIL_ERROR',
  GEOCODING_ERROR: 'GEOCODING_ERROR',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * Raccourcis pour les erreurs courantes
 */
export const ApiErrors = {
  unauthorized: (message = 'Non autorisé') =>
    errorResponse(message, 401, ErrorCodes.UNAUTHORIZED),

  forbidden: (message = 'Accès refusé') =>
    errorResponse(message, 403, ErrorCodes.FORBIDDEN),

  notFound: (resource = 'Ressource') =>
    errorResponse(`${resource} non trouvé(e)`, 404, ErrorCodes.NOT_FOUND),

  validationError: (message: string, details?: unknown) =>
    errorResponse(message, 400, ErrorCodes.VALIDATION_ERROR, details),

  missingField: (field: string) =>
    errorResponse(`Le champ '${field}' est requis`, 400, ErrorCodes.MISSING_REQUIRED_FIELD),

  internalError: (error?: Error | string) =>
    errorResponse(
      error instanceof Error ? error.message : (error || 'Erreur serveur interne'),
      500,
      ErrorCodes.INTERNAL_ERROR
    ),
}
