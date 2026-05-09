import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { calculateFinalBalance } from "../utils/calculateFinalBalance.js";

const AUDIT_MARKER = "[AUDIT_TRAIL_JSON]";
const FLOAT_EPS = 0.000001;

function decimal(value) {
  return new Prisma.Decimal(value || 0);
}

function asNumber(value) {
  return Number(value || 0);
}

function mapManualItems(items) {
  if (!items) return undefined;
  return {
    deleteMany: {},
    create: items.map((item) => ({
      productId: item.productId || null,
      kind: item.kind,
      amount: decimal(item.amount),
      quantity: item.quantity == null ? null : decimal(item.quantity),
    })),
  };
}

function closeDateValue(dateLike) {
  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseNotesWithAudit(rawNotes) {
  if (!rawNotes) {
    return { userNotes: "", auditTrail: [] };
  }

  const markerIndex = rawNotes.indexOf(AUDIT_MARKER);

  if (markerIndex === -1) {
    return {
      userNotes: rawNotes,
      auditTrail: [],
    };
  }

  const userNotes = rawNotes.slice(0, markerIndex).trimEnd();
  const jsonChunk = rawNotes.slice(markerIndex + AUDIT_MARKER.length).trim();

  try {
    const parsed = JSON.parse(jsonChunk);
    return {
      userNotes,
      auditTrail: Array.isArray(parsed) ? parsed : [],
    };
  } catch {
    return {
      userNotes,
      auditTrail: [],
    };
  }
}

function composeNotesWithAudit(userNotes, auditTrail) {
  const notes = (userNotes || "").trim();

  if (!auditTrail?.length) {
    return notes || null;
  }

  const json = JSON.stringify(auditTrail);

  if (!notes) {
    return `${AUDIT_MARKER}\n${json}`;
  }

  return `${notes}\n\n${AUDIT_MARKER}\n${json}`;
}

function snapshotByProduct(items = []) {
  const snapshot = new Map();

  for (const item of items) {
    if (!item.productId) continue;

    const current = snapshot.get(item.productId) || {
      soldQuantity: 0,
      lossQuantity: 0,
      remainingQuantity: 0,
    };

    const quantity = asNumber(item.quantity);

    if (item.kind === "VENDA") {
      current.soldQuantity = quantity;
    }

    if (item.kind === "PERDA") {
      current.lossQuantity = quantity;
    }

    if (item.kind === "ESTOQUE_FINAL") {
      current.remainingQuantity = quantity;
    }

    snapshot.set(item.productId, current);
  }

  return snapshot;
}

function buildAuditChanges(beforeSnapshot, afterSnapshot) {
  const productIds = new Set([
    ...beforeSnapshot.keys(),
    ...afterSnapshot.keys(),
  ]);

  const changes = [];

  for (const productId of productIds) {
    const before = beforeSnapshot.get(productId) || {
      soldQuantity: 0,
      lossQuantity: 0,
      remainingQuantity: 0,
    };
    const after = afterSnapshot.get(productId) || {
      soldQuantity: 0,
      lossQuantity: 0,
      remainingQuantity: 0,
    };

    const hasDifference =
      Math.abs(before.soldQuantity - after.soldQuantity) > FLOAT_EPS ||
      Math.abs(before.lossQuantity - after.lossQuantity) > FLOAT_EPS ||
      Math.abs(before.remainingQuantity - after.remainingQuantity) > FLOAT_EPS;

    if (!hasDifference) {
      continue;
    }

    changes.push({
      productId,
      before,
      after,
    });
  }

  return changes;
}

async function getCurrentStockByProduct({ companyId, shopId, productIds }) {
  if (!productIds.length) {
    return new Map();
  }

  const groupedStock = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: {
      companyId,
      shopId,
      productId: { in: productIds },
    },
    _sum: { quantity: true },
  });

  return new Map(
    groupedStock.map((row) => [row.productId, asNumber(row._sum.quantity)]),
  );
}

async function getProductsByIds(productIds) {
  if (!productIds.length) {
    return new Map();
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true, name: true, unit: true, suggestedPrice: true },
  });

  return new Map(products.map((product) => [product.id, product]));
}

