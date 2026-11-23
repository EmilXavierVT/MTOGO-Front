"use client";

import { useState } from "react";
import { updateDish } from "../api";
import styles from "./CreateDish.module.css";

export default function EditDish({ menuId, dish, onDishUpdated, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    const values = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      await updateDish(menuId, dish.id, {
        nameDa: values.get("nameDa"),
        descriptionDa: values.get("descriptionDa"),
        nameEn: values.get("nameEn"),
        descriptionEn: values.get("descriptionEn"),
        priceDkkInclVat: Number(values.get("priceDkkInclVat")),
        available: values.has("available"),
      });
      
      setSaved(true);
      try{
      await onDishUpdated();
      }
      catch {
        setError("Dish saved, but the list could not be refreshed. Reload the page.");
      }
    } 
    catch (error) {
      setError(error.message || "Could not save dish");
    } finally {
      setLoading(false);
    }

    
  }

  return (
    <section id="dish-editor" className={`${styles.container} ${styles.editorContainer}`} aria-labelledby="edit-dish-heading">
      <form className={styles.form} onSubmit={handleSubmit} onChange={() => setSaved(false)}>
        <h2 id="edit-dish-heading">Edit dish</h2>
        <div>
          <label htmlFor="edit-name-da">Dish name (Danish)</label>
          <input id="edit-name-da" name="nameDa" defaultValue={dish.nameDa} maxLength={255} required />
        </div>
        <div>
          <label htmlFor="edit-description-da">Description (Danish)</label>
          <textarea id="edit-description-da" name="descriptionDa" defaultValue={dish.descriptionDa} required />
        </div>
        <div>
          <label htmlFor="edit-name-en">Dish name (English, optional)</label>
          <input id="edit-name-en" name="nameEn" defaultValue={dish.nameEn ?? ""} maxLength={255} />
        </div>
        <div>
          <label htmlFor="edit-description-en">Description (English, optional)</label>
          <textarea id="edit-description-en" name="descriptionEn" defaultValue={dish.descriptionEn ?? ""} />
        </div>
        <div>
          <label htmlFor="edit-price">Price (DKK, including VAT)</label>
          <input id="edit-price" name="priceDkkInclVat" type="number" min="0.01" max="9999999999.99" step="0.01" defaultValue={dish.priceDkkInclVat} required />
        </div>
        <label className={styles.checkboxLabel} htmlFor="edit-available">
          <input id="edit-available" name="available" type="checkbox" defaultChecked={dish.available} />
          Available to order
        </label>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Changes saved.</p>}
        <button className={styles.saveButton} type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save changes"}
        </button>
        <button className={styles.cancelButton} type="button" disabled={loading} onClick={onClose}>Close editor</button>
      </form>
    </section>
  );
}
