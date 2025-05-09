import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

// Loader function to fetch products (server-only)
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query {
        products(first: 10) {
          edges {
            node {
              id
              title
              images(first: 1) {
                edges {
                  node {
                    id
                    src
                  }
                }
              }
            }
          }
        }
      }
    `
  );
  const data = await response.json();
  return json(data.data.products.edges);
};

// Component to display products (client-side)
export default function Products() {
  const products = useLoaderData();
  const [updatedImages, setUpdatedImages] = useState({});

  const handleWatermark = async (imageUrl, productId) => {
    try {
      const response = await fetch("/api/apply-watermark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl, productId }),
      });

      const result = await response.json();

      if (result.success) {
        setUpdatedImages((prevImages) => ({
          ...prevImages,
          [productId]: result.image, // Display the updated image in UI
        }));

        // alert("Watermark applied successfully!");
      } else {
        throw new Error(result.error || "Failed to apply watermark.");
      }
    } catch (error) {
      console.error("Error handling watermark:", error);
      alert("Failed to apply watermark.");
    }
  };

  return (
    <div>
      <h1>Products</h1>
      <ul>
        {products.map((product) => (
          <li key={product.node.id}>
            <h2>{product.node.title} -{product.node.id}</h2>
            <img
              src={updatedImages[product.node.id] || product.node.images.edges[0]?.node.src}
              alt={product.node.title}
              width="500"
            />
            <button
              onClick={() =>
                handleWatermark(
                  product.node.images.edges[0]?.node.src,
                  product.node.id
                )
              }
            >
              Apply Watermark
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
