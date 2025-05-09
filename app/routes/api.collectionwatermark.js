import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import sharp from "sharp";
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const processedCount = parseInt(url.searchParams.get("processedCount") || "0");
  const collectionIds = url.searchParams.getAll("collectionIds");
  const currentCollectionId = collectionIds[0] || "";
  
  console.log(`🚀 Starting batch from cursor: ${cursor || "beginning"}`);
  console.log(`🚀 Collection Id: ${currentCollectionId}`);

  // Watermark generation function (unchanged)
  function generateRepeatedText(text, width, height, fontSize, spacingX, spacingY, angle = -30, color, maxOpacity = 0.2, cutoffRadius = 100) {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);
    const fadeStart = cutoffRadius;
    const fadeEnd = maxDistance;
    let result = "";
    
    for (let y = 0; y < height; y += spacingY) {
      for (let x = 0; x < width; x += spacingX) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx ** 2 + dy ** 2);
        const normalized = Math.min(1, Math.max(0, (distance - fadeStart) / (fadeEnd - fadeStart)));
        const opacity = (1 - Math.pow(1 - normalized, 2)) * maxOpacity;
        result += `<text x="${x}" y="${y}" opacity="${opacity}" class="watermark" transform="rotate(${angle} ${x},${y})">${text}</text>`;
      }
    }

    return `
      <svg width="${width}" height="${height}">
        <style>
          .watermark {
            fill: ${color};
            font-size: ${fontSize}px;
            font-family: Arial, sans-serif;
          }
        </style>
        <g fill="${maxOpacity > 0 ? 'black' : 'transparent'}" color="${color}">
          ${result}
        </g>
      </svg>
    `;
  }

  // GraphQL queries (unchanged)
  const query = collectionIds.length > 0 
    ? `query ProductsByCollection($cursor: String, $batchSize: Int!, $collectionId: ID!) {
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
    : `#graphql
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
      }`;

  try {
    // Fetch products batch
    const response = await admin.graphql(
      query,
      {
        variables: {
          cursor,
          batchSize: 1,
          ...(collectionIds.length > 0 && { collectionId: currentCollectionId })
        }
      }
    );

    const data = await response.json();
    
    // Check for GraphQL errors
    if (data.errors) {
      throw new Error(`GraphQL Error: ${data.errors.map(e => e.message).join(', ')}`);
    }

    const products = collectionIds.length > 0 
      ? data.data?.collection?.products 
      : data.data?.products;

    if (!products?.edges?.length) {
      return json({
        status: "completed",
        message: `✅ Finished processing ${processedCount} products`,
        processedCount
      });
    }

    // Process each product
    for (const edge of products.edges) {
      const product = edge.node;
      console.log(`🔄 Processing product: ${product.title} (${product.id})`);

      let originalMediaIds = product.media.edges.map(edge => edge.node.id);
      const imageUrls = product.media.edges
        .map(edge => edge.node.image?.url)
        .filter(url => url);

      if (imageUrls.length === 0) {
        console.log('⚠️ No valid images found for this product');
        continue;
      }

      try {
        // Track skipped images to preserve them
        const skippedIndices = [];
        const watermarkErrors = [];

        // Step 1: Apply watermark to all images
        const watermarkedImages = await Promise.all(
          imageUrls.map(async (imageUrl, index) => {
            try {
              const watermarkText = url.searchParams.get("text") || "WATERMARK";
              const watermarkAngle = parseFloat(url.searchParams.get("angle") || "-30");
              const color = url.searchParams.get("color") || "#000000";
              const opacity = parseFloat(url.searchParams.get("opacity") || "0.2");
              let cutoff = Number(url.searchParams.get("cutoff") || 100);
              let fontSize = Number(url.searchParams.get("fontSize") || 12);
              const verticalSpacingMultiplier = 2.5;

              // Skip already watermarked images
              if (imageUrl.includes("watermarked")) {
                console.log(`⏭️ Skipping image ${index} as it appears already watermarked`);
                skippedIndices.push(index);
                return { status: 'skipped', index };
              }

              // Load image with proper error handling
              const imageResponse = await fetch(imageUrl);
              if (!imageResponse.ok) {
                throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
              }
              
              const imageBuffer = await imageResponse.arrayBuffer()
                .then(buf => Buffer.from(buf))
                .catch(err => {
                  throw new Error(`Failed to convert image buffer: ${err.message}`);
                });

              const image = sharp(imageBuffer);
              const metadata = await image.metadata()
                .catch(err => {
                  throw new Error(`Failed to read image metadata: ${err.message}`);
                });

              if (!metadata.width || !metadata.height) {
                throw new Error("Invalid image dimensions");
              }

              // Calculate scaled parameters
              const width = metadata.width;
              const height = metadata.height;
              const REFERENCE_WIDTH = 1000;
              const REFERENCE_HEIGHT = 1000;
              const scaleFactor = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
              cutoff = Math.round(cutoff * scaleFactor);
              fontSize = Math.round(fontSize * scaleFactor);
              const spacingX = Math.round(fontSize * 4 * verticalSpacingMultiplier);
              const spacingY = Math.round(fontSize * 3 * verticalSpacingMultiplier);

              // Generate watermark
              const svgWatermark = generateRepeatedText(
                watermarkText, 
                width, 
                height, 
                fontSize, 
                spacingX, 
                spacingY,
                watermarkAngle, 
                color, 
                opacity, 
                cutoff
              );

              const svgBuffer = Buffer.from(svgWatermark);

              // Apply watermark
              const resultBuffer = await image
                .composite([{ input: svgBuffer, gravity: "center" }])
                .png()
                .toBuffer()
                .catch(err => {
                  throw new Error(`Failed to apply watermark: ${err.message}`);
                });

              return { status: 'success', buffer: resultBuffer, index };
            } catch (error) {
              console.error(`⚠️ Failed to watermark image ${index}:`, error.message);
              watermarkErrors.push({ index, error: error.message });
              return { status: 'failed', error: error.message, index };
            }
          })
        );

        // If any watermarking failed, abort the entire product
        if (watermarkErrors.length > 0) {
          throw new Error(
            `Failed to watermark ${watermarkErrors.length} images: ` +
            watermarkErrors.map(e => `Image ${e.index} (${e.error})`).join(', ')
          );
        }

        // Get successful watermarks
        const validWatermarkedImages = watermarkedImages
          .filter(img => img.status === 'success')
          .map(img => img.buffer);

        // If no valid watermarks were created, skip this product
        if (validWatermarkedImages.length === 0) {
          console.log('⚠️ No watermarked images created for this product');
          continue;
        }

        // Filter out skipped images from deletion list
        const mediaIdsToDelete = originalMediaIds.filter((_, index) => !skippedIndices.includes(index));

        // Step 2: Upload new watermarked images
        const uploadedMediaIds = [];
        let uploadFailed = false;

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
                  input: [{
                    filename: `watermarked_${product.id.replace(/\//g, '_')}_${index}.jpg`,
                    mimeType: "image/jpeg",
                    httpMethod: "POST",
                    resource: "IMAGE",
                    fileSize: watermarkedImageBuffer.length.toString()
                  }]
                }
              }
            );

            const uploadData = await uploadResponse.json();
            if (uploadData.errors || uploadData.data.stagedUploadsCreate.userErrors?.length > 0) {
              throw new Error(
                uploadData.errors?.[0]?.message || 
                uploadData.data.stagedUploadsCreate.userErrors?.[0]?.message || 
                "Unknown upload error"
              );
            }

            const { url, parameters, resourceUrl } = uploadData.data.stagedUploadsCreate.stagedTargets[0];

            // Upload the file
            const formData = new FormData();
            parameters.forEach(({ name, value }) => formData.append(name, value));
            formData.append("file", new Blob([watermarkedImageBuffer], { type: "image/jpeg" }));

            const uploadResult = await fetch(url, { method: "POST", body: formData });
            if (!uploadResult.ok) {
              throw new Error(`Upload failed with status ${uploadResult.status}`);
            }

            // Associate with product
            const mediaResponse = await admin.graphql(
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
                  media: [{
                    alt: `${product.title} - Watermarked`,
                    originalSource: resourceUrl,
                    mediaContentType: "IMAGE"
                  }]
                }
              }
            );

            const mediaData = await mediaResponse.json();
            if (mediaData.errors || mediaData.data.productCreateMedia.userErrors?.length > 0) {
              throw new Error(
                mediaData.errors?.[0]?.message || 
                mediaData.data.productCreateMedia.userErrors?.[0]?.message || 
                "Unknown media creation error"
              );
            }

            uploadedMediaIds.push(mediaData.data.productCreateMedia.media[0].id);
            console.log(`  ✅ Uploaded watermarked image ${index + 1}`);

          } catch (uploadError) {
            console.error(`⚠️ Failed to upload watermarked image ${index + 1}:`, uploadError.message);
            uploadFailed = true;
            break; // Stop uploading if one fails
          }
        }

        // If upload failed, don't delete any images
        if (uploadFailed) {
          throw new Error("Failed to upload one or more watermarked images - original images preserved");
        }

        // Only delete old media if all new media was successfully uploaded
        if (mediaIdsToDelete.length > 0 && uploadedMediaIds.length > 0) {
          try {
            const deleteResponse = await admin.graphql(
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
                  mediaIds: mediaIdsToDelete
                }
              }
            );

            const deleteData = await deleteResponse.json();
            if (deleteData.errors || deleteData.data.productDeleteMedia.mediaUserErrors?.length > 0) {
              console.error('⚠️ Media deletion errors:', 
                deleteData.errors?.[0]?.message || 
                deleteData.data.productDeleteMedia.mediaUserErrors?.[0]?.message
              );
            } else {
              console.log(`  🗑️ Deleted ${mediaIdsToDelete.length} old media items`);
            }
          } catch (deleteError) {
            console.error('⚠️ Failed to delete old media:', deleteError.message);
          }
        }

        console.log(`✅ Successfully processed ${product.title}`);

      } catch (productError) {
        console.error(`❌ Failed to process product ${product.id}:`, productError.message);
        // Continue to next product instead of stopping entire batch
        continue;
      }
    }

    // Return next batch info
    const newProcessedCount = processedCount + products.edges.length;
    const nextCursor = products.pageInfo.endCursor;
    
    return json({
      status: products.pageInfo.hasNextPage ? "in_progress" : "completed",
      message: `Processed ${newProcessedCount} products so far`,
      next:`/api/collectionwatermark?cursor=${encodeURIComponent(nextCursor)}&processedCount=${newProcessedCount}`,
      processedCount: newProcessedCount,
      hasNextPage: products.pageInfo.hasNextPage 
    });

  } catch (error) {
    console.error("‼️ Loader error:", error);
    return json({ 
      status: "error", 
      message: error.message,
      processedCount 
    });
  }
};


