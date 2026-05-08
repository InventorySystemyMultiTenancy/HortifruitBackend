import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { signToken } from "../config/jwt.js";

export async function login(req, res) {
  const { email, password } = req.validated.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    throw new ApiError("Credenciais inválidas", 401);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new ApiError("Credenciais inválidas", 401);
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
    shopId: user.shopId,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      shopId: user.shopId,
    },
  });
}
