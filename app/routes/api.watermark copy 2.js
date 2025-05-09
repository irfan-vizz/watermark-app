import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import Jimp from "jimp";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const processedCount = parseInt(url.searchParams.get("processedCount") || "0");
  const collectionIds = url.searchParams.getAll("collectionIds");
  const currentCollectionId = collectionIds[0]?collectionIds[0]:"";
  console.log(`🚀 Starting batch from cursor: ${cursor || "beginning"}`);
  console.log(`🚀 Collection Id: ${currentCollectionId}`);
  let query;
  if(collectionIds.length > 0)
    {
      query= `query ProductsByCollection($cursor: String, $batchSize: Int!, $collectionId: ID!) {
  collection(id: $collectionId) {
    id
    title
    products(first: $batchSize, after: $cursor) {
      edges {
        cursor
        node {
          id
          title
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
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`
    }
  else{
    query=   `#graphql
    query GetProducts($cursor: String, $batchSize: Int!) {
      products(first: $batchSize, after: $cursor) {
        edges {
          cursor
          node {
            id
            title
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
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`
  }
  try {
    // Fetch products batch
    let response ;
    if(collectionIds.length > 0){
       response = await admin.graphql(
        query,
        {
          variables: {
            cursor,
            batchSize: 1,
            collectionId :currentCollectionId
          }
        }
      );
    }
    else{
       response = await admin.graphql(
        query,
        {
          variables: {
            cursor,
            batchSize: 1,
  
          }
        }
      );

    }

    const data = await response.json();
    
    if (!data.data?.products?.edges?.length) {
      return json({
        status: "completed",
        message: `✅ Finished processing ${processedCount} products`,
        processedCount
      });
    }
    let notDeletingArr = []
    var watrmarkExist = false;
    // Process each product
    for (const edge of data.data.products.edges) {
      const product = edge.node;
      console.log(`🔄 Processing product: ${product.title} (${product.id})`);

      try {
        let oldMediaIds = product.media.edges.map(edge => edge.node.id);
        const imageUrls = product.media.edges
          .map(edge => edge.node.image?.url)
          .filter(url => url);

        if (imageUrls.length === 0) {
          console.log('⚠️ No valid images found for this product');
          continue;
        }

        // Step 1: Apply watermark to all images
        const watermarkedImages = await Promise.all(
          imageUrls.map(async (imageUrl, index) => {
            try {
              const image = await Jimp.read(imageUrl);
              const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
              const watermarkLayer = new Jimp(image.bitmap.width, image.bitmap.height, 0x00000000);

              // 🔍 Check for watermark marker in top-left pixel
              const markerColor = Jimp.rgbaToInt(123, 222, 111, 255); // Unique marker color
              const pixelColor = image.getPixelColor(0, 0);
              console.log(pixelColor,markerColor,"sssssssssssssss")
              if (pixelColor === markerColor) {
                console.log(`💧 Image ${index + 1} already watermarked — skipping.`);
                notDeletingArr.push(index);
                watrmarkExist = true;
                return null;
              }

              const watermarkText = url.searchParams.get("text");
              const textWidth = Jimp.measureText(font, watermarkText);
              const textHeight = Jimp.measureTextHeight(font, watermarkText, textWidth);

              const offsetX = 150;
              const offsetY = 150;
              const textSpacingX = textWidth * 2;
              const textSpacingY = textHeight * 2;

              // watermarkLayer.rotate(45, false);

              for (let x = offsetX; x < image.bitmap.width; x += textSpacingX) {
                for (let y = offsetY; y < image.bitmap.height; y += textSpacingY) {
                  watermarkLayer.print(font, x, y, watermarkText);
                }
              }

              image.composite(watermarkLayer, 0, 0, {
                mode: Jimp.BLEND_SOURCE_OVER,
                opacitySource: 0.2,
              });

              // ✅ Add the invisible marker to (0, 0)
              image.setPixelColor(markerColor, 0, 0);

              return await image.getBufferAsync(Jimp.MIME_PNG);
            } catch (error) {
              console.error(`⚠️ Failed to watermark image ${index}:`, error.message);
              return null;
            }
          })
        );

        // Filter out any failed watermarking attempts
        const validWatermarkedImages = watermarkedImages.filter(img => img !== null);
        oldMediaIds = oldMediaIds.filter((_, index) => !notDeletingArr.includes(index));
        // Step 2: Delete old media
        if (oldMediaIds.length > 0) {
          // if(!watrmarkExist){
          await admin.graphql(
            `#graphql
            mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
              productDeleteMedia(
                productId: $productId,
                mediaIds: $mediaIds
              ) {
                deletedMediaIds
                mediaUserErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                productId: product.id,
                mediaIds: oldMediaIds
              }
            }
          );
          console.log(`  🗑️ Deleted ${oldMediaIds.length} old media items`);
        // }
        }

        // Step 3: Upload new watermarked images
        for (const [index, watermarkedImageBuffer] of validWatermarkedImages.entries()) {
          try {
            // Generate staged upload URL
            const uploadResponse = await admin.graphql(
              `#graphql
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
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  input: [
                    {
                      filename: `watermarked_${product.id.replace(/\//g, '_')}_${index}.jpg`,
                      mimeType: "image/jpeg",
                      httpMethod: "POST",
                      resource: "IMAGE",
                      fileSize: watermarkedImageBuffer.length.toString()
                    }
                  ]
                }
              }
            );

            const uploadData = await uploadResponse.json();
            const { url, parameters, resourceUrl } = uploadData.data.stagedUploadsCreate.stagedTargets[0];

            // Upload the file
            const formData = new FormData();
            parameters.forEach(({ name, value }) => formData.append(name, value));
            formData.append("file",  new Blob([watermarkedImageBuffer], { type: "image/jpeg" }));

            await fetch(url, { method: "POST", body: formData });

            // Associate with product
            await admin.graphql(
              `#graphql
              mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                productCreateMedia(productId: $productId, media: $media) {
                  media {
                    ... on MediaImage {
                      id
                    }
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  productId: product.id,
                  media: [
                    {
                      alt: `${product.title} - A1BUILD Watermarked`,
                      originalSource: resourceUrl,
                      mediaContentType: "IMAGE"
                    }
                  ]
                }
              }
            );

            console.log(`  ✅ Uploaded watermarked image ${index + 1}`);
          } catch (uploadError) {
            console.error(`⚠️ Failed to upload watermarked image ${index + 1}:`, uploadError.message);
          }
        }

        console.log(`✅ Successfully processed ${product.title}`);

      } catch (productError) {
        console.error(`❌ Failed to process product ${product.id}:`, productError.message);
      }
    }

    // Return next batch info
    const newProcessedCount = processedCount + data.data.products.edges.length;
    const nextCursor = data.data.products.pageInfo.endCursor;
    console.log('Next cursor:', nextCursor); 
    return json({
      status: "in_progress",
      message: `Processed ${newProcessedCount} products so far`,
      next: `/api/watermark?cursor=${encodeURIComponent(nextCursor)}&processedCount=${newProcessedCount}`,
      processedCount: newProcessedCount,
      hasNextPage: data.data.products.pageInfo.hasNextPage 
    });

  } catch (error) {
    console.error("‼️ Loader error:", error);
    return json({ 
      status: "error", 
      message: error.message 
    });
  }
};