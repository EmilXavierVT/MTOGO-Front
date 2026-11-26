"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LogoutButton from "../../components/LogoutButton";
import RequiredRole from "../../components/RequiredRole";
import { getDeliveryOverview, updateDelivery } from "./api";
import styles from "./courier.module.css";

function expireSession(error, router) {
  if (error.status !== 401) return false;
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem("token");
    storage.removeItem("role");
  }
  router.replace("/auth/login");
  return true;
}

function CourierDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDeliveryOverview()
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch((failure) => {
        if (!cancelled && !expireSession(failure, router)) setError(failure.message);
      })
      .finally(() => { if (!cancelled) setBusy(""); });
    return () => { cancelled = true; };
  }, [router]);

  async function refresh() {
    if (busy) return;
    setBusy("refresh");
    setError("");
    setNotice("");
    setOverview(null);
    try {
      setOverview(await getDeliveryOverview());
    } catch (failure) {
      if (!expireSession(failure, router)) setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  async function act(orderId, action) {
    if (busy) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      try {
        await updateDelivery(orderId, action);
        setNotice({
          accept: "Du har overtaget leveringen.",
          pickup: "Maden er afhentet. Du kan nu levere til kunden.",
          delivered: "Levering gennemført. Du kan nu overtage en ny ordre.",
        }[action]);
      } catch (failure) {
        setOverview(null);
        if (expireSession(failure, router)) return;
        setError(failure.message);
      }
      // Even a failed request may have reached the server. Read before allowing another action.
      setOverview(null);
      try {
        setOverview(await getDeliveryOverview());
      } catch (failure) {
        if (!expireSession(failure, router)) {
          setError((previous) => [previous, "Oversigten kunne ikke opdateres. Prøv Opdatér oversigt."].filter(Boolean).join(" "));
        }
      }
    } finally {
      setBusy("");
    }
  }

  const active = overview?.active;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>MTOGO · Bud</p>
            <h1>Dine leveringer</h1>
            <p className={styles.description}>Vælg en ordre, afhent maden og bring den frem til kunden.</p>
          </div>
          <div className={styles.logout}><LogoutButton /></div>
        </header>

        <div className={styles.toolbar}>
          <p>Én aktiv levering ad gangen.</p>
          <button type="button" className={styles.secondary} onClick={refresh} disabled={Boolean(busy)}>Opdatér oversigt</button>
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {busy && <p role="status">{busy === "loading" || busy === "refresh" ? "Henter leveringer…" : "Opdaterer levering…"}</p>}

        {overview && <div className={styles.columns} aria-busy={Boolean(busy)}>
          <section aria-labelledby="active-heading" className={styles.section}>
            <h2 id="active-heading">Din aktive levering</h2>
            {active ? <article className={styles.activeCard}>
              <p className={styles.badge}>{active.status === "CLAIMED" ? "Klar til afhentning" : "På vej til kunden"}</p>
              <h3>Ordre {active.orderId.slice(0, 8)}</h3>
              <div className={styles.stop}>
                <p className={styles.label}>1 · Afhentning</p>
                <p className={styles.name}>{active.restaurant.name}</p>
                <p>{active.restaurant.address}</p>
              </div>
              <div className={styles.stop}>
                <p className={styles.label}>2 · Levering</p>
                <p className={styles.name}>{active.customerName}</p>
                <p>{active.deliveryAddress}</p>
                <a href={`tel:${active.customerPhone}`}>{active.customerPhone}</a>
              </div>
              {active.status === "CLAIMED" && <button type="button" className={styles.primary}
                onClick={() => act(active.orderId, "pickup")} disabled={Boolean(busy)}>Markér som afhentet</button>}
              {active.status === "UNDER_DELIVERY" && <button type="button" className={styles.primary}
                onClick={() => act(active.orderId, "delivered")} disabled={Boolean(busy)}>Markér som leveret</button>}
            </article> : <div className={styles.empty}>
              <h3>Du er klar til næste levering</h3>
              <p>Overtag en ledig ordre for at se kundens oplysninger og næste trin.</p>
            </div>}
          </section>

          <section aria-labelledby="available-heading" className={styles.section}>
            <h2 id="available-heading">Ledige ordrer <span className={styles.count}>{overview.available.length}</span></h2>
            {active && <p className={styles.description}>Afslut din aktive levering, før du overtager en ny.</p>}
            {overview.available.length === 0 ? <div className={styles.empty}>
              <h3>Ingen ledige ordrer lige nu</h3>
              <p>Opdatér oversigten for at se, om nye ordrer er klar til afhentning.</p>
            </div> : <ul className={styles.orders}>
              {overview.available.map((order) => <li key={order.orderId} className={styles.orderCard}>
                <p className={styles.label}>Ordre {order.orderId.slice(0, 8)} · Klar til afhentning</p>
                <h3>{order.restaurant.name}</h3>
                <p>{order.restaurant.address}</p>
                <button type="button" className={styles.primary} aria-label={`Overtag ordre ${order.orderId.slice(0, 8)}`}
                  disabled={Boolean(busy) || Boolean(active)} onClick={() => act(order.orderId, "accept")}>Overtag levering</button>
              </li>)}
            </ul>}
          </section>
        </div>}
      </div>
    </main>
  );
}

function CourierPage() {
  return (
    <RequiredRole role="COURIER">
      <CourierDashboard />
    </RequiredRole>
  );
}

export default CourierPage;