async function buildProductClosePayload({ companyId, shopId, productEntries }) {
  if (!productEntries?.length) {
    return {
      closeItems: undefined,
      movementRows: [],
    };
  }

  const productIds = [
    ...new Set(productEntries.map((entry) => entry.productId)),
  ];

  const [productMap, stockMap] = await Promise.all([
    getProductsByIds(productIds),
    getCurrentStockByProduct({ companyId, shopId, productIds }),
  ]);

  const closeItems = [];
  const movementRows = [];

  for (const entry of productEntries) {
    const product = productMap.get(entry.productId);

    if (!product) {
      throw new ApiError("Produto inválido no fechamento diário", 400);
    }

    const soldQuantity = asNumber(entry.soldQuantity);
    const lossQuantity = asNumber(entry.lossQuantity);
    const totalOut = soldQuantity + lossQuantity;
    const available = stockMap.get(entry.productId) ?? 0;

    if (totalOut > available) {
      throw new ApiError(
        `Estoque insuficiente para ${product.name}. Disponível: ${available.toFixed(3)}, saída solicitada: ${totalOut.toFixed(3)}`,
        400,
      );
    }

    const autoRemaining = available - totalOut;
    const remainingQuantity =
      entry.remainingQuantity == null
        ? autoRemaining
        : asNumber(entry.remainingQuantity);

    if (remainingQuantity < 0) {
      throw new ApiError(
        `Saldo final negativo para ${product.name}. Ajuste venda/perda ou estoque informado.`,
        400,
      );
    }

    const suggestedPrice = asNumber(product.suggestedPrice);

    if (soldQuantity > 0) {
      closeItems.push({
        productId: product.id,
        kind: "VENDA",
        amount: decimal(soldQuantity * suggestedPrice),
        quantity: decimal(soldQuantity),
      });

      movementRows.push({
        productId: product.id,
        quantity: decimal(-soldQuantity),
        unitCost: decimal(suggestedPrice),
        noteType: "VENDA",
      });
    }

    if (lossQuantity > 0) {
      closeItems.push({
        productId: product.id,
        kind: "PERDA",
        amount: decimal(lossQuantity * suggestedPrice),
        quantity: decimal(lossQuantity),
      });

      movementRows.push({
        productId: product.id,
        quantity: decimal(-lossQuantity),
        unitCost: decimal(suggestedPrice),
        noteType: "PERDA",
      });
    }

    closeItems.push({
      productId: product.id,
      kind: "ESTOQUE_FINAL",
      amount: decimal(0),
      quantity: decimal(remainingQuantity),
    });
  }

  return { closeItems, movementRows };
}

