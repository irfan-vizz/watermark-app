import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";

export default function WishlistConfig() {
  const { products } = useLoaderData(); // Fetch products directly
  const fetcher = useFetcher();
  const [selectedProducts, setSelectedProducts] = useState([]);

  const handleSave = () => {
    fetcher.submit(
      { productIds: selectedProducts },
      { method: "post", action: "/api/wishlist", encType: "application/json" } // ✅ API route
    );
  };

  const toggleSelection = (productId) => {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  return (
    <div>
      <h2>Select Wishlist Products</h2>
      {products.length === 0 ? (
        <p>Loading products...</p>
      ) : (
        <div>
          {products.map((product) => (
            <div key={product.id}>
              <input
                type="checkbox"
                value={product.id}
                checked={selectedProducts.includes(product.id)}
                onChange={() => toggleSelection(product.id)}
              />
              <label htmlFor={`product-${product.id}`}>
                {product.title} (ID: {product.id})
              </label>
            </div>
          ))}
        </div>
      )}
      <button onClick={handleSave} disabled={fetcher.state === "submitting"}>
        Save Wishlist Settings
      </button>
    </div>
  );
}