//OLD cODE

// import { json } from "@remix-run/node";
// import { authenticate } from "../shopify.server";
// import sharp from "sharp";
// export const loader = async ({ request }) => {
//   const { admin } = await authenticate.admin(request);
//   const url = new URL(request.url);
//   const cursor = url.searchParams.get("cursor") || null;
//   const processedCount = parseInt(url.searchParams.get("processedCount") || "0");
//   const collectionIds = url.searchParams.getAll("collectionIds");
//   const currentCollectionId = collectionIds[0]?collectionIds[0]:"";
//   console.log(`🚀 Starting batch from cursor: ${cursor || "beginning"}`);
//   console.log(`🚀 Collection Id: ${currentCollectionId}`);
//   let query;


//   function generateRepeatedText(text, width, height, fontSize, spacingX, spacingY, angle = -30, color, maxOpacity = 0.2, cutoffRadius = 100) {
//     const centerX = width / 2;
//     const centerY = height / 2;
 
//     const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2); // distance to farthest corner
//     const fadeStart = cutoffRadius;
//     const fadeEnd = maxDistance;
//   // console.log(centerX,"centerX")
//   // console.log(centerY,"centerY")
//   // console.log(maxDistance,"maxDistance")
//     let result = "";
//     for (let y = 0; y < height; y += spacingY) {
//       for (let x = 0; x < width; x += spacingX) {
//         const dx = x - centerX;
//         const dy = y - centerY;
//         const distance = Math.sqrt(dx ** 2 + dy ** 2);
//         // console.log(dx,"dx")
//         // console.log(dy,"dy")
//         // console.log(distance,"distance")
//         // Scale opacity from 0 (center) to maxOpacity (corners)
//         const normalized = Math.min(1, Math.max(0, (distance - fadeStart) / (fadeEnd - fadeStart)));
//         // const opacity = ((distance / maxDistance) * maxOpacity).toFixed(2);
//         // console.log(opacity,"opacity")
//         const opacity = (1 - Math.pow(1 - normalized, 2)) * maxOpacity;
//         result += `<text x="${x}" y="${y}" opacity="${opacity}" class="watermark" transform="rotate(${angle} ${x},${y})">${text}</text>`;
//       }
//     }
  
