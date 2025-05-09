
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page, Button, Modal, Checkbox, Card, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
// loader function to fetch all products
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getProducts {
      products(first: 100) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }`
  );

  const responseJson = await response.json();
  return responseJson.data.products.edges.map(({ node }) => node);
};

export default function AdditionalPage() {
  const products = useLoaderData(); // Get products from the loader
  const [selectedProducts, setSelectedProducts] = useState([]); // Track selected products
  const [isModalOpen, setIsModalOpen] = useState(false); // Track modal state

  const toggleProduct = (product) => {
    setSelectedProducts((prev) =>
      prev.some((p) => p.id === product.id)
        ? prev.filter((p) => p.id !== product.id) // Remove if already selected
        : [...prev, product] // Add if not selected
    );
  };
  return (
    <Page title="Product Selector">
    <Button onClick={() => setIsModalOpen(true)}>Select Products</Button>

    {/* Popup Modal */}
    <Modal
      open={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      title="Select Products"
      primaryAction={{
        content: "Confirm Selection",
        onAction: () => setIsModalOpen(false),
      }}
    >
      <Modal.Section>
        {products.map((product) => (
          <Checkbox
            key={product.id}
            label={product.title}
            checked={selectedProducts.some((p) => p.id === product.id)}
            onChange={() => toggleProduct(product)}
          />
        ))}
      </Modal.Section>
    </Modal>

    {/* Display Selected Products */}
    <Card title="Selected Products">
      {selectedProducts.length > 0 ? (
        selectedProducts.map((product) => (
          <Text key={product.id}>{product.title}</Text>
        ))
      ) : (
        <Text>No products selected.</Text>
      )}
    </Card>
  </Page>
  );
}

