import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import crypto from "crypto"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Génère un code aléatoire à 6 chiffres
export function generateValidationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Hash un code de validation avec SHA256
export function hashValidationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Vérifie si un code correspond au hash
export function verifyValidationCode(code: string, hash: string): boolean {
  return hashValidationCode(code) === hash
}
