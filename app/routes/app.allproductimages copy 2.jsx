import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("Fetching products...");
  const startTime = Date.now();

  const { admin } = await authenticate.admin(request);

  // Step 1: Get all products with their media
  const response = await admin.graphql(`
    #graphql
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
  `);

  const data = await response.json();

  const products = data.data.products.edges.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    media: edge.node.media.edges
      .map(m => ({
        id: m.node.id,
        url: m.node.image?.url
      }))
      .filter(m => m.url)
  }));

  console.log(`✅ Fetched ${products.length} products. Starting upload/delete flow...`);

  for (const product of products) {
    const oldMediaIds = product.media.map(m => m.id);

    // Step 2: Upload new media
    const newMediaInput = product.media.map((m, index) => ({
      originalSource: m.url,
      alt: `${product.title} image ${index + 1}`,
      mediaContentType: "IMAGE"
    }));

    const updateResponse = await admin.graphql(
      `#graphql
      mutation UpdateProductWithNewMedia($input: ProductInput!, $media: [CreateMediaInput!]) {
        productUpdate(input: $input, media: $media) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: { id: product.id },
          media: newMediaInput
        }
      }
    );

    const updateResult = await updateResponse.json();
    const updateErrors = updateResult.data.productUpdate.userErrors;

    if (updateErrors.length > 0) {
      console.error(`❌ Failed to upload new media for ${product.title}:`, updateErrors);
      continue; // Skip deletion if upload failed
    } else {
      console.log(`✅ Uploaded new media for ${product.title}`);
    }

    // Step 3: Delete old media
    if (oldMediaIds.length > 0) {
      const deleteResponse = await admin.graphql(
        `#graphql
        mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
          productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
            deletedMediaIds
            mediaUserErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            mediaIds: oldMediaIds,
            productId: product.id
          }
        }
      );

      const deleteResult = await deleteResponse.json();
      const deleteErrors = deleteResult.data.productDeleteMedia.mediaUserErrors;

      if (deleteErrors.length > 0) {
        console.warn(`⚠️ Failed to delete old media for ${product.title}:`, deleteErrors);
      } else {
        console.log(`🗑️ Deleted old media for ${product.title}`);
      }
    }
  }

  const endTime = Date.now();
  console.log(`✅ Finished processing ${products.length} products in ${((endTime - startTime) / 1000).toFixed(2)}s`)
  return json({
    message: `✅ Finished processing ${products.length} products in ${((endTime - startTime) / 1000).toFixed(2)}s`
  });
};




    // 3. Process current batch (simplified example)
    // for (const edge of data.data.products.edges) {
    //   const product = edge.node;
    //   console.log(`🔄 Processing product: ${product.title} (${product.id})`);
      
    //   try {
    //     const oldMediaIds = [];
    //     const newMediaInput = [];
    
    //     // Process each media item
    //     for (const mediaEdge of product.media.edges) {
    //       const media = mediaEdge.node;
    //       if (!media.image?.url) continue;
    
    //       oldMediaIds.push(media.id);
          
    //       try {
    //         console.log(`  Downloading image: ${media.image.url}`);
            
    //         // 1. Download the image
    //         const response = await axios.get(
    //           media.image.url.startsWith('//') 
    //             ? `https:${media.image.url}`
    //             : media.image.url,
    //           { 
    //             responseType: 'arraybuffer',
    //             timeout: 15000 
    //           }
    //         );
    
    //         // 2. Apply watermark
    //         console.log(`  Applying watermark to image ${media.id}`);
    //         const originalImage = await loadImage(Buffer.from(response.data));
    //         const canvas = createCanvas(originalImage.width, originalImage.height);
    //         const ctx = canvas.getContext('2d');
            
    //         // Draw original image
    //         ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
            
    //         // Watermark styling
    //         ctx.font = 'bold ' + Math.min(canvas.width / 10, 80) + 'px Arial';
    //         ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    //         ctx.textAlign = 'center';
    //         ctx.textBaseline = 'middle';
    //         ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    //         ctx.shadowBlur = 10;
    //         ctx.shadowOffsetX = 2;
    //         ctx.shadowOffsetY = 2;
            
    //         // Draw watermark text (centered)
    //         ctx.fillText('A1BUILD', canvas.width/2, canvas.height/2);
            
    //         // Convert to base64 for Shopify upload
    //         const watermarkedImage = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    //         const base64Image = watermarkedImage.toString('base64');
            
    //         newMediaInput.push({
    //           originalSource: `data:image/jpeg;base64,${base64Image}`,
    //           alt: `${product.title} watermarked`,
    //           mediaContentType: "IMAGE"
    //         });
    
    //       } catch (imageError) {
    //         console.error(`⚠️ Failed to watermark image ${media.id}:`, imageError.message);
    //         // Fallback to original image
    //         newMediaInput.push({
    //           originalSource: media.image.url,
    //           alt: `${product.title} original`,
    //           mediaContentType: "IMAGE"
    //         });
    //       }
    //     }
    
    //     // 3. Update product with watermarked images
    //     if (newMediaInput.length > 0) {
    //       console.log(`  Uploading ${newMediaInput.length} watermarked images`);
    //       const updateResponse = await admin.graphql(
    //         `#graphql
    //         mutation UpdateProductMedia($id: ID!, $media: [CreateMediaInput!]) {
    //           productUpdate(input: {id: $id, media: $media}) {
    //             product {
    //               id
    //               title
    //             }
    //             userErrors {
    //               field
    //               message
    //             }
    //           }
    //         }`,
    //         {
    //           variables: {
    //             id: product.id,
    //             media: newMediaInput
    //           }
    //         }
    //       );
    
    //       const updateData = await updateResponse.json();
    //       if (updateData.data.productUpdate.userErrors?.length > 0) {
    //         throw new Error(updateData.data.productUpdate.userErrors.map(e => e.message).join(', '));
    //       }
    
    //       // 4. Delete old media if new upload succeeded
    //       if (oldMediaIds.length > 0) {
    //         console.log(`  Deleting ${oldMediaIds.length} old media items`);
    //         await admin.graphql(
    //           `#graphql
    //           mutation DeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    //             productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
    //               deletedMediaIds
    //               mediaUserErrors {
    //                 field
    //                 message
    //               }
    //             }
    //           }`,
    //           {
    //             variables: {
    //               productId: product.id,
    //               mediaIds: oldMediaIds
    //             }
    //           }
    //         );
    //       }
    //     }
    
    //     console.log(`✅ Successfully processed ${product.title}`);
        
    //   } catch (productError) {
    //     console.error(`❌ Failed to process product ${product.id}:`, productError.message);
    //     // Continue with next product even if this one fails
    //   }
    // }
    // for (const edge of data.data.products.edges) {
    //   const product = edge.node;
    //   console.log(`🔄 Processing product: ${product.title} (${product.id})`);
      
    //   try {
    //     const oldMediaIds = [];
    //     const newMediaSources = [];
    
    //     // Process each media item
    //     for (const mediaEdge of product.media.edges) {
    //       const media = mediaEdge.node;
    //       if (!media.image?.url) continue;
    
    //       oldMediaIds.push(media.id);
          
    //       try {
    //         console.log(`  Downloading image: ${media.image.url}`);
            
    //         // 1. Download the image
    //         const response = await axios.get(
    //           media.image.url.startsWith('//') 
    //             ? `https:${media.image.url}`
    //             : media.image.url,
    //           { 
    //             responseType: 'arraybuffer',
    //             timeout: 15000 
    //           }
    //         );
    
    //         // 2. Apply watermark
    //         console.log(`  Applying watermark to image ${media.id}`);
    //         const originalImage = await loadImage(Buffer.from(response.data));
    //         const canvas = createCanvas(originalImage.width, originalImage.height);
    //         const ctx = canvas.getContext('2d');
            
    //         // Draw original image
    //         ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
            
    //         // Watermark styling
    //         ctx.font = 'bold ' + Math.min(canvas.width / 10, 80) + 'px Arial';
    //         ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    //         ctx.textAlign = 'center';
    //         ctx.textBaseline = 'middle';
    //         ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    //         ctx.shadowBlur = 10;
    //         ctx.shadowOffsetX = 2;
    //         ctx.shadowOffsetY = 2;
            
    //         // Draw watermark text (centered)
    //         ctx.fillText('A1BUILD', canvas.width/2, canvas.height/2);
            
    //         // Convert to base64 for Shopify upload
    //         const watermarkedImage = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    //         const base64Image = watermarkedImage.toString('base64');
            
    //         newMediaSources.push(`data:image/jpeg;base64,${base64Image}`);
    
    //       } catch (imageError) {
    //         console.error(`⚠️ Failed to watermark image ${media.id}:`, imageError.message);
    //         // Fallback to original image
    //         newMediaSources.push(media.image.url);
    //       }
    //     }
    
    //     // 3. Create new media files
    //     if (newMediaSources.length > 0) {
    //       console.log(`  Creating ${newMediaSources.length} new media files`);
          
    //       // First create all new media
    //       const createMediaResponses = await Promise.all(
    //         newMediaSources.map(source => 
    //           admin.graphql(
    //             `#graphql
    //             mutation CreateMedia($media: [CreateMediaInput!]!) {
    //               productCreateMedia(
    //                 productId: "${product.id}",
    //                 media: $media
    //               ) {
    //                 media {
    //                   id
    //                 }
    //                 mediaUserErrors {
    //                   field
    //                   message
    //                 }
    //               }
    //             }`,
    //             {
    //               variables: {
    //                 media: [{
    //                   originalSource: source,
    //                   mediaContentType: "IMAGE",
    //                   alt: `${product.title} watermarked`
    //                 }]
    //               }
    //             }
    //           )
    //         )
    //       );
    
    //       // Check for errors in media creation
    //       const createMediaResults = await Promise.all(
    //         createMediaResponses.map(r => r.json())
    //       );
          
    //       const creationErrors = createMediaResults.flatMap(r => 
    //         r.data?.productCreateMedia?.mediaUserErrors || []
    //       );
          
    //       if (creationErrors.length > 0) {
    //         throw new Error(`Media creation failed: ${
    //           creationErrors.map(e => e.message).join(', ')
    //         }`);
    //       }
    
    //       // 4. Delete old media if new media was created successfully
    //       if (oldMediaIds.length > 0) {
    //         console.log(`  Deleting ${oldMediaIds.length} old media items`);
    //         await admin.graphql(
    //           `#graphql
    //           mutation DeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    //             productDeleteMedia(
    //               productId: $productId, 
    //               mediaIds: $mediaIds
    //             ) {
    //               deletedMediaIds
    //               mediaUserErrors {
    //                 field
    //                 message
    //               }
    //             }
    //           }`,
    //           {
    //             variables: {
    //               productId: product.id,
    //               mediaIds: oldMediaIds
    //             }
    //           }
    //         );
    //       }
    //     }
    
    //     console.log(`✅ Successfully processed ${product.title}`);
        
    //   } catch (productError) {
    //     console.error(`❌ Failed to process product ${product.id}:`, productError.message);
    //     // Continue with next product even if this one fails
    //   }
    // }
    // for (const edge of data.data.products.edges) {
    //   const product = edge.node;
    //   console.log(`🔄 Processing product: ${product.title} (${product.id})`);
      
    //   try {
    //     const oldMediaIds = [];
    //     const newMediaInputs = [];
    
    //     // Process each media item
    //     for (const mediaEdge of product.media.edges) {
    //       const media = mediaEdge.node;
    //       if (!media.image?.url){ 
    //         console.log('⚠️ Skipping media with no URL');
    //         continue;}
    
    //       oldMediaIds.push(media.id);
          
    //       try {
    //         console.log(`  Downloading image: ${media.image.url}`);
            
    //         // 1. Download the image with error handling
    //         let imageBuffer;
    //         try {
    //           const response = await axios.get(
    //             media.image.url.startsWith('//') 
    //               ? `https:${media.image.url}`
    //               : media.image.url,
    //             { 
    //               responseType: 'arraybuffer',
    //               timeout: 15000 
    //             }
    //           );
    //           imageBuffer = Buffer.from(response.data);
    //           console.log(`  ✅ Downloaded ${imageBuffer.length} bytes`);
    //         } catch (downloadError) {
    //           console.error(`⚠️ Download failed for ${media.image.url}:`, downloadError.message);
    //           throw new Error(`Image download failed: ${downloadError.message}`);
    //         }
    
    //         // 2. Apply watermark
    //         console.log(`  Applying watermark to image ${media.id}`);
    //         let watermarkedImage;
    //         try {
    //           const originalImage = await loadImage(imageBuffer);
    //           console.log(`  Image dimensions: ${originalImage.width}x${originalImage.height}`);
    //           const canvas = createCanvas(originalImage.width, originalImage.height);
    //           const ctx = canvas.getContext('2d');
              
    //           ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
              
    //           // Watermark styling
    //           const fontSize = Math.min(canvas.width / 8, 100); // Better size calculation
    //           ctx.font = `bold ${fontSize}px 'Helvetica Neue', sans-serif`;
    //           // Set text color with opacity
    //           ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'; // More visible opacity
              
    //           // Text alignment
    //           ctx.textAlign = 'center';
    //           ctx.textBaseline = 'middle';
    //           ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    //           ctx.shadowBlur = 15;
    //           ctx.shadowOffsetX = 3;
    //           ctx.shadowOffsetY = 3;
              
    //           ctx.fillText('A1BUILD', canvas.width/2, canvas.height/2);
              
    //           watermarkedImage = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    //           console.log(`  ✅ Watermark applied (${watermarkedImage.length} bytes)`);
    //         } catch (watermarkError) {
    //           console.error(`⚠️ Watermark failed for ${media.id}:`, watermarkError.message);
    //           throw new Error(`Watermark application failed: ${watermarkError.message}`);
    //         }
    
    //         // 4. Upload to Shopify Files API first
    //     console.log('  Uploading to Shopify Files...');
    //     const fileUploadResponse = await admin.rest.resources.File.create({
    //       filename: `watermarked_${Date.now()}_${product.id.replace(/\//g, '_')}.jpg`,
    //       mimeType: 'image/jpeg',
    //       file: watermarkedImage,
    //       resource: 'image'
    //     });

    //     if (!fileUploadResponse.public_url) {
    //       throw new Error('Failed to get public URL after upload');
    //     }
    //     console.log(`  ✅ File uploaded: ${fileUploadResponse.public_url}`);

    //     newMediaInputs.push({
    //       mediaContentType: 'IMAGE',
    //       originalSource: fileUploadResponse.public_url,
    //       alt: `${product.title} watermarked`
    //     });
    
    //       } catch (imageError) {
    //         console.error(`⚠️ Image processing failed: ${imageError.message}`);
    //         // Fallback to original image
    //         newMediaInputs.push({
    //           mediaContentType: 'IMAGE',
    //           originalSource: media.image.url,
    //           alt: `${product.title} original`
    //         });
    //       }
    //     }
    
    //     // 4. Upload new media (one at a time to avoid Shopify limits)
    //     const createdMediaIds = [];
    //     for (const mediaInput of newMediaInputs) {
    //       try {
    //         console.log(`  Uploading media: ${mediaInput.alt.substring(0, 20)}...`);
    //         console.log(`  - Type: ${mediaInput.mediaContentType}`);
    //         console.log(`  - Source: ${mediaInput.originalSource.substring(0, 100)}...`);
    //         console.log(`  - Alt: ${mediaInput.alt}`);
    //         const createResponse = await admin.graphql(
    //           `#graphql
    //           mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    //             productCreateMedia(
    //               productId: $productId,
    //               media: $media
    //             ) {
    //               media {
    //                 id
    //               }
    //               mediaUserErrors {
    //                 field
    //                 message
    //               }
    //             }
    //           }`,
    //           {
    //             variables: {
    //               productId: product.id,
    //               media: [mediaInput] // Single media per request
    //             }
    //           }
    //         );
    
    //         const result = await createResponse.json();
    //         // console.log('  Upload response:', JSON.stringify(result, null, 2));
    //         if (result.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
    //           throw new Error(result.data.productCreateMedia.mediaUserErrors.map(e => e.message).join(', '));
    //         }
    
    //         if (result.data?.productCreateMedia?.media?.[0]?.id) {
    //           createdMediaIds.push(result.data.productCreateMedia.media[0].id);
    //           console.log(`  ✅ Upload successful, new media ID: ${result.data.productCreateMedia.media[0].id}`);
    //         }
    //         else {
    //           throw new Error('No media ID returned in response');
    //         }
    //       } catch (uploadError) {
    //         console.error(`⚠️ Media upload failed:`, uploadError.message);
    //         // Continue to next media even if one fails
    //       }
    //     }
    
    //     // 5. Only delete old media if we successfully created replacements
    //     if (createdMediaIds.length > 0 && oldMediaIds.length > 0) {
    //       console.log(`  Deleting ${oldMediaIds.length} old media items`);
    //       try {
    //         await admin.graphql(
    //           `#graphql
    //           mutation DeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    //             productDeleteMedia(
    //               productId: $productId, 
    //               mediaIds: $mediaIds
    //             ) {
    //               deletedMediaIds
    //               mediaUserErrors {
    //                 field
    //                 message
    //               }
    //             }
    //           }`,
    //           {
    //             variables: {
    //               productId: product.id,
    //               mediaIds: oldMediaIds
    //             }
    //           }
    //         );
    //       } catch (deleteError) {
    //         console.error(`⚠️ Media deletion failed:`, deleteError.message);
    //       }
    //     }
    
    //     console.log(`✅ Processed ${product.title} (${createdMediaIds.length} new media)`);
        
    //   } catch (productError) {
    //     console.error(`❌ Failed to process product ${product.id}:`, productError.message);
    //   }
    // }