//     return `
//       <svg width="${width}" height="${height}">
//         <style>
//           .watermark {
//             fill: ${color};
//             font-size: ${fontSize}px;
//             font-family: Arial, sans-serif;
//           }
//         </style>
//         <g fill="${maxOpacity > 0 ? 'black' : 'transparent'}" color="${color}">
//           ${result}
//         </g>
//       </svg>
//     `;
//   }
  
//   if(collectionIds.length > 0)
//     {
//       query= `query ProductsByCollection($cursor: String, $batchSize: Int!, $collectionId: ID!) {
//   collection(id: $collectionId) {
//     id
//     title
//     products(first: $batchSize, after: $cursor) {
//       edges {
//         cursor
//         node {
//           id
//           title
//           media(first: 10) {
//             edges {
//               node {
//                 ... on MediaImage {
//                   id
//                   image {
//                     url
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//       pageInfo {
//         hasNextPage
//         endCursor
//       }
//     }
//   }
// }`
//     }
//   else{
//     query=   `#graphql
//     query GetProducts($cursor: String, $batchSize: Int!) {
//       products(first: $batchSize, after: $cursor) {
//         edges {
//           cursor
//           node {
//             id
//             title
//             media(first: 10) {
//               edges {
//                 node {
//                   ... on MediaImage {
//                     id
//                     image {
//                       url
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//         pageInfo {
//           hasNextPage
//           endCursor
//         }
//       }
//     }`
//   }
//   try {
//     // Fetch products batch
//     let response ;
//     if(collectionIds.length > 0){
//        response = await admin.graphql(
//         query,
//         {
//           variables: {
//             cursor,
//             batchSize: 1,
//             collectionId :currentCollectionId
//           }
//         }
//       );
//     }
//     else{
//        response = await admin.graphql(
//         query,
//         {
//           variables: {
//             cursor,
//             batchSize: 1,
  
