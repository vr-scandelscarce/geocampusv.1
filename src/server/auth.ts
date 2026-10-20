import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole, User } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'geocampus-secret-jwt-token-key-2026-auth';
const TOKEN_EXPIRY = '8h';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  department?: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function generateToken(user: User): string {
  const payload: AuthUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
    email: user.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed authorization header. Please log in.' });
    return;
  }

  const token = header.substring(7).trim();
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    return;
  }

  req.user = decoded;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access forbidden: This action requires one of the following roles: [${roles.join(', ')}]. Your role is ${req.user.role}.`,
      });
      return;
    }

    next();
  };
}
