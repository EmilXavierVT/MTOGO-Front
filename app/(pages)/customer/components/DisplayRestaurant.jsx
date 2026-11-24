"use client";
import { useState, useEffect, useRef } from "react";
import { getRestaurants, getRestaurantMenus } from "../api";
import MenuView from "./MenuView";
import styles from "./DisplayRestaurant.module.css";

const priceFormat = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
});

export default function DisplayRestaurant() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [menuState, setMenuState] = useState({
    restaurantId: null,
    menus: [],
    loading: false,
    error: "",
  });
  const menuRequestId = useRef(0);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cartError, setCartError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadRestaurants() {
      try {
        const data = await getRestaurants();
        if (active) {
          setRestaurants(data);
        }
      } catch (error) {
        if (active) {
          setError(error.message || "Could not load restaurants");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRestaurants();
    return () => {
      active = false;
      menuRequestId.current += 1;
    };
  }, []);

  async function selectRestaurant(restaurantId) {
    const requestId = ++menuRequestId.current;
    setSelectedRestaurantId(restaurantId);
    setMenuState({ restaurantId, menus: [], loading: true, error: "" });
    try {
      const data = await getRestaurantMenus(restaurantId);
      if (requestId !== menuRequestId.current) return;
      setMenuState({ restaurantId, menus: data, loading: false, error: "" });
    } catch (error) {
      if (requestId !== menuRequestId.current) return;
      setMenuState({
        restaurantId,
        menus: [],
        loading: false,
        error: error.message || "Could not load menus",
      });
    }
  }

  function addToCart(dish, restaurantId) {
    if (cart.length > 0 && cart[0].restaurantId !== restaurantId) {
      setCartError(
        "You can only order from one restaurant per order. Please empty the cart to order from another restaurant.",
      );
      return;
    }
    setCartError("");

    const existingItem = cart.find((item) => item.dish.id === dish.id);

    if (existingItem) {
      const updatedCart = cart.map((item) => {
        if (item.dish.id === dish.id) {
          return { ...item, quantity: item.quantity + 1 };
        }
        return item;
      });
      setCart(updatedCart);
    } else {
      setCart([
        ...cart,
        { dish, quantity: 1, restaurantId },
      ]);
    }
  }

  function changeQuantity(dishId, change) {
    const updatedCart = cart.map((item) => {
      if (item.dish.id === dishId) {
        return { ...item, quantity: item.quantity + change };
      }
      return item;
    });
    setCart(updatedCart.filter((item) => item.quantity > 0));
  }

  function emptyCart() {
    setCart([]);
    setCartError("");
  }

  let total = 0;
  for (const item of cart) {
    total += item.dish.priceDkkInclVat * item.quantity;
  }

  if (loading) return <p role="status">Loading restaurants...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (restaurants.length === 0) return <p>No restaurants available yet.</p>;

  const selectedRestaurant = restaurants.find(
    (restaurant) => restaurant.id === selectedRestaurantId,
  );

  return (
    <section className={styles.container} aria-label="Restaurants">
      <h2 className={styles.sectionTitle}>Restaurants</h2>

      <ul className={styles.restaurantList}>
        {restaurants.map((restaurant) => (
          <li key={restaurant.id}>
            <button
              type="button"
              className={styles.restaurantCard}
              aria-pressed={restaurant.id === selectedRestaurantId}
              onClick={() => selectRestaurant(restaurant.id)}
            >
              <span className={styles.restaurantInfo}>
                <span className={styles.restaurantName}>
                  {restaurant.address}
                </span>
                {restaurant.rating != null && (
                  <span className={styles.restaurantRating}>
                    Rating {restaurant.rating}
                  </span>
                )}
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.orderLayout}>
        <div className={styles.menus}>
          {selectedRestaurant ? (
            <>
              {menuState.loading && <p role="status">Loading menus...</p>}
              {menuState.error && (
                <div className={styles.menuError}>
                  <p role="alert">{menuState.error}</p>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => selectRestaurant(selectedRestaurantId)}
                  >
                    Retry menu
                  </button>
                </div>
              )}
              {menuState.menus.map((menu) => (
                <MenuView
                  key={menu.id}
                  menu={menu}
                  onAddToCart={(dish) => addToCart(dish, menuState.restaurantId)}
                />
              ))}
            </>
          ) : (
            <p className={styles.hint}>Select a restaurant to see the menu.</p>
          )}
        </div>

        <aside className={styles.cart} aria-label="Cart">
          <h2>Order</h2>
          {cartError && (
            <p className={styles.cartError} role="alert">
              {cartError}
            </p>
          )}
          {cart.length === 0 ? (
            <p className={styles.empty}>Your cart is empty.</p>
          ) : (
            <>
              <ul className={styles.cartList}>
                {cart.map((item) => (
                  <li key={item.dish.id} className={styles.cartItem}>
                    <span className={styles.itemName}>{item.dish.nameDa}</span>
                    <div className={styles.quantityControls}>
                      <button
                        type="button"
                        className={styles.quantityButton}
                        aria-label={`Remove one ${item.dish.nameDa}`}
                        onClick={() => changeQuantity(item.dish.id, -1)}
                      >
                        −
                      </button>
                      <span className={styles.quantity}>{item.quantity}</span>
                      <button
                        type="button"
                        className={styles.quantityButton}
                        aria-label={`Add one ${item.dish.nameDa}`}
                        onClick={() => changeQuantity(item.dish.id, 1)}
                      >
                        +
                      </button>
                    </div>
                    <span className={styles.itemPrice}>
                      {priceFormat.format(
                        item.dish.priceDkkInclVat * item.quantity,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.total}>
                <span>Total incl. VAT</span>
                <span>{priceFormat.format(total)}</span>
              </p>
              <button
                type="button"
                className={styles.emptyCartButton}
                onClick={emptyCart}
              >
                Empty cart
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