//           }
//         }
//       );

//     }

//     const data = await response.json();
    
//     if (!data.data?.collection?.products?.edges?.length) {
//       return json({
//         status: "completed",
//         message: `✅ Finished processing ${processedCount} products`,
//         processedCount
//       });
//     }
//     let notDeletingArr = []
//     var watrmarkExist = false;
//     // Process each product
//     for (const edge of data.data.collection.products.edges) {
//       const product = edge.node;
//       console.log(`🔄 Processing product: ${product.title} (${product.id})`);
     
//       try {
//         let oldMediaIds = product.media.edges.map(edge => edge.node.id);
//         const imageUrls = product.media.edges
//           .map(edge => edge.node.image?.url)
//           .filter(url => url);

//         if (imageUrls.length === 0) {
//           console.log('⚠️ No valid images found for this product');
//           continue;
//         }

//         // Step 1: Apply watermark to all images
      
//         // const watermarkedImages = await Promise.all(
//         //   imageUrls.map(async (imageUrl, index) => {
//         //     try {
//         //       const watermarkText = url.searchParams.get("text") || "WATERMARK";
        
//         //       // Load image from URL
//         //       const imageBuffer = await fetch(imageUrl).then(res => res.arrayBuffer()).then(buf => Buffer.from(buf));
//         //       const image = sharp(imageBuffer);
//         //       const metadata = await image.metadata();
        
