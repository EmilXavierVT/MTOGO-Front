"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFeature, useSessionExpiry } from "../../../features/FeatureFlagsProvider";
import { listOrders } from "../ordersApi";
import styles from "./order.module.css";

function DeliveredOrders() {
  const expireSession = useSessionExpiry();
  const [result, setResult] = useState({ orders: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    listOrders({ signal: controller.signal }).then(
      (orders) => {
        if (!disposed) setResult({ orders: orders.filter((order) => order.status === "DELIVERED"), error: null });
      },
    ).catch((error) => {
      if (disposed) return;
      if (error.status === 401) expireSession();
      else setResult({ orders: null, error });
    });
    return () => { disposed = true; controller.abort(); };
  }, [attempt, expireSession]);

  return <section className={styles.card} aria-label="Delivered orders">
    <h2>Feedback on your deliveries</h2>
    {result.error ? <>
      <p role="alert">Could not load your delivered orders.</p>
      <button type="button" className={styles.secondaryButton} onClick={() => {
        setResult({ orders: null, error: null });
        setAttempt((value) => value + 1);
      }}>Reload delivered orders</button>
    </> : result.orders === null ? <p role="status">Loading delivered orders...</p>
      : result.orders.length === 0 ? <p>No delivered orders to rate yet.</p>
        : <ul className={styles.lines}>{result.orders.map((order) => <li key={order.id}>
          <div><strong>{order.restaurant.name}</strong><p className={styles.note}>
            Order {order.id}
          </p></div>
          <Link href={`/customer/orders/${encodeURIComponent(order.id)}`}>View feedback</Link>
        </li>)}</ul>}
  </section>;
}

export default function FeedbackOrders() {
  const enabled = useFeature("customerFeedback");
  return enabled ? <DeliveredOrders /> : null;
}
