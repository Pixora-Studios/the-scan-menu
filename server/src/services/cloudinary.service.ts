import { v2 as cloudinary } from 'cloudinary';

export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Generates a signed upload signature for direct-to-Cloudinary uploads
   */
  generateUploadSignature(restaurantId: string): {
    signature: string;
    timestamp: number;
    folder: string;
    apiKey: string;
    cloudName: string;
  } {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `pixora-qr/${restaurantId}/menu`;

    const paramsToSign = {
      timestamp,
      folder,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!
    );

    return {
      signature,
      timestamp,
      folder,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    };
  }
}

export default CloudinaryService;
