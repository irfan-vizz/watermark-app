import WishlistConfig from "../components/WishlistConfig";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Fetch products via API
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
    {
      products(first: 10) {
        edges {
          node {
            id
            title
          }
        }
      }
    }`
  );

  const products = await response.json();
  return json({ products: products.data.products.edges.map((p) => p.node) });
};

export default function WishlistPage() {
  return <WishlistConfig />;
}
