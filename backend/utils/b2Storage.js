const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Backblaze B2 Configuration
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_REGION = process.env.B2_REGION || 'us-west-004';

// Create S3 client configured for Backblaze B2
const b2Client = new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
});

/**
 * Upload audio file to Backblaze B2
 * @param {Buffer} fileBuffer - The audio file buffer
 * @param {string} fileName - The name for the file (e.g., 'tts-123456.mp3')
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
async function uploadAudioToB2(fileBuffer, fileName) {
  if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET_NAME || !B2_ENDPOINT) {
    throw new Error('B2 credentials not configured. Please check environment variables.');
  }

  try {
    const uploadParams = {
      Bucket: B2_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: 'audio/mpeg',
      // Note: B2 doesn't support S3 ACLs - file visibility is controlled by bucket settings
      // If the bucket is public, files are automatically public
    };

    const command = new PutObjectCommand(uploadParams);
    await b2Client.send(command);

    // Construct the public URL
    // Format: https://f004.backblazeb2.com/file/bucket-name/file-name
    const publicUrl = `https://f004.backblazeb2.com/file/${B2_BUCKET_NAME}/${fileName}`;
    
    console.log(`✅ Audio uploaded to B2: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Failed to upload to B2:', error);
    throw new Error(`B2 upload failed: ${error.message}`);
  }
}

/**
 * Check if B2 is properly configured
 * @returns {boolean}
 */
function isB2Configured() {
  return !!(B2_KEY_ID && B2_APPLICATION_KEY && B2_BUCKET_NAME && B2_ENDPOINT);
}

module.exports = {
  uploadAudioToB2,
  isB2Configured,
};



