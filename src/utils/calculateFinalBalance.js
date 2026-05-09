export function calculateFinalBalance({
  openingAmount = 0,
  replenishment = 0,
  sales = 0,
  losses = 0,
}) {
  return (
    Number(openingAmount) +
    Number(replenishment) +
    Number(sales) -
    Number(losses)
  );
}

export function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getDaysInMonth(date) {
  const reference = new Date(date);
  return new Date(
    reference.getFullYear(),
    reference.getMonth() + 1,
    0,
  ).getDate();
}

export function eachDayInRange(startDate, endDate) {
  const current = startOfDay(startDate);
  const finalDate = endOfDay(endDate);
  const days = [];

  while (current <= finalDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}
