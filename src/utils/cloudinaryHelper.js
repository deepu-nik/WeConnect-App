import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const getExtension = (uri) => {
  const clean = String(uri || '').split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || null;
};

const getMimeType = (extension, type) => {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', heic: 'image/heic',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
    mp4: 'video/mp4', mov: 'video/quicktime',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip',
  };
  return map[extension] || (type === 'audio' ? 'audio/mp4' : 'application/octet-stream');
};

export const uploadToCloudinary = async (fileInput, type = 'auto', options = {}) => {
  if (!fileInput || !CLOUD_NAME || !UPLOAD_PRESET) {
    console.error('Cloudinary configuration is missing.');
    return null;
  }

  try {
    const file = typeof fileInput === 'string' ? new File(fileInput) : fileInput;
    const extension = getExtension(file?.name || file?.uri || '');
    const resourceType = type === 'image'
      ? 'image'
      : type === 'audio' || type === 'video'
        ? 'video'
        : 'auto';
    const filename = file?.name || ('upload_' + Date.now() + (extension ? '.' + extension : ''));
    const mimeType = file?.type || getMimeType(extension, type);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append(
      'folder',
      options.folder || (type === 'video'
        ? 'weconnect/stories/video'
        : type === 'image'
          ? 'weconnect/stories/image'
          : 'weconnect/uploads')
    );
    formData.append(
      'tags',
      options.tags || (type === 'video' || type === 'image'
        ? 'weconnect_story'
        : 'weconnect_media')
    );

    const response = await expoFetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();
    if (!response.ok || !data.secure_url) {
      console.error('Cloudinary upload failed:', data);
      return null;
    }

    if (options.returnMetadata) {
      return {
        secureUrl: data.secure_url,
        publicId: data.public_id || null,
        resourceType: data.resource_type || resourceType,
        format: data.format || null,
        bytes: Number(data.bytes || 0),
        duration: data.duration ? Number(data.duration) : null,
        width: data.width ? Number(data.width) : null,
        height: data.height ? Number(data.height) : null,
      };
    }

    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
};
