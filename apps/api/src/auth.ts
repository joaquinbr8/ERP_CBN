import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Global,
  Module,
} from "@nestjs/common";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { Db } from "./db";
export function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(value, salt, 64).toString("hex");
}
export function verifyPassword(value: string, hash: string) {
  const [salt, key] = hash.split(":");
  const expected = Buffer.from(key, "hex");
  return timingSafeEqual(scryptSync(value, salt, 64), expected);
}
const secret = process.env.JWT_SECRET || randomBytes(48).toString("hex");
export function token(user: any) {
  return jwt.sign({ sub: user.id }, secret, { expiresIn: "8h" });
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private db: Db) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    try {
      const decoded = jwt.verify(
        (req.headers.authorization || "").replace(/^Bearer /, ""),
        secret,
      ) as any;
      const [u] = await this.db.rows(
        "SELECT u.id,u.username,u.name,u.role_id,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.active=true",
        [decoded.sub],
      );
      if (!u) throw new Error();
      req.user = u;
      return true;
    } catch {
      throw new UnauthorizedException(
        "Sesión inválida. Inicia sesión nuevamente.",
      );
    }
  }
}
export function permit(user: any, p: string) {
  if (!user.permissions.includes("*") && !user.permissions.includes(p))
    throw new ForbiddenException("Tu rol no permite esta acción: " + p);
}
@Global()
@Module({ providers: [AuthGuard], exports: [AuthGuard] })
export class SecurityModule {}
