"use client";

import { useState } from "react";
import styles from "./CreateDish.module.css";
import { createDish } from "../api";

function CreateDish({ menuId, onDishCreated}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmitForm(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    const values = new FormData(event.currentTarget);
    const dish = {
      nameDa: values.get("nameDa"),
      nameEn: values.get("nameEn"),
      descriptionDa: values.get("descriptionDa"),
      descriptionEn: values.get("descriptionEn"),
      priceDkkInclVat: Number(values.get("priceDkkInclVat")),
      available: values.has("available"),
    };
    setLoading(true);
    try {
      await createDish(menuId, dish);
      setShowCreateForm(false);
      await onDishCreated();
    } catch (error) {
      setError(error.message || "Could not create dish");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className={styles.container}>
      <button
        className={styles.createButton}
        type="button"
        onClick={() => setShowCreateForm(true)}
        aria-expanded={showCreateForm}
        aria-controls="create-dish-form"
      >
        Create new dish
      </button>

      {showCreateForm && (
        <form
          className={styles.form}
          id="create-dish-form"
          onSubmit={handleSubmitForm}
        >
          <h2>Create new dish</h2>

          <div>
            <label htmlFor="dish-name-da">Dish name (Danish)</label>
            <input id="dish-name-da" name="nameDa" type="text" maxLength={255} required/>
          </div>

          <div>
            <label htmlFor="dish-description-da">
              Description (Danish)
            </label>
            <textarea id="dish-description-da" name="descriptionDa" required />
          </div>

          <div>
            <label htmlFor="dish-name-en">
              Dish name (English, optional)
            </label>
            <input id="dish-name-en" name="nameEn" type="text" maxLength={255} />
          </div>

          <div>
            <label htmlFor="dish-description-en">
              Description (English, optional)
            </label>
            <textarea id="dish-description-en" name="descriptionEn"
            />
          </div>

          <div>
            <label htmlFor="dish-price">
              Price (DKK, including VAT)
            </label>
            <input id="dish-price" name="priceDkkInclVat" type="number" min="0.01" step="0.01" required/>
          </div>

          <div>
            <label className={styles.checkboxLabel} htmlFor="dish-available">
              <input id="dish-available" name="available" type="checkbox" defaultChecked />
              Available to order
            </label>
          </div>

          {error && <p role="alert">{error}</p>}
          <button className={styles.createButton} type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save dish"}
          </button>

          <button className={styles.cancelButton} type="button" disabled={loading} onClick={() => setShowCreateForm(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

export default CreateDish;

