"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkout } from "../ordersApi";
import styles from "./order.module.css";

const money = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });
const unitOre = (item) => Math.round(Number(item.dish.priceDkkInclVat) * 100);

export default function Checkout({ cart, restaurant, onCartChange, onBack, onComplete }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [requiresAcceptance, setRequiresAcceptance] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [unavailableId, setUnavailableId] = useState(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const total = cart.reduce((sum, item) => sum + unitOre(item) * item.quantity, 0) / 100;

  function removeItem(productId) {
    onCartChange(cart.filter((item) => item.dish.id !== productId));
    if (productId === unavailableId) setUnavailableId(null);
    setAccepted(false);
    setError("");
  }

  function showCheckoutError(failure) {
    if (failure.code === "PRICE_CHANGED") {
      const prices = new Map(failure.products.map((item) => [item.productId, item]));
      onCartChange(cart.map((item) => {
        const price = prices.get(item.dish.id);
        return { ...item, dish: { ...item.dish,
          nameDa: price.productName, priceDkkInclVat: price.unitPrice } };
      }));
      setRequiresAcceptance(true);
      setAccepted(false);
      setError("Prices changed. Review your updated order and accept the new total before paying.");
    } else if (failure.code === "PRODUCT_UNAVAILABLE") {
      setUnavailableId(failure.productId);
      const item = cart.find((item) => item.dish.id === failure.productId);
      setError(`${item?.dish.nameDa || "A dish"} is no longer available. Remove it to continue.`);
    } else if (failure.status === 402) {
      setError("Payment simulation was declined. No order was created. You can try again.");
    } else if (failure.status === 401 || failure.status === 403) {
      setSignInRequired(true);
      setError("Please sign in with a customer account before placing your order.");
    } else {
      setError(failure.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !cart.length || unavailableId || signInRequired
      || (requiresAcceptance && !accepted)) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    let order;
    try {
      order = await checkout({
        restaurantId: cart[0].restaurantId,
        products: cart.map((item) => ({ productId: item.dish.id, quantity: item.quantity })),
        name: data.get("name").trim(),
        phone: data.get("phone").trim(),
        address: data.get("address").trim(),
        acceptedTotal: total,
        simulatedPaymentResult: data.get("paymentResult"),
      });
    } catch (failure) {
      showCheckoutError(failure);
      inFlight.current = false;
      setSubmitting(false);
      return;
    }
    onComplete();
    router.push(`/customer/orders/${encodeURIComponent(order.id)}`);
  }

  return (
    <section className={styles.checkout} aria-label="Checkout">
      <button type="button" className={styles.secondaryButton} onClick={onBack} disabled={submitting}>
        Back to menu
      </button>
      <h2>Checkout</h2>
      <p className={styles.restaurant}>{restaurant?.name || restaurant?.address}</p>
      <div className={styles.layout}>
        <section className={styles.card} aria-label="Order summary">
          <h3>Your order</h3>
          {cart.length === 0 && <p>Your cart is empty. Go back to the menu to choose dishes.</p>}
          <ul className={styles.lines}>
            {cart.map((item) => (
              <li key={item.dish.id}>
                <div>
                  <strong>{item.dish.nameDa}</strong>
                  <p>{item.quantity} × {money.format(item.dish.priceDkkInclVat)}</p>
                  {item.dish.id === unavailableId && <p className={styles.unavailable}>No longer available</p>}
                  <button type="button" className={styles.removeButton} disabled={submitting}
                    onClick={() => removeItem(item.dish.id)} aria-label={`Remove ${item.dish.nameDa}`}>
                    Remove
                  </button>
                </div>
                <span>{money.format(unitOre(item) * item.quantity / 100)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.total}><span>Total incl. VAT</span><span>{money.format(total)}</span></p>
        </section>

        <form className={styles.card} aria-label="Delivery and payment" onSubmit={submit}>
          <h3>Delivery details</h3>
          <fieldset disabled={submitting} className={styles.fields}>
            <label htmlFor="checkout-name">Name</label>
            <input id="checkout-name" name="name" autoComplete="name" required maxLength={255} pattern=".*\S.*" />
            <label htmlFor="checkout-phone">Phone</label>
            <input id="checkout-phone" name="phone" type="tel" autoComplete="tel" required maxLength={255} pattern=".*\S.*" />
            <label htmlFor="checkout-address">Delivery address</label>
            <textarea id="checkout-address" name="address" autoComplete="street-address" required maxLength={255} />
            <label htmlFor="checkout-payment">Payment simulation</label>
            <select id="checkout-payment" name="paymentResult" defaultValue="APPROVED">
              <option value="APPROVED">Approve payment</option>
              <option value="DECLINED">Decline payment</option>
            </select>
            <p className={styles.note}>This is a payment simulation. No money is charged.</p>
            {requiresAcceptance && (
              <label className={styles.acceptance}>
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                I accept the updated total of {money.format(total)} including VAT.
              </label>
            )}
          </fieldset>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {signInRequired && <Link href="/auth/login">Sign in again</Link>}
          <button className={styles.primaryButton} type="submit"
            disabled={submitting || !cart.length || Boolean(unavailableId) || signInRequired
              || (requiresAcceptance && !accepted)}>
            {submitting ? "Placing order..." : `Pay ${money.format(total)} (simulation)`}
          </button>
        </form>
      </div>
    </section>
  );
}
