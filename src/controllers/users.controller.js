import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

async function ensureShopsBelongToCompany(companyId, shopIds) {
  if (!shopIds.length) return;

  const shops = await prisma.shop.findMany({
    where: {
      id: { in: shopIds },
      companyId,
      isActive: true,
    },
    select: { id: true },
  });

  if (shops.length !== shopIds.length) {
    throw new ApiError("Uma ou mais lojas informadas são inválidas", 422);
  }
}

function sanitizeUser(user) {
  const linkedShops = user.shopLinks.map((item) => item.shop);
  const fallbackPrimaryShop =
    user.shop && !linkedShops.some((shop) => shop.id === user.shop.id)
      ? [user.shop]
      : [];
  const shops = [...linkedShops, ...fallbackPrimaryShop];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    companyId: user.companyId,
    primaryShopId: user.shopId,
    shopIds: [...new Set(shops.map((shop) => shop.id))],
    shops,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listUsers(req, res) {
  const includeInactive = req.validated.query.includeInactive === true;

  const users = await prisma.user.findMany({
    where: {
      companyId: req.user.companyId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      shop: true,
      shopLinks: {
        include: {
          shop: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(users.map(sanitizeUser));
}

export async function createUser(req, res) {
  const {
    name,
    email,
    password,
    role = "WORKER",
    shopIds = [],
    isActive,
  } = req.validated.body;

  const distinctShopIds = [...new Set(shopIds)];

  if (role === "WORKER" && distinctShopIds.length === 0) {
    throw new ApiError("Funcionário deve ter ao menos uma loja vinculada", 422);
  }

  await ensureShopsBelongToCompany(req.user.companyId, distinctShopIds);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError("E-mail já cadastrado", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const created = await prisma.user.create({
    data: {
      companyId: req.user.companyId,
      name,
      email,
      passwordHash,
      role,
      isActive: isActive ?? true,
      shopId: role === "WORKER" ? distinctShopIds[0] || null : null,
      ...(role === "WORKER" && distinctShopIds.length
        ? {
            shopLinks: {
              createMany: {
                data: distinctShopIds.map((shopId) => ({ shopId })),
              },
            },
          }
        : {}),
    },
    include: {
      shop: true,
      shopLinks: {
        include: {
          shop: true,
        },
      },
    },
  });

  res.status(201).json(sanitizeUser(created));
}

export async function updateUser(req, res) {
  const { id } = req.validated.params;
  const { name, password, role, shopIds, isActive } = req.validated.body;

  const user = await prisma.user.findFirst({
    where: { id, companyId: req.user.companyId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new ApiError("Usuário não encontrado", 404);
  }

  const nextRole = role || user.role;
  const hasShopUpdate = Array.isArray(shopIds);
  const distinctShopIds = hasShopUpdate ? [...new Set(shopIds)] : null;

  if (nextRole === "WORKER" && hasShopUpdate && distinctShopIds.length === 0) {
    throw new ApiError("Funcionário deve ter ao menos uma loja vinculada", 422);
  }

  if (hasShopUpdate) {
    await ensureShopsBelongToCompany(req.user.companyId, distinctShopIds);
  }

  const data = {
    ...(name !== undefined ? { name } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(password
      ? {
          passwordHash: await bcrypt.hash(password, 10),
        }
      : {}),
  };

  if (nextRole === "ADMIN") {
    data.shopId = null;
  } else if (hasShopUpdate) {
    data.shopId = distinctShopIds[0] || null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data,
    });

    if (nextRole === "ADMIN") {
      await tx.userShopAssignment.deleteMany({ where: { userId: id } });
    } else if (hasShopUpdate) {
      await tx.userShopAssignment.deleteMany({ where: { userId: id } });
      if (distinctShopIds.length) {
        await tx.userShopAssignment.createMany({
          data: distinctShopIds.map((shopId) => ({ userId: id, shopId })),
        });
      }
    }

    return tx.user.findUnique({
      where: { id },
      include: {
        shop: true,
        shopLinks: {
          include: {
            shop: true,
          },
        },
      },
    });
  });

  res.json(sanitizeUser(updated));
}
