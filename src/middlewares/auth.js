import { ApiError } from "../utils/apiError.js";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../config/jwt.js";

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new ApiError("Token não informado", 401);
  }

  const token = header.slice(7);
  const payload = verifyToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      shopId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new ApiError("Usuário inválido ou inativo", 401);
  }

  req.user = user;
  next();
}

export function authorizeRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError("Sem permissão para executar esta ação", 403);
    }

    next();
  };
}
