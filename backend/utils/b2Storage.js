const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Backblaze B2 Configuration
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_REGION = process.env.B2_REGION || 'us-west-004';

// Maximum time to wait for a B2 upload before giving up (ms)
const B2_UPLOAD_TIMEOUT_MS = 8000;

// Create S3 client configured for Backblaze B2
const b2Client = new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
  requestHandler: {
    requestTimeout: B2_UPLOAD_TIMEOUT_MS,
    connectionTimeout: 4000,
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

  // Detect obvious placeholder values and fail fast — don't waste time on a real network call
  const placeholders = ['your-', 'Backblaze-Key', 'placeholder', 'changeme', 'your_key'];
  if (placeholders.some(p => B2_APPLICATION_KEY.toLowerCase().includes(p.toLowerCase()))) {
    throw new Error('B2 application key appears to be a placeholder value.');
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

    // Race the upload against a hard timeout so a bad credential never stalls the server
    await Promise.race([
      b2Client.send(command),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`B2 upload timed out after ${B2_UPLOAD_TIMEOUT_MS}ms`)), B2_UPLOAD_TIMEOUT_MS)
      ),
    ]);

    // Construct the public URL
    // Format: https://f004.backblazeb2.com/file/bucket-name/file-name
    const publicUrl = `https://f004.backblazeb2.com/file/${B2_BUCKET_NAME}/${fileName}`;
    
    console.log(`✅ Audio uploaded to B2: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    const statusCode = error?.$metadata?.httpStatusCode;
    const code = error?.Code || error?.name;
    console.error(`❌ Failed to upload to B2: ${code || 'Error'} (status ${statusCode || 'n/a'}) - ${error.message}`);
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



