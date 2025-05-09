import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import Jimp from "jimp"; // Install this with `npm install jimp`

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const { productId } = await request.json();

  try {
    // Step 1: Retrieve Existing Product Images
    const productData = await admin.graphql(`
      query getProductImages($productId: ID!) {
        product(id: $productId) {
          media(first: 10) {
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
      }`, { variables: { "productId": productId } });
      
    const productDataNew = await productData.json();
    const productImages = productDataNew?.data?.product?.media?.edges || [];

    if (productImages.length === 0) {
      return json({ success: false, error: "No images found for this product." });
    }

    // Step 2: Download and Apply Watermark to Each Image
    const watermarkedImages = await Promise.all(
      productImages.map(async (imageData, index) => {
        const imageUrl = imageData.node.image.url;
        const image = await Jimp.read(imageUrl);
        const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
        const watermarkLayer = new Jimp(image.bitmap.width, image.bitmap.height, 0x00000000);

        const watermarkText = "IRFAN ALI";
        const textWidth = Jimp.measureText(font, watermarkText);
        const textHeight = Jimp.measureTextHeight(font, watermarkText, textWidth);

        const offsetX = 150;
        const offsetY = 150;
        const textSpacingX = textWidth * 2;
        const textSpacingY = textHeight * 2;

        watermarkLayer.rotate(45, false);

        for (let x = offsetX; x < image.bitmap.width; x += textSpacingX) {
          for (let y = offsetY; y < image.bitmap.height; y += textSpacingY) {
            watermarkLayer.print(font, x, y, watermarkText);
          }
        }

        image.composite(watermarkLayer, 0, 0, {
          mode: Jimp.BLEND_SOURCE_OVER,
          opacitySource: 0.2,
        });

        return await image.getBufferAsync(Jimp.MIME_JPEG);
      })
    );

    // Step 3: Delete Existing Images (AFTER watermarking process)
    const mediaIds = productImages.map(image => image.node.id);
    await admin.graphql(`
      mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
        productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
          deletedMediaIds
          deletedProductImageIds
          mediaUserErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        mediaIds,
        productId,
      },
    });

    // Step 4: Upload Watermarked Images
    for (const [index, watermarkedImageBuffer] of watermarkedImages.entries()) {
      const uploadResponse = await admin.graphql(`
        mutation generateStagedUploads($input: [StagedUploadInput!]!) {
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
      `, {
        variables: {
          input: [
            {
              filename: `watermarked_image_${index + 1}.png`,
              mimeType: "image/png",
              httpMethod: "POST",
              resource: "IMAGE",
              fileSize: watermarkedImageBuffer.length.toString() // Dynamic file size
            }
          ]
        },
      });

      const statidata = await uploadResponse.json();
      const { url, parameters, resourceUrl } = statidata.data.stagedUploadsCreate.stagedTargets[0];

      const formData = new FormData();
      parameters.forEach(({ name, value }) => formData.append(name, value));
      formData.append("file", new Blob([watermarkedImageBuffer], { type: "image/jpeg" }));

      await fetch(url, { method: "POST", body: formData });

      // Step 5: Associate Watermarked Image with the Product
      await admin.graphql(`
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                id
                status
                image {
                  originalSrc
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          productId,
          media: [
            {
              alt: `Watermarked Image ${index + 1}`,
              originalSource: resourceUrl,
              mediaContentType: "IMAGE"
            }
          ]
        }
      });
    }

    return json({ success: true, message: "All images successfully watermarked and replaced." });

  } catch (error) {
    console.error("Error replacing product images:", error);
    return json({ success: false, error: "Failed to replace product images." });
  }
};