async function buildProductClosePayloadForUpdate({
  companyId,
  shopId,
  productEntries,
  existingCloseId,
}) {
  if (!productEntries?.length) {
    return {
      closeItems: undefined,
      movementRows: [],
    };
  }

  const productIds = [
    ...new Set(productEntries.map((entry) => entry.productId)),
  ];

  const [productMap, stockMap, previousMovements] = await Promise.all([
    getProductsByIds(productIds),
    getCurrentStockByProduct({ companyId, shopId, productIds }),
    prisma.stockMovement.findMany({
      where: {
        companyId,
        shopId,
        notes: {
          startsWith: `DAILY_CLOSE:${existingCloseId}:`,
        },
      },
      select: {
        productId: true,
        quantity: true,
      },
    }),
  ]);

  const previousByProduct = previousMovements.reduce((acc, row) => {
    const current = acc.get(row.productId) ?? 0;
    acc.set(row.productId, current + asNumber(row.quantity));
    return acc;
  }, new Map());

  const closeItems = [];
  const movementRows = [];

  for (const entry of productEntries) {
    const product = productMap.get(entry.productId);

    if (!product) {
      throw new ApiError("Produto inválido no fechamento diário", 400);
    }

    const soldQuantity = asNumber(entry.soldQuantity);
    const lossQuantity = asNumber(entry.lossQuantity);
    const totalOut = soldQuantity + lossQuantity;
    const rawAvailable = stockMap.get(entry.productId) ?? 0;
    const previouslyRemoved = Math.abs(
      previousByProduct.get(entry.productId) ?? 0,
    );
    const available = rawAvailable + previouslyRemoved;

    if (totalOut > available) {
      throw new ApiError(
        `Estoque insuficiente para ${product.name}. Disponível: ${available.toFixed(3)}, saída solicitada: ${totalOut.toFixed(3)}`,
        400,
      );
    }

    const autoRemaining = available - totalOut;
    const remainingQuantity =
      entry.remainingQuantity == null
        ? autoRemaining
        : asNumber(entry.remainingQuantity);

    if (remainingQuantity < 0) {
      throw new ApiError(
        `Saldo final negativo para ${product.name}. Ajuste venda/perda ou estoque informado.`,
        400,
      );
    }

    const suggestedPrice = asNumber(product.suggestedPrice);

    if (soldQuantity > 0) {
      closeItems.push({
        productId: product.id,
        kind: "VENDA",
        amount: decimal(soldQuantity * suggestedPrice),
        quantity: decimal(soldQuantity),
      });

      movementRows.push({
        productId: product.id,
        quantity: decimal(-soldQuantity),
        unitCost: decimal(suggestedPrice),
        noteType: "VENDA",
      });
    }

    if (lossQuantity > 0) {
      closeItems.push({
        productId: product.id,
        kind: "PERDA",
        amount: decimal(lossQuantity * suggestedPrice),
        quantity: decimal(lossQuantity),
      });

      movementRows.push({
        productId: product.id,
        quantity: decimal(-lossQuantity),
        unitCost: decimal(suggestedPrice),
        noteType: "PERDA",
      });
    }

    closeItems.push({
      productId: product.id,
      kind: "ESTOQUE_FINAL",
      amount: decimal(0),
      quantity: decimal(remainingQuantity),
    });
  }

  return { closeItems, movementRows };
}

