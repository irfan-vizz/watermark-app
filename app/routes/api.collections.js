// routes/api/collections.ts
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      collections(first: 50) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `);

  const data = await response.json();
  const collections = data.data.collections.edges.map(edge => edge.node);

  return json({ collections });
};
