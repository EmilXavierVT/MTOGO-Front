"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CreateDish.module.css";
import { createDish } from "../api";

function CreateDish({ menuId, onDishCreated}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!showCreateForm) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [showCreateForm]);

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
      try{
        await onDishCreated();
      } catch {
          setError("Dish saved, but could not be refreshed. Reload the page.")
      }
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
        aria-haspopup="dialog"
      >
        Create new dish
      </button>

      {showCreateForm && (
        <dialog
          ref={dialogRef}
          className={styles.modalContainer}
          aria-labelledby="create-dish-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!loading) setShowCreateForm(false);
          }}
          onClick={(event) => {
            if (loading || event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom) {
              setShowCreateForm(false);
            }
          }}
        >
        <form
          className={styles.form}
          id="create-dish-form"
          onSubmit={handleSubmitForm}
        >
          <h2 id="create-dish-title">Create new dish</h2>

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
          <button className={styles.saveButton} type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save dish"}
          </button>

          <button className={styles.cancelButton} type="button" disabled={loading} onClick={() => setShowCreateForm(false)}>
            Cancel
          </button>
        </form>
        </dialog>
      )}
    </div>
  );
}

export default CreateDish;

