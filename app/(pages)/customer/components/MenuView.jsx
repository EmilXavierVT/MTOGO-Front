import styles from "./MenuView.module.css";

const priceFormat = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
});

export default function MenuView({ menu, onAddToCart }) {
  return (
    <section className={styles.box} aria-labelledby={`menu-${menu.id}`}>
      <h2 id={`menu-${menu.id}`}>Retter</h2>
      <p className={styles.menuName}>{menu.name}</p>
      {menu.products.length === 0 ? (
        <p className={styles.empty}>No dishes from this menu yet.</p>
      ) : (
        <ul className={styles.list}>
          {menu.products.map((dish) => (
            <li key={dish.id}>
              <button type="button" className={styles.dish}
                disabled={!dish.available}
                onClick={() => onAddToCart(dish)}>
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