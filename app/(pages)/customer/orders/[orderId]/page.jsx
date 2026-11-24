import { Suspense } from "react";
import OrderConfirmation from "../../components/OrderConfirmation";

export default function OrderPage() {
  return (
    <Suspense fallback={<p role="status">Loading order...</p>}>
      <OrderConfirmation />
    </Suspense>
  );
}
