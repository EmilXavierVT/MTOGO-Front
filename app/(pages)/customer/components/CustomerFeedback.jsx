"use client";

import { useEffect, useRef, useState } from "react";
import { useFeature, useSessionExpiry } from "../../../features/FeatureFlagsProvider";
import { getFeedback, submitFeedback } from "../ordersApi";
import styles from "./order.module.css";

const ratings = [
  ["foodRating", "Food"],
  ["overallExperienceRating", "Overall experience"],
  ["courierRating", "Courier"],
];

function FeedbackForm({ orderId }) {
  const expireSession = useSessionExpiry();
  const [result, setResult] = useState({ view: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  const submission = useRef(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      submission.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    getFeedback(orderId, { signal: controller.signal }).then(
      (view) => { if (!disposed) setResult({ view, error: null }); },
      (error) => {
        if (disposed) return;
        if (error.status === 401) expireSession();
        else setResult({ view: null, error });
      },
    );
    return () => { disposed = true; controller.abort(); };
  }, [orderId, attempt, expireSession]);

  function reload() {
    setResult({ view: null, error: null });
    setAttempt((value) => value + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (submission.current) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(ratings.map(([name]) => [name, Number(form.get(name))]));
    if (Object.values(values).some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return;
    const controller = new AbortController();
    submission.current = controller;
    setSubmitting(true);
    setNotice("");
    try {
      const view = await submitFeedback(orderId, values, { signal: controller.signal });
      if (active.current) {
        setResult({ view, error: null });
        setNotice("Thank you. Your feedback is saved.");
      }
    } catch (error) {
      if (!active.current) return;
      if (error.status === 401) expireSession();
      else if (error.status === 409) {
        setNotice("Feedback may already be saved. Showing the latest result.");
        reload();
      } else {
        // A failed response can follow a committed write. Read the saved state before offering another submission.
        setResult({ view: null, error });
      }
    } finally {
      submission.current = null;
      if (active.current) setSubmitting(false);
    }
  }

  const error = result.error;
  if (error?.status === 404) return <p role="status" className={styles.note}>
    Feedback is currently unavailable. Your order is still saved.
  </p>;

  return <section className={styles.feedback} aria-label="Delivery feedback">
    <h2>Rate your delivery</h2>
    {notice && <p role="status">{notice}</p>}
    {error ? <>
      <p role="alert" className={styles.error}>{error.status === 403
        ? "Only the customer who placed this order can leave feedback."
        : error.status === 409 ? "This delivery is not ready for feedback yet."
          : "Could not confirm your feedback. Reload to check the saved result."}</p>
      {error.status !== 403 && <button type="button" className={styles.secondaryButton} onClick={reload}>
        Reload feedback
      </button>}
    </> : !result.view ? <p role="status">Loading feedback...</p> : <>
      <p>Delivered by <strong>{result.view.courierName}</strong></p>
      {result.view.feedback ? <>
        <h3>Your saved ratings</h3>
        <dl className={styles.ratings}>
          {ratings.map(([name, label]) => <div key={name}>
            <dt>{label}</dt><dd>{result.view.feedback[name]} / 5</dd>
          </div>)}
        </dl>
        <p className={styles.note}>Feedback can be submitted once per delivery.</p>
      </> : <form onSubmit={submit}>
        <p className={styles.note}>Choose 1 (poor) to 5 (excellent) for each rating. You can submit once.</p>
        <fieldset className={styles.fields} disabled={submitting}>
          <legend className={styles.ratingLegend}>Your ratings</legend>
          {ratings.map(([name, label]) => <div key={name}>
            <label htmlFor={`feedback-${name}`}>{label}{name === "courierRating" ? ` — ${result.view.courierName}` : ""}</label>
            <select id={`feedback-${name}`} name={name} required defaultValue="">
              <option value="" disabled>Choose a rating</option>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>)}
          <button className={styles.primaryButton} type="submit">{submitting ? "Saving feedback..." : "Submit feedback"}</button>
        </fieldset>
      </form>}
    </>}
  </section>;
}

export default function CustomerFeedback({ order }) {
  const enabled = useFeature("customerFeedback");
  return enabled && order.status === "DELIVERED" ? <FeedbackForm key={order.id} orderId={order.id} /> : null;
}