//         //       if (!metadata.width || !metadata.height) throw new Error("Invalid image dimensions");
        
//         //       const width = metadata.width;
//         //       const height = metadata.height;
        
//         //       // 🖍️ Font size proportional to width
//         //       const fontSize = Math.round(width / 15);
//         //       const spacingX = fontSize * 4;
//         //       const spacingY = fontSize * 3;
        
//         //       // Generate repeated SVG watermark text
//         //       const svgWatermark = `
//         //         <svg width="${width}" height="${height}">
//         //           <style>
//         //             .watermark {
//         //               fill: rgba(0, 0, 0, 0.2);
//         //               font-size: ${fontSize}px;
//         //               font-family: Arial, sans-serif;
//         //             }
//         //           </style>
//         //           ${generateRepeatedText(watermarkText, width, height, fontSize, spacingX, spacingY)}
//         //         </svg>
//         //       `;
        
//         //       const svgBuffer = Buffer.from(svgWatermark);
        
//         //       // 🔧 Composite SVG watermark on top
//         //       const resultBuffer = await image
//         //         .composite([{ input: svgBuffer, gravity: "center" }])
//         //         .png()
//         //         .toBuffer();
        
//         //       return resultBuffer;
//         //     } catch (error) {
//         //       console.error(`⚠️ Failed to watermark image ${index}:`, error.message);
//         //       return null;
//         //     }
//         //   })
//         // );
//         const watermarkedImages = await Promise.all(
//           imageUrls.map(async (imageUrl, index) => {
//             try {
//               const watermarkText = url.searchParams.get("text") || "WATERMARK";
//               const watermarkAngle = parseFloat(url.searchParams.get("angle") || "-30");
//               const color = url.searchParams.get("color") || "#000000";
//               const opacity = parseFloat(url.searchParams.get("opacity") || "0.2");
//               let cutoff = Number(url.searchParams.get("cutoff") || 100);
//               let fontSize = Number(url.searchParams.get("fontSize") || 12);
//               const verticalSpacingMultiplier = 2.5;

//               // ✅ Skip image if already watermarked based on filename
//               if (imageUrl.includes("watermarked")) {
//                 console.log(`⏭️ Skipping image ${index} as it appears already watermarked`);
//                 notDeletingArr.push(index); // prevent deletion if you're retaining original image
//                 return null;
//               }
        
//               // Load image from URL
//               const imageBuffer = await fetch(imageUrl)
//                 .then(res => res.arrayBuffer())
//                 .then(buf => Buffer.from(buf));
//               const image = sharp(imageBuffer);
//               const metadata = await image.metadata();
        
//               if (!metadata.width || !metadata.height) throw new Error("Invalid image dimensions");
        
//               const width = metadata.width;
//               const height = metadata.height;
//               const REFERENCE_WIDTH = 1000;
//               const REFERENCE_HEIGHT = 1000;
//               const scaleFactor = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
//                cutoff = Math.round(cutoff * scaleFactor);
        
//             //  🖍️ Font size proportional to width
//               // const fontSize = Math.round(width / 30);
//               fontSize = Math.round(fontSize  * scaleFactor);
//               const spacingX = Math.round(fontSize * 4 * verticalSpacingMultiplier);
//               const spacingY = Math.round(fontSize * 3  * verticalSpacingMultiplier);
//               const svgWatermark = generateRepeatedText(watermarkText, width, height, fontSize, spacingX, spacingY,watermarkAngle, color, opacity, cutoff);

//               const svgBuffer = Buffer.from(svgWatermark);
        
//               // 🔧 Composite SVG watermark on top
//               const resultBuffer = await image
//                 .composite([{ input: svgBuffer, gravity: "center" }])
//                 .png()
//                 .toBuffer();
        
//               return resultBuffer;
//             } catch (error) {
//               console.error(`⚠️ Failed to watermark image ${index}:`, error.message);
//               return null;
//             }
//           })
//         );
        