export async function upsertDailyClose({ id, data, user }) {
  const finalBalance = data.finalBalance ?? calculateFinalBalance(data);
  const companyId = data.companyId || user.companyId;
  const shopId = user.role === "ADMIN" ? data.shopId : user.shopId;

  if (user.role !== "ADMIN" && data.shopId && data.shopId !== user.shopId) {
    throw new ApiError(
      "Funcionário só pode lançar fechamento na própria loja",
      403,
    );
  }

  if (id) {
    const existing = await prisma.dailyClose.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!existing) {
      throw new ApiError("Fechamento não encontrado", 404);
    }

    if (user.role !== "ADMIN" && existing.shopId !== user.shopId) {
      throw new ApiError(
        "Funcionário só pode alterar o fechamento da própria loja",
        403,
      );
    }

    const parsedExisting = parseNotesWithAudit(existing.notes);
    const nextUserNotes =
      data.notes !== undefined && data.notes !== null
        ? String(data.notes)
        : parsedExisting.userNotes;

    if (data.productEntries?.length) {
      const { closeItems, movementRows } =
        await buildProductClosePayloadForUpdate({
          companyId: existing.companyId,
          shopId: existing.shopId,
          productEntries: data.productEntries,
          existingCloseId: id,
        });

      const beforeSnapshot = snapshotByProduct(existing.items);
      const afterSnapshot = snapshotByProduct(closeItems);
      const changes = buildAuditChanges(beforeSnapshot, afterSnapshot);
      const nextAuditTrail = [
        ...parsedExisting.auditTrail,
        {
          type: "UPDATE_PRODUCTS",
          at: new Date().toISOString(),
          actor: {
            id: user.id,
            name: user.name,
            role: user.role,
          },
          changes,
        },
      ];
      const nextNotes = composeNotesWithAudit(nextUserNotes, nextAuditTrail);

      const movementDate = closeDateValue(data.closeDate || existing.closeDate);

      return prisma.$transaction(async (tx) => {
        await tx.stockMovement.deleteMany({
          where: {
            companyId: existing.companyId,
            shopId: existing.shopId,
            notes: {
              startsWith: `DAILY_CLOSE:${id}:`,
            },
          },
        });

        const updated = await tx.dailyClose.update({
          where: { id },
          data: {
            openingAmount: decimal(data.openingAmount ?? 0),
            replenishment: decimal(data.replenishment ?? 0),
            losses: decimal(data.losses ?? 0),
            sales: decimal(data.sales ?? 0),
            finalBalance: decimal(finalBalance),
            status: data.status,
            notes: nextNotes,
            closeDate: data.closeDate || undefined,
            items: {
              deleteMany: {},
              create: closeItems,
            },
          },
          include: {
            items: true,
          },
        });

        if (movementRows.length > 0) {
          await Promise.all(
            movementRows.map((row) =>
              tx.stockMovement.create({
                data: {
                  companyId: existing.companyId,
                  shopId: existing.shopId,
                  productId: row.productId,
                  quantity: row.quantity,
                  unitCost: row.unitCost,
                  movementDate,
                  notes: `DAILY_CLOSE:${id}:${row.noteType}`,
                },
              }),
            ),
          );
        }

        return updated;
      });
    }

    const genericAuditTrail = [
      ...parsedExisting.auditTrail,
      {
        type: "UPDATE_GENERAL",
        at: new Date().toISOString(),
        actor: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
        changes: [],
      },
    ];
    const genericNotes = composeNotesWithAudit(
      nextUserNotes,
      genericAuditTrail,
    );

    return prisma.dailyClose.update({
      where: { id },
      data: {
        openingAmount: decimal(data.openingAmount ?? 0),
        replenishment: decimal(data.replenishment ?? 0),
        losses: decimal(data.losses ?? 0),
        sales: decimal(data.sales ?? 0),
        finalBalance: decimal(finalBalance),
        status: data.status,
        notes: genericNotes,
        closeDate: data.closeDate || undefined,
        items: mapManualItems(data.items),
      },
      include: {
        items: true,
      },
    });
  }

  const existing = await prisma.dailyClose.findUnique({
    where: {
      shopId_closeDate: {
        shopId,
        closeDate: data.closeDate,
      },
    },
  });

  if (existing) {
    throw new ApiError("Já existe fechamento para essa loja nessa data", 409);
  }

  const { closeItems, movementRows } = await buildProductClosePayload({
    companyId,
    shopId,
    productEntries: data.productEntries,
  });

  const initialAuditTrail = data.productEntries?.length
    ? [
        {
          type: "CREATE_PRODUCTS",
          at: new Date().toISOString(),
          actor: {
            id: user.id,
            name: user.name,
            role: user.role,
          },
          changes: buildAuditChanges(new Map(), snapshotByProduct(closeItems)),
        },
      ]
    : [];

  const notesWithAudit = composeNotesWithAudit(data.notes, initialAuditTrail);

  const movementDate = closeDateValue(data.closeDate);

  return prisma.$transaction(async (tx) => {
    const dailyClose = await tx.dailyClose.create({
      data: {
        companyId,
        shopId,
        closeDate: data.closeDate,
        openingAmount: decimal(data.openingAmount ?? 0),
        replenishment: decimal(data.replenishment ?? 0),
        losses: decimal(data.losses ?? 0),
        sales: decimal(data.sales ?? 0),
        finalBalance: decimal(finalBalance),
        notes: notesWithAudit,
        createdById: user.id,
        items: closeItems?.length
          ? {
              create: closeItems,
            }
          : data.items
            ? {
                create: data.items.map((item) => ({
                  productId: item.productId || null,
                  kind: item.kind,
                  amount: decimal(item.amount),
                  quantity:
                    item.quantity == null ? null : decimal(item.quantity),
                })),
              }
            : undefined,
      },
      include: {
        items: true,
      },
    });

    if (movementRows.length > 0) {
      await Promise.all(
        movementRows.map((row) =>
          tx.stockMovement.create({
            data: {
              companyId,
              shopId,
              productId: row.productId,
              quantity: row.quantity,
              unitCost: row.unitCost,
              movementDate,
              notes: `DAILY_CLOSE:${dailyClose.id}:${row.noteType}`,
            },
          }),
        ),
      );
    }

    return dailyClose;
  });
}
