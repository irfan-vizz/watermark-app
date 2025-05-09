import Jimp from 'jimp';
import { addTextWatermark } from 'jimp-watermark';

export async function applyWatermarkAndUpload(imageUrl, watermarkText, productId, shop, accessToken) {
  try {
    const image = await Jimp.read(imageUrl);

    const options = {
      text: watermarkText,
      textSize: 32,
      opacity: 0.5,
      dx: 10,
      dy: 10,
    };

    const watermarkedImage = await addTextWatermark(image, options);

    // Convert image to base64 (required for Shopify API)
    const watermarkedImageBuffer = await watermarkedImage.getBufferAsync(Jimp.MIME_JPEG);
    const base64Image = `data:image/jpeg;base64,${watermarkedImageBuffer.toString('base64')}`;

    // Upload image to Shopify
    const response = await fetch(`https://${shop}/admin/api/2023-10/products/${productId}/images.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        image: {
          attachment: base64Image, // Shopify requires base64 encoded image
        }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.errors || 'Failed to upload image to Shopify');
    }

    return data.image;
  } catch (error) {
    console.error('Error applying watermark and uploading:', error);
    throw error;
  }
}
