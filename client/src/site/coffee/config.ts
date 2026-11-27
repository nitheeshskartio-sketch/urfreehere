/** "Buy me a coffee": a friendly thank-you gesture, with an optional UPI donation QR. */

/** UPI QR shown in the coffee popup. The ID itself isn't displayed; UPI apps show who receives it. */
export const UPI = {
  id: 'iamnitheeshm-3@okhdfcbank',
  heading: 'Fuel my coffee habit ☕',
  tagline: 'Even tea money works. The universe will cover the rest 😄',
};

/** UPI payment link (opens GPay, PhonePe, Paytm, …); the amount is left to the payer. */
// The UPI ID is written as-is: some UPI apps don't decode "%40" in it.
export const upiLink = () => `upi://pay?pa=${UPI.id}&cu=INR&tn=Donation`;
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
