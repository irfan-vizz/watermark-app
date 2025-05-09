import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  console.log("Fetching products..."); // Start message
  const startTime = Date.now(); // Start time

  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query {
        products(first: 100) {
          edges {
            node {
              id
              title
              media(first: 20) {
                edges {
                  node {
                    ... on MediaImage {
                      id
                      image {
                        url
                      }
                    }
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

  const products = data.data.products.edges.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    images: edge.node.media.edges.map(mediaEdge => mediaEdge?.node?.image?.url).filter(Boolean)
  }));

  const endTime = Date.now(); // End time
  const duration = (endTime - startTime) / 1000; // Convert to seconds
  const allImageUrls = products.flatMap(product => product.images);
  //  console.log(products);
  // console.log(`✅ Products fetched successfully in ${duration.toFixed(2)} seconds.`);
  const stagedUploadInput = allImageUrls.map((_, index) => ({
    filename: `image${index + 1}.png`, // You can adjust the extension if needed
    mimeType: "image/png", // Adjust if you support other types
    httpMethod: "POST",
    resource: "IMAGE"
  }));
  const uploadResponse = await admin.graphql(
    `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
        }
      }
    `,
    {
      variables: {
        input: stagedUploadInput
      }
    }
  );
  const uploadData = await uploadResponse.json();
  //return json(products);
  console.log('irfaaaaaaaaaaaan')
  return json({
    products,
    stagedUploads: uploadData.data.stagedUploadsCreate.stagedTargets
  });
};
