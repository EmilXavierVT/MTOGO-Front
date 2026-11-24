This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Customer checkout (B18 / #52)

Customers open checkout from the cart, enter their name, phone and delivery address, and see a DKK total including VAT before choosing an approved or declined local payment simulation. A changed price updates the displayed order and requires a new explicit acceptance; unavailable dishes can be removed without losing delivery details. Payment and connection errors stay in the form.

Successful checkout clears the cart and opens `/customer/orders/{orderId}`. Reloading this URL reads the saved order through an authenticated GET, including the restaurant, current status, saved line prices and delivery details. It never submits checkout again.

Run `npm test`, `npm run lint` and `npm run build`. The backend contract and failure codes are documented in `docs/customer-checkout-api.md` in the MTOGO backend repository. Local development uses the existing `/api` proxy; set `BACKEND_URL` before starting or building when the backend uses a different address.
