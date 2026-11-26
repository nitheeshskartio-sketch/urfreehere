/** "Buy me a coffee": a friendly thank-you gesture. No payment, no amount, no external link. */
const HIDE_KEY = 'urfree.coffee.hiddenUntil';
const COUNT_KEY = 'urfree.coffee.count';

export function fabHidden(): boolean {
  return Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now();
}

export function hideFabForDays(days: number) {
  localStorage.setItem(HIDE_KEY, String(Date.now() + days * 86_400_000));
  window.dispatchEvent(new Event('urfree:coffee'));
}

export function openCoffee() {
  window.dispatchEvent(new Event('urfree:coffee-open'));
}

/** How many coffees this visitor has "bought" (kept in this browser only). */
export function coffeeCount(): number {
  return Number(localStorage.getItem(COUNT_KEY) || 0);
}

export function addCoffee(): number {
  const n = coffeeCount() + 1;
  localStorage.setItem(COUNT_KEY, String(n));
  return n;
}