//          oldMediaIds = oldMediaIds.filter((_, index) => !notDeletingArr.includes(index));
//         // Filter out any failed watermarking attempts
//         const validWatermarkedImages = watermarkedImages.filter(img => img !== null);
// console.log(notDeletingArr,"notttttttttt")
//         // Step 2: Delete old media
//         if (oldMediaIds.length > 0) {
//           if(!watrmarkExist){
//           await admin.graphql(
//             `#graphql
//             mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
//               productDeleteMedia(
//                 productId: $productId,
//                 mediaIds: $mediaIds
//               ) {
//                 deletedMediaIds
//                 mediaUserErrors {
//                   field
//                   message
//                 }
//               }
//             }`,
//             {
//               variables: {
//                 productId: product.id,
//                 mediaIds: oldMediaIds
//               }
//             }
//           );
//           console.log(`  🗑️ Deleted ${oldMediaIds.length} old media items`);
//         }
//         }

//         // Step 3: Upload new watermarked images
//         for (const [index, watermarkedImageBuffer] of validWatermarkedImages.entries()) {
//           try {
//             // Generate staged upload URL
//             const uploadResponse = await admin.graphql(
//               `#graphql
//               mutation generateStagedUploads($input: [StagedUploadInput!]!) {
//                 stagedUploadsCreate(input: $input) {
//                   stagedTargets {
//                     url
//                     resourceUrl
//                     parameters {
//                       name
//                       value
//                     }
//                   }
//                   userErrors {
//                     field
//                     message
//                   }
//                 }
//               }`,
//               {
//                 variables: {
//                   input: [
//                     {
//                       filename: `watermarked_${product.id.replace(/\//g, '_')}_${index}.jpg`,
//                       mimeType: "image/jpeg",
//                       httpMethod: "POST",
//                       resource: "IMAGE",
//                       fileSize: watermarkedImageBuffer.length.toString()
//                     }
//                   ]
//                 }
//               }
//             );

//             const uploadData = await uploadResponse.json();
//             const { url, parameters, resourceUrl } = uploadData.data.stagedUploadsCreate.stagedTargets[0];

//             // Upload the file
//             const formData = new FormData();
//             parameters.forEach(({ name, value }) => formData.append(name, value));
//             formData.append("file",  new Blob([watermarkedImageBuffer], { type: "image/jpeg" }));

//             await fetch(url, { method: "POST", body: formData });

//             // Associate with product
//             await admin.graphql(
//               `#graphql
//               mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
//                 productCreateMedia(productId: $productId, media: $media) {
//                   media {
//                     ... on MediaImage {
//                       id
//                     }
//                   }
//                   userErrors {
//                     field
//                     message
//                   }
//                 }
//               }`,
//               {
//                 variables: {
//                   productId: product.id,
//                   media: [
//                     {
//                       alt: `${product.title} - A1BUILD Watermarked`,
//                       originalSource: resourceUrl,
//                       mediaContentType: "IMAGE"
//                     }
//                   ]
//                 }
//               }
//             );

//             console.log(`  ✅ Uploaded watermarked image ${index + 1}`);
//           } catch (uploadError) {
//             console.error(`⚠️ Failed to upload watermarked image ${index + 1}:`, uploadError.message);
//           }
//         }

//         console.log(`✅ Successfully processed ${product.title}`);

//       } catch (productError) {
//         console.error(`❌ Failed to process product ${product.id}:`, productError.message);
//       }
//     }

//     // Return next batch info
//     const newProcessedCount = processedCount + data.data.collection.products.edges.length;
//     const nextCursor = data.data.collection.products.pageInfo.endCursor;
//     console.log('Next cursor:', nextCursor); 
//     return json({
//       status: "in_progress",
//       message: `Processed ${newProcessedCount} products so far`,
//       next: `/api/collectionwatermark?cursor=${encodeURIComponent(nextCursor)}&processedCount=${newProcessedCount}`,
//       processedCount: newProcessedCount,
//       hasNextPage: data.data.collection.products.pageInfo.hasNextPage 
//     });

//   } catch (error) {
//     console.error("‼️ Loader error:", error);
//     return json({ 
//       status: "error", 
//       message: error.message 
//     });
//   }
// };