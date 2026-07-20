import crypto from 'crypto';
import QRCode from 'qrcode';

export class TableService {
  /**
   * Generates a secure, unguessable URL-safe token of 24 characters.
   */
  generateSecureToken(length = 24): string {
    // Generate secure random bytes and convert to base64url
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
  }

  /**
   * Generates an SVG string encoding the given table URL.
   */
  async generateQrCodeSvg(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      QRCode.toString(
        url,
        {
          type: 'svg',
          errorCorrectionLevel: 'H',
          margin: 1,
        },
        (err, svg) => {
          if (err) return reject(err);
          resolve(svg);
        }
      );
    });
  }

  /**
   * Generates a data URI for a PNG image of the QR code.
   * Useful for the "Download PNG" button on frontend.
   */
  async generateQrCodePngDataUri(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      QRCode.toDataURL(
        url,
        {
          errorCorrectionLevel: 'H',
          margin: 1,
        },
        (err, dataUri) => {
          if (err) return reject(err);
          resolve(dataUri);
        }
      );
    });
  }
}

export default TableService;
