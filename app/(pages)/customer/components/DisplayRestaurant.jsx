"use client";
import { useState, useEffect } from "react";
import { getRestaurants, getRestaurantMenus } from "../api";
import MenuView from "./MenuView";
import styles from "./DisplayRestaurant.module.css";

export default function DisplayRestaurant() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [menus, setMenus] = useState([]);
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
    };
  }, []);

  async function selectRestaurant(restaurantId) {
    setSelectedRestaurantId(restaurantId);
    setMenus([]);
    try {
      const data = await getRestaurantMenus(restaurantId);
      setMenus(data);
    } catch (error) {
      setError(error.message || "Could not load menus");
    }
  }

  function addToCart(dish){
    if (cart.length > 0 && cart[0].restaurantId !== selectedRestaurantId) {
  setCartError("You can only order from one restaurant in a order. Please empty cart to select menus from an other retaurant.");
  return;
}
setCartError("");

const existingItems = cart.find((item) => item.dish.id === dish.id);

if(existingItems){
  const updatedCart = cart.map((item) => {
    if(item.dish.id === dish.id){
      return {...item, quantity: item.quantity + 1 };
  }
  return item;
});
    setCart(updatedCart);
  }else{
    setCart([...cart, {dish, quantity: 1, restaurantId: selectedRestaurantId }]);
  }
  }
  
function changeQuantity(dishId, change){
  const updated = cart.map((item) => {
    if(item.dish.id === dishId){
      return {...item, quantity: item.quantity + change };
    }
    return item;
  });
  setCart(updated.filter((item) => item.quantity > 0));
}

let total = 0;
for(const item of cart){
  total += item.dish.priceDkkInclVat*item.quantity;
}

  if (loading) return <p role="status">Loading restaurants...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (restaurants.length === 0) return <p>No restaurants available yet.</p>;

  const selectedRestaurant = restaurants.find(
    (restaurant) => restaurant.id === selectedRestaurantId,
  );

  return (
    
    <section aria-label="Restaurants">
      <div
        className={styles.restaurantsBar}
        role="group"
        aria-label="Select a restaurant"
      >
        {restaurants.map((restaurant) => (
          <button
            key={restaurant.id}
            type="button"
            className={styles.restaurantButton}
            aria-pressed={restaurant.id === selectedRestaurantId}
          onClick={() => selectRestaurant(restaurant.id)}
            
          >
            {restaurant.address}
          </button>
        ))}  
      </div>

      {selectedRestaurant && (
        <div className={styles.displayedRestaurant}>
         {menus.map((menu) => (
  <MenuView key={menu.id} menu={menu} onAddToCart={addToCart} />
))}
        </div>
      )}
      <aside aria-label="Cart">
  <h2>Cart</h2>
  {cartError && <p role="alert">{cartError}</p>}
  {cart.length === 0 ? (
    <p>Your cart is empty.</p>
  ) : (
    <>
      <ul>
        {cart.map((item) => (
          <li key={item.dish.id}>
            {item.dish.nameDa} – {item.dish.priceDkkInclVat} kr. × {item.quantity}
            <button type="button" onClick={() => changeQuantity(item.dish.id, -1)}>−</button>
            <button type="button" onClick={() => changeQuantity(item.dish.id, 1)}>+</button>
          </li>
        ))}
      </ul>
      <p><strong>Total: {total} kr.</strong></p>
      <button type="button" onClick={() => { setCart([]); setCartError(""); }}>Empty cart</button>
    </>
  )}
</aside>
    </section>
  );
}
