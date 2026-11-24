"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import RequiredRole from "../../../components/RequiredRole";
import { getOrder } from "../ordersApi";
import styles from "./order.module.css";

const money = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });
const statuses = {
  PENDING: "Awaiting restaurant",
  ACCEPTED: "Accepted by restaurant",
  REJECTED: "Rejected by restaurant",
  UNDER_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function SavedOrder({ orderId }) {
  const [result, setResult] = useState({ order: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getOrder(orderId).then(
      (order) => { if (active) setResult({ order, error: null }); },
      (error) => { if (active) setResult({ order: null, error }); },
    );
    return () => { active = false; };
  }, [orderId, attempt]);

  if (result.error) {
    return (
      <section className={styles.card}>
        <h1>Order confirmation</h1>
        <p role="alert" className={styles.error}>{result.error.status === 404
          ? "This order could not be found for your account." : result.error.message}</p>
        {result.error.status !== 404 && (
          <button type="button" className={styles.secondaryButton} onClick={() => {
            setResult({ order: null, error: null });
            setAttempt((value) => value + 1);
          }}>Retry loading order</button>
        )}
        <Link href="/customer">Back to restaurants</Link>
      </section>
    );
  }

  if (!result.order) return <p role="status">Loading order...</p>;
  const order = result.order;
  return (
    <section className={styles.card} aria-label="Saved order">
      <h1>Order confirmation</h1>
      <p className={styles.status} role="status">{statuses[order.status] || order.status}</p>
      <h2>{order.restaurant.name}</h2>
      <p>{order.restaurant.address}</p>
      <p className={styles.note}>Order reference: {order.id}</p>
      <ul className={styles.lines}>
        {order.lines.map((line) => (
          <li key={line.productId}>
            <div><strong>{line.productName}</strong><p>{line.quantity} × {money.format(line.unitPrice)}</p></div>
            <span>{money.format(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.total}><span>Total incl. VAT</span><span>{money.format(order.total)}</span></p>
      <h2>Delivery details</h2>
      <p>{order.customerName}</p>
      <p>{order.customerPhone}</p>
      <p className={styles.address}>{order.deliveryAddress}</p>
      <p className={styles.note}>These are the details and prices saved with your order.</p>
      <Link className={styles.secondaryButton} href="/customer">Back to restaurants</Link>
    </section>
  );
}

export default function OrderConfirmation() {
  const { orderId } = useParams();
  return (
    <RequiredRole role="CUSTOMER">
      <main className={styles.confirmation}>
        <SavedOrder key={orderId} orderId={orderId} />
      </main>
    </RequiredRole>
  );
}
