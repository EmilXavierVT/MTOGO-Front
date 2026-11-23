import styles from "./MenuView.module.css";

const priceFormat = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
});

export default function MenuView({ menu, onAddToCart }) {
  return (
    <section className={styles.box} aria-labelledby={`menu-${menu.id}`}>
      <h3 id={`menu-${menu.id}`} className={styles.menuName}>
        {menu.name}
      </h3>
      {menu.products.length === 0 ? (
        <p className={styles.empty}>No dishes in this menu yet.</p>
      ) : (
        <ul className={styles.list}>
          {menu.products.map((dish) => (
            <li
              key={dish.id}
              className={
                dish.available
                  ? styles.dish
                  : `${styles.dish} ${styles.unavailableDish}`
              }
            >
              <div className={styles.details}>
                <span className={styles.name}>{dish.nameDa}</span>
                {dish.descriptionDa && (
                  <span className={styles.description}>
                    {dish.descriptionDa}
                  </span>
                )}
              </div>
              <span className={styles.price}>
                {priceFormat.format(dish.priceDkkInclVat)}
              </span>
              {dish.available ? (
                <button
                  type="button"
                  className={styles.addButton}
                  aria-label={`Add ${dish.nameDa} to cart`}
                  onClick={() => onAddToCart(dish)}
                >
                  +
                </button>
              ) : (
                <span className={styles.badge}>Sold out</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
