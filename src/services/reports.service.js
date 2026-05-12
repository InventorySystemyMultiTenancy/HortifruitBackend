import { prisma } from "../config/prisma.js";
import {
  eachDayInRange,
  endOfDay,
  getDaysInMonth,
  startOfDay,
} from "../utils/calculateFinalBalance.js";

function buildDateRange({ startDate, endDate, month }) {
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const firstDay = new Date(year, monthNumber - 1, 1);
    const lastDay = new Date(year, monthNumber, 0);
    return { startDate: startOfDay(firstDay), endDate: endOfDay(lastDay) };
  }

  const start = startDate ? startOfDay(startDate) : startOfDay(new Date());
  const end = endDate ? endOfDay(endDate) : endOfDay(start);
  return { startDate: start, endDate: end };
}

function getMonthBounds(date) {
  return {
    startsAt: startOfDay(new Date(date.getFullYear(), date.getMonth(), 1)),
    endsAt: endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

function resolveCostWindow(cost) {
  if (cost.startsAt || cost.endsAt) {
    return {
      startsAt: cost.startsAt || cost.dueDate || cost.createdAt,
      endsAt: cost.endsAt || cost.dueDate || cost.createdAt,
    };
  }

  if (cost.nature === "FIXED" && cost.dueDate) {
    return getMonthBounds(cost.dueDate);
  }

  const referenceDate = cost.dueDate || cost.createdAt;
  return {
    startsAt: referenceDate,
    endsAt: referenceDate,
  };
}

function overlapsDay(cost, day) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const { startsAt, endsAt } = resolveCostWindow(cost);
  return startsAt <= dayEnd && endsAt >= dayStart;
}

function overlapsRange(cost, rangeStart, rangeEnd) {
  const { startsAt, endsAt } = resolveCostWindow(cost);
  return startsAt <= rangeEnd && endsAt >= rangeStart;
}

function getCostDailyAmount(cost, day) {
  if (!overlapsDay(cost, day)) {
    return 0;
  }

  if (cost.nature === "FIXED") {
    return Number(cost.amount) / getDaysInMonth(day);
  }

  const { startsAt, endsAt } = resolveCostWindow(cost);
  const spanDays = Math.max(eachDayInRange(startsAt, endsAt).length, 1);
  return Number(cost.amount) / spanDays;
}

export async function buildReport({
  companyId,
  shopId,
  shopIds,
  plantationId,
  startDate,
  endDate,
  month,
}) {
  const range = buildDateRange({ startDate, endDate, month });
  const scopedShopFilter = shopId
    ? { shopId }
    : Array.isArray(shopIds) && shopIds.length
      ? { shopId: { in: shopIds } }
      : {};

  const dailyCloses = await prisma.dailyClose.findMany({
    where: {
      companyId,
      ...scopedShopFilter,
      ...(plantationId ? { plantationId } : {}),
      closeDate: {
        gte: range.startDate,
        lte: range.endDate,
      },
    },
  });

  let costs;
  if (shopId || (Array.isArray(shopIds) && shopIds.length)) {
    costs = await prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
        scope: "SHOP",
        ...(shopId ? { shopId } : { shopId: { in: shopIds } }),
      },
    });
  } else if (plantationId) {
    costs = await prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
        scope: "PLANTATION",
        plantationId,
      },
    });
  } else {
    costs = await prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
      },
    });
  }

  const grossRevenue = dailyCloses.reduce(
    (sum, item) => sum + Number(item.sales),
    0,
  );
  const lossesTotal = dailyCloses.reduce(
    (sum, item) => sum + Number(item.losses || 0),
    0,
  );
  const netRevenue = grossRevenue - lossesTotal;
  const dailyCosts = eachDayInRange(range.startDate, range.endDate).map(
    (day) => {
      let fixed = 0;
      let variable = 0;
      let plantation = 0;

      for (const cost of costs) {
        if (!overlapsRange(cost, range.startDate, range.endDate)) {
          continue;
        }

        const dailyAmount = getCostDailyAmount(cost, day);

        if (dailyAmount === 0) {
          continue;
        }

        if (cost.nature === "FIXED") {
          fixed += dailyAmount;
        }

        if (cost.nature === "VARIABLE") {
          variable += dailyAmount;
        }

        if (cost.scope === "PLANTATION") {
          plantation += dailyAmount;
        }
      }

      return {
        date: startOfDay(day),
        fixed,
        variable,
        plantation,
        total: fixed + variable + plantation,
      };
    },
  );

  const fixedCostsRateado = dailyCosts.reduce(
    (sum, item) => sum + item.fixed,
    0,
  );
  const variableCosts = dailyCosts.reduce(
    (sum, item) => sum + item.variable,
    0,
  );
  const plantationCosts = dailyCosts.reduce(
    (sum, item) => sum + item.plantation,
    0,
  );

  const totalCosts = fixedCostsRateado + variableCosts + plantationCosts;

  return {
    filters: {
      companyId,
      shopId: shopId || null,
      startDate: range.startDate,
      endDate: range.endDate,
      month: month || null,
    },
    grossRevenue,
    lossesTotal,
    netRevenue,
    costs: {
      fixedRateado: fixedCostsRateado,
      variable: variableCosts,
      plantation: plantationCosts,
      total: totalCosts,
      daily: dailyCosts,
    },
    netResult: netRevenue - totalCosts,
    closes: dailyCloses,
  };
}
