import { json } from "@remix-run/node";
import  prisma  from "../db.server"; // Adjust path based on your project
export const loader = async () => {
  try {
    const wishlistConfig = await prisma.WishlistConfig.findMany({
      select: { productIds: true },
    });

    console.log("Raw wishlistConfig:", wishlistConfig);

    // Parse any stringified arrays inside productIds
    const productIds = wishlistConfig.flatMap((item) => {
      try {
        return JSON.parse(item.productIds); // Ensure it's a real array
      } catch {
        return item.productIds; // If not a stringified JSON, return as is
      }
    });

    console.log("Parsed productIds:", productIds);

    return json(productIds, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("🔥 Prisma Error:", error);
    return json({ error: "Failed to fetch wishlist products" }, { status: 500 });
  }
};
