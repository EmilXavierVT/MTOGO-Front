import styles from "./DishList.module.css";

const priceFormat = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
});

export default function DishList({ menu, selectedDishId, onSelectDish }) {
  return (
    <section className={styles.box} aria-labelledby="dish-list-heading">
      <h2 id="dish-list-heading">Retter</h2>
      <p className={styles.menuName}>{menu.name}</p>
      {menu.products.length === 0 ? (
        <p className={styles.empty}>No dishes in this menu yet.</p>
      ) : (
        <ul className={styles.list}>
          {menu.products.map((dish) => (
            <li key={dish.id}>
              <button type="button" className={styles.dish}
                aria-pressed={dish.id === selectedDishId}
                aria-controls="dish-editor"
                onClick={() => onSelectDish(dish.id)}>
              <div className={styles.details}>
                <span className={styles.name}>{dish.nameDa}</span>
                <span className={styles.price}>
                  {priceFormat.format(dish.priceDkkInclVat)}
                </span>
              </div>
              <span className={`${styles.badge} ${dish.available ? styles.available : styles.unavailable}`}>
                <span aria-hidden="true">●</span>
                {dish.available ? "Tilgængelig" : "Utilgængelig"}
              </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
