// Keys are now safely pulled from your .env file
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME; 
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET; 

/**
 * Uploads a file directly to Cloudinary from React Native.
 * @param {string} fileUri - The local URI of the file (from expo-image-picker or expo-av)
 * @param {string} type - 'image' or 'audio' (Cloudinary treats audio as 'video')
 * @returns {Promise<string|null>} - The secure URL of the uploaded file, or null if failed.
 */
export const uploadToCloudinary = async (fileUri, type = 'image') => {
  if (!fileUri) return null;

  try {
    // Cloudinary groups audio and video under the "video" resource type for their API endpoint
    const resourceType = type === 'audio' ? 'video' : 'image';
    const apiUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

    // Create form data to send to Cloudinary
    const data = new FormData();

    // We need to infer the file type/extension based on the URI
    let filename = fileUri.split('/').pop();
    
    // Fallbacks for missing extensions
    if (type === 'audio' && !filename.includes('.')) {
      filename = `${filename}.m4a`;
    } else if (type === 'image' && !filename.includes('.')) {
      filename = `${filename}.jpg`;
    }

    // Determine the MIME type
    let mimeType = type === 'audio' ? 'audio/m4a' : 'image/jpeg';
    if (filename.endsWith('.png')) mimeType = 'image/png';
    else if (filename.endsWith('.mp3')) mimeType = 'audio/mpeg';

    // Append the file and upload settings
    data.append('file', {
      uri: fileUri,
      type: 'multipart/form-data',
      name: `upload_${Date.now()}`,
    });
    
    data.append('upload_preset', UPLOAD_PRESET);

    // Make the direct API call to Cloudinary
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: data,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
      },
    });

    const responseData = await response.json();

    if (responseData.secure_url) {
      console.log('Upload successful:', responseData.secure_url);
      return responseData.secure_url;
    } else {
      console.error('Cloudinary Upload Error:', responseData);
      return null;
    }
  } catch (error) {
    console.error('Error in uploadToCloudinary helper:', error);
    return null;
  }
};