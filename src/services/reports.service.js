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

export async function buildReport({
  companyId,
  shopId,
  startDate,
  endDate,
  month,
}) {
  const range = buildDateRange({ startDate, endDate, month });

  const dailyCloses = await prisma.dailyClose.findMany({
    where: {
      companyId,
      ...(shopId ? { shopId } : {}),
      closeDate: {
        gte: range.startDate,
        lte: range.endDate,
      },
    },
  });

  const costs = await prisma.cost.findMany({
    where: {
      companyId,
      isActive: true,
      ...(shopId ? { OR: [{ shopId }, { shopId: null }] } : {}),
    },
  });

  const grossRevenue = dailyCloses.reduce(
    (sum, item) => sum + Number(item.sales),
    0,
  );
  const variableCosts = costs
    .filter(
      (item) =>
        item.nature === "VARIABLE" &&
        overlapsRange(item, range.startDate, range.endDate),
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const plantationCosts = costs
    .filter(
      (item) =>
        item.scope === "PLANTATION" &&
        overlapsRange(item, range.startDate, range.endDate),
    )
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const fixedCosts = costs.filter((item) => item.nature === "FIXED");
  let fixedCostsRateado = 0;

  for (const day of eachDayInRange(range.startDate, range.endDate)) {
    const daysInMonth = getDaysInMonth(day);

    for (const cost of fixedCosts) {
      if (overlapsDay(cost, day)) {
        fixedCostsRateado += Number(cost.amount) / daysInMonth;
      }
    }
  }

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
    costs: {
      fixedRateado: fixedCostsRateado,
      variable: variableCosts,
      plantation: plantationCosts,
      total: totalCosts,
    },
    netResult: grossRevenue - totalCosts,
    closes: dailyCloses,
  };
}
