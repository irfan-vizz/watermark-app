import { json } from "@remix-run/node";
import  prisma  from "../db.server";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
// const prisma = global.prisma || new PrismaClient();
// Fetch products from Shopify Admin API
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

// Save selected wishlist products to the database
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  if (!body.productIds || !Array.isArray(body.productIds)) {
    return json({ success: false, message: "Invalid product IDs." }, { status: 400 });
  }

  try {
    await prisma.WishlistConfig.upsert({
      where: { shop: "mayyas-app-store.myshopify.com" },
      update: { productIds: body.productIds },
      create: { shop: "mayyas-app-store.myshopify.com", productIds: body.productIds },
    });

    return json({ success: true,data: wishlistConfig });
  } catch (error) {
    console.error("Database error:", error);
    return json({ success: false, message: "Database error" }, { status: 500 });
  }
};
