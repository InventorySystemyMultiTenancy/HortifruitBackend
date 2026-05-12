import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("123456", 10);
  const workerPassword = await bcrypt.hash("123456", 10);

  const company = await prisma.company.upsert({
    where: { ownerEmail: "admin@hortifruit.com" },
    update: {
      name: "Hortifruit Venda Direta",
      ownerName: "Administrador Principal",
    },
    create: {
      name: "Hortifruit Venda Direta",
      document: "00000000000199",
      ownerName: "Administrador Principal",
      ownerEmail: "admin@hortifruit.com",
    },
  });

  const lojaCentro = await prisma.shop.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: "Loja Centro",
      },
    },
    update: {
      code: "CTR-01",
      city: "São Paulo",
      isActive: true,
    },
    create: {
      companyId: company.id,
      name: "Loja Centro",
      code: "CTR-01",
      city: "São Paulo",
      isActive: true,
    },
  });

  const lojaZonaSul = await prisma.shop.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: "Loja Zona Sul",
      },
    },
    update: {
      code: "ZS-02",
      city: "São Paulo",
      isActive: true,
    },
    create: {
      companyId: company.id,
      name: "Loja Zona Sul",
      code: "ZS-02",
      city: "São Paulo",
      isActive: true,
    },
  });

  const plantation = await prisma.plantation.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: "Plantação Serra Verde",
      },
    },
    update: {
      location: "Ibiúna - SP",
      isActive: true,
    },
    create: {
      companyId: company.id,
      name: "Plantação Serra Verde",
      location: "Ibiúna - SP",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@hortifruit.com" },
    update: {
      name: "Administrador Principal",
      role: "ADMIN",
      companyId: company.id,
      shopId: null,
      passwordHash: adminPassword,
      isActive: true,
    },
    create: {
      name: "Administrador Principal",
      email: "admin@hortifruit.com",
      role: "ADMIN",
      companyId: company.id,
      passwordHash: adminPassword,
      isActive: true,
    },
  });

  const workerUser = await prisma.user.upsert({
    where: { email: "funcionario@hortifruit.com" },
    update: {
      name: "Funcionário Loja Centro",
      role: "WORKER",
      companyId: company.id,
      shopId: lojaCentro.id,
      passwordHash: workerPassword,
      isActive: true,
    },
    create: {
      name: "Funcionário Loja Centro",
      email: "funcionario@hortifruit.com",
      role: "WORKER",
      companyId: company.id,
      shopId: lojaCentro.id,
      passwordHash: workerPassword,
      isActive: true,
    },
  });

  await prisma.userShopAssignment.deleteMany({
    where: { userId: workerUser.id },
  });

  await prisma.userShopAssignment.create({
    data: {
      userId: workerUser.id,
      shopId: lojaCentro.id,
    },
  });

  const productTomate = await prisma.product.upsert({
    where: { name: "Tomate" },
    update: {
      unit: "KG",
      suggestedPrice: 8.5,
      sku: "TOM-001",
      isActive: true,
    },
    create: {
      name: "Tomate",
      unit: "KG",
      suggestedPrice: 8.5,
      sku: "TOM-001",
      isActive: true,
    },
  });

  const productAlface = await prisma.product.upsert({
    where: { name: "Alface" },
    update: {
      unit: "UNIT",
      suggestedPrice: 3.5,
      sku: "ALF-002",
      isActive: true,
    },
    create: {
      name: "Alface",
      unit: "UNIT",
      suggestedPrice: 3.5,
      sku: "ALF-002",
      isActive: true,
    },
  });

  await prisma.cost.upsert({
    where: { id: `${company.id}-cost-fixed-aluguel` },
    update: {
      companyId: company.id,
      name: "Aluguel",
      nature: "FIXED",
      scope: "COMPANY",
      amount: 3000,
      startsAt: new Date("2026-05-01T00:00:00.000Z"),
      endsAt: new Date("2026-05-31T23:59:59.999Z"),
      isActive: true,
    },
    create: {
      id: `${company.id}-cost-fixed-aluguel`,
      companyId: company.id,
      name: "Aluguel",
      nature: "FIXED",
      scope: "COMPANY",
      amount: 3000,
      startsAt: new Date("2026-05-01T00:00:00.000Z"),
      endsAt: new Date("2026-05-31T23:59:59.999Z"),
      isActive: true,
    },
  });

  await prisma.cost.upsert({
    where: { id: `${company.id}-cost-variable-frete` },
    update: {
      companyId: company.id,
      name: "Frete semanal",
      nature: "VARIABLE",
      scope: "SHOP",
      amount: 420,
      shopId: lojaCentro.id,
      dueDate: new Date("2026-05-07T00:00:00.000Z"),
      isActive: true,
    },
    create: {
      id: `${company.id}-cost-variable-frete`,
      companyId: company.id,
      name: "Frete semanal",
      nature: "VARIABLE",
      scope: "SHOP",
      amount: 420,
      shopId: lojaCentro.id,
      dueDate: new Date("2026-05-07T00:00:00.000Z"),
      isActive: true,
    },
  });

  await prisma.stockMovement.upsert({
    where: { id: `${company.id}-stock-001` },
    update: {
      companyId: company.id,
      productId: productTomate.id,
      plantationId: plantation.id,
      shopId: lojaCentro.id,
      quantity: 120,
      unitCost: 5.4,
      movementDate: new Date("2026-05-08T11:00:00.000Z"),
      notes: "Remessa semanal de tomate para loja centro",
    },
    create: {
      id: `${company.id}-stock-001`,
      companyId: company.id,
      productId: productTomate.id,
      plantationId: plantation.id,
      shopId: lojaCentro.id,
      quantity: 120,
      unitCost: 5.4,
      movementDate: new Date("2026-05-08T11:00:00.000Z"),
      notes: "Remessa semanal de tomate para loja centro",
    },
  });

  await prisma.dailyClose.upsert({
    where: {
      shopId_closeDate: {
        shopId: lojaCentro.id,
        closeDate: new Date("2026-05-08T00:00:00.000Z"),
      },
    },
    update: {
      companyId: company.id,
      openingAmount: 150,
      replenishment: 500,
      losses: 60,
      sales: 930,
      finalBalance: -340,
      status: "CLOSED",
      notes: "Fechamento seed para demonstração",
    },
    create: {
      companyId: company.id,
      shopId: lojaCentro.id,
      closeDate: new Date("2026-05-08T00:00:00.000Z"),
      openingAmount: 150,
      replenishment: 500,
      losses: 60,
      sales: 930,
      finalBalance: -340,
      status: "CLOSED",
      notes: "Fechamento seed para demonstração",
    },
  });

  await prisma.dailyClose.upsert({
    where: {
      shopId_closeDate: {
        shopId: lojaZonaSul.id,
        closeDate: new Date("2026-05-08T00:00:00.000Z"),
      },
    },
    update: {
      companyId: company.id,
      openingAmount: 210,
      replenishment: 420,
      losses: 35,
      sales: 870,
      finalBalance: -275,
      status: "CLOSED",
      notes: "Fechamento da loja zona sul",
    },
    create: {
      companyId: company.id,
      shopId: lojaZonaSul.id,
      closeDate: new Date("2026-05-08T00:00:00.000Z"),
      openingAmount: 210,
      replenishment: 420,
      losses: 35,
      sales: 870,
      finalBalance: -275,
      status: "CLOSED",
      notes: "Fechamento da loja zona sul",
    },
  });

  const dailyCloseCentro = await prisma.dailyClose.findUnique({
    where: {
      shopId_closeDate: {
        shopId: lojaCentro.id,
        closeDate: new Date("2026-05-08T00:00:00.000Z"),
      },
    },
  });

  await prisma.dailyCloseItem.deleteMany({
    where: {
      dailyCloseId: dailyCloseCentro.id,
    },
  });

  await prisma.dailyCloseItem.createMany({
    data: [
      {
        dailyCloseId: dailyCloseCentro.id,
        productId: productTomate.id,
        kind: "VENDA",
        amount: 590,
        quantity: 69.4,
      },
      {
        dailyCloseId: dailyCloseCentro.id,
        productId: productAlface.id,
        kind: "PERDA",
        amount: 60,
        quantity: 17,
      },
    ],
  });

  console.log("Seed finalizado.");
  console.log("Admin -> admin@hortifruit.com / 123456");
  console.log("Funcionário -> funcionario@hortifruit.com / 123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